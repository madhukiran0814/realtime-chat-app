import { WebSocket } from 'ws';

// ─── WebSocket Types ─────────────────────────────────────────────────────────

export interface AuthenticatedSocket extends WebSocket {
  userId: string;
  connectionId: string;
  isAlive: boolean;
}

export interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
  id?: string; // client-side message ID for optimistic UI
}

// ─── WebSocket Event Types ───────────────────────────────────────────────────

export type WSEventType =
  // Client → Server
  | 'message:send'
  | 'message:read'
  | 'message:typing'
  | 'presence:ping'
  // Server → Client
  | 'message:new'
  | 'message:delivered'
  | 'message:seen'
  | 'message:typing_indicator'
  | 'presence:update'
  | 'chat:updated'
  | 'sync:messages'
  | 'error';

// ─── Event Payloads ──────────────────────────────────────────────────────────

export interface SendMessagePayload {
  chatId: string;
  content: string;
  replyToId?: string;
  clientMessageId?: string; // for optimistic UI
}

export interface ReadMessagePayload {
  chatId: string;
  messageId: string;
}

export interface TypingPayload {
  chatId: string;
  isTyping: boolean;
}

export interface PresencePingPayload {
  timestamp: number;
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface CreateChatBody {
  type: 'DIRECT' | 'GROUP' | 'CHANNEL';
  name?: string;
  memberIds: string[];
}

export interface AddMembersBody {
  memberIds: string[];
}

export interface UpdateMemberRoleBody {
  role: 'ADMIN' | 'MEMBER';
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

// ─── Fastify augmentation ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
