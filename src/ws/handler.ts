import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { verifyToken } from '../middleware/auth';
import { connectionManager } from '../services/connection-manager';
import { PresenceService } from '../services/presence';
import { MessageService } from '../services/message';
import { ChatService } from '../services/chat';
import { prisma } from '../config/database';
import { AuthenticatedSocket, WSMessage, SendMessagePayload, ReadMessagePayload, TypingPayload } from '../types';

// Debounce map for typing events: chatId:userId → timeout
const typingTimers = new Map<string, NodeJS.Timeout>();

export async function handleWebSocketConnection(socket: WebSocket, request: { url?: string; headers: Record<string, string | string[] | undefined> }) {
  const ws = socket as AuthenticatedSocket;

  // ─── Authenticate ────────────────────────────────────────────────────────
  // Token can come from query param or Sec-WebSocket-Protocol header
  let token: string | null = null;

  // Try query string first
  try {
    const url = new URL(request.url || '', 'http://localhost');
    token = url.searchParams.get('token');
  } catch {}

  // Fallback to protocol header
  if (!token) {
    const protocol = request.headers['sec-websocket-protocol'];
    if (typeof protocol === 'string') {
      token = protocol;
    }
  }

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  const userId = await verifyToken(token);
  if (!userId) {
    ws.close(4001, 'Invalid token');
    return;
  }

  // ─── Setup connection ──────────────────────────────────────────────────
  ws.userId = userId;
  ws.connectionId = uuid();
  ws.isAlive = true;

  connectionManager.add(userId, ws);
  await PresenceService.goOnline(userId, ws.connectionId);

  console.log(`[WS] User ${userId} connected (${ws.connectionId})`);

  // Send connection acknowledgment
  ws.send(JSON.stringify({
    type: 'connected',
    payload: { userId, connectionId: ws.connectionId },
  }));

  // ─── Heartbeat ────────────────────────────────────────────────────────
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // ─── Message handler ─────────────────────────────────────────────────
  ws.on('message', async (data) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString());
      await routeMessage(ws, msg);
    } catch (err) {
      sendError(ws, 'Invalid message format');
    }
  });

  // ─── Disconnect ──────────────────────────────────────────────────────
  ws.on('close', async () => {
    console.log(`[WS] User ${userId} disconnected (${ws.connectionId})`);
    connectionManager.remove(userId, ws);
    await PresenceService.goOffline(userId, ws.connectionId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${userId}:`, err.message);
  });
}

async function routeMessage(ws: AuthenticatedSocket, msg: WSMessage) {
  switch (msg.type) {
    case 'message:send':
      await handleSendMessage(ws, msg.payload as unknown as SendMessagePayload);
      break;

    case 'message:read':
      await handleReadMessage(ws, msg.payload as unknown as ReadMessagePayload);
      break;

    case 'message:typing':
      await handleTyping(ws, msg.payload as unknown as TypingPayload);
      break;

    case 'presence:ping':
      await PresenceService.ping(ws.connectionId);
      ws.send(JSON.stringify({ type: 'presence:pong', payload: { timestamp: Date.now() } }));
      break;

    case 'message:confirm_delivery':
      await handleConfirmDelivery(ws, msg.payload as unknown as ReadMessagePayload);
      break;

    case 'message:deliver_all':
      await handleDeliverAll(ws);
      break;

    case 'sync:request': {
      const since = (msg.payload as { since?: string }).since;
      if (since) {
        const messages = await MessageService.getMessagesSince(ws.userId, new Date(since));
        ws.send(JSON.stringify({ type: 'sync:messages', payload: { messages } }));
      }
      break;
    }

    default:
      sendError(ws, `Unknown event type: ${msg.type}`);
  }
}

async function handleSendMessage(ws: AuthenticatedSocket, payload: SendMessagePayload) {
  try {
    const { message } = await MessageService.sendMessage(
      payload.chatId,
      ws.userId,
      payload.content,
      payload.replyToId,
      payload.clientMessageId,
    );
    // Acknowledge to sender (updates optimistic ID)
    ws.send(JSON.stringify({
      type: 'message:ack',
      payload: {
        clientMessageId: payload.clientMessageId,
        messageId: message.id,
        createdAt: message.createdAt,
      },
    }));
    // NOTE: delivery receipts are sent when recipients confirm via message:confirm_delivery
  } catch (err: any) {
    sendError(ws, err.message || 'Failed to send message', payload.clientMessageId);
  }
}

async function handleReadMessage(ws: AuthenticatedSocket, payload: ReadMessagePayload) {
  try {
    await MessageService.markAsRead(payload.chatId, ws.userId, payload.messageId);
  } catch (err: any) {
    sendError(ws, err.message || 'Failed to mark as read');
  }
}

async function handleConfirmDelivery(ws: AuthenticatedSocket, payload: ReadMessagePayload) {
  try {
    await MessageService.markAsDelivered(payload.chatId, payload.messageId, ws.userId);
  } catch {}
}

async function handleDeliverAll(ws: AuthenticatedSocket) {
  try {
    await MessageService.markAllAsDelivered(ws.userId);
  } catch (err) {
    console.error(`[WS] deliver_all error for ${ws.userId}:`, err);
  }
}

async function handleTyping(ws: AuthenticatedSocket, payload: TypingPayload) {
  const key = `${payload.chatId}:${ws.userId}`;

  // Debounce: clear existing timer
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);

  if (payload.isTyping) {
    // Auto-stop typing after 5 seconds
    typingTimers.set(
      key,
      setTimeout(() => {
        broadcastTyping(ws.userId, payload.chatId, false);
        typingTimers.delete(key);
      }, 5000),
    );
  } else {
    typingTimers.delete(key);
  }

  await broadcastTyping(ws.userId, payload.chatId, payload.isTyping);
}

async function broadcastTyping(userId: string, chatId: string, isTyping: boolean) {
  const memberIds = await ChatService.getChatMemberIds(chatId);
  connectionManager.sendToChat(
    memberIds,
    'message:typing_indicator',
    { chatId, userId, isTyping },
    userId,
  );
}

function sendError(ws: AuthenticatedSocket, message: string, clientMessageId?: string) {
  ws.send(JSON.stringify({
    type: 'error',
    payload: { message, clientMessageId },
  }));
}

// ─── Heartbeat interval (runs globally) ────────────────────────────────────
let heartbeatInterval: NodeJS.Timeout | null = null;

export function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    for (const userId of connectionManager.getOnlineUserIds()) {
      for (const ws of connectionManager.getSockets(userId)) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 30000);
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
