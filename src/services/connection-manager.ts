import { AuthenticatedSocket } from '../types';

/**
 * In-memory connection manager.
 * Maps userId → Set of active WebSocket connections (supports multiple tabs/devices).
 */
class ConnectionManager {
  private connections = new Map<string, Set<AuthenticatedSocket>>();

  add(userId: string, socket: AuthenticatedSocket) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(socket);
  }

  remove(userId: string, socket: AuthenticatedSocket) {
    const userSockets = this.connections.get(userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.connections.delete(userId);
      }
    }
  }

  getSockets(userId: string): Set<AuthenticatedSocket> {
    return this.connections.get(userId) || new Set();
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId) && this.connections.get(userId)!.size > 0;
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.connections.keys());
  }

  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0;
  }

  /** Send a message to all connections of a user */
  sendToUser(userId: string, type: string, payload: Record<string, unknown>) {
    const sockets = this.getSockets(userId);
    const message = JSON.stringify({ type, payload });
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  /** Send a message to all members of a chat */
  sendToChat(memberIds: string[], type: string, payload: Record<string, unknown>, excludeUserId?: string) {
    for (const memberId of memberIds) {
      if (memberId !== excludeUserId) {
        this.sendToUser(memberId, type, payload);
      }
    }
  }

  /** Broadcast to all connected users */
  broadcast(type: string, payload: Record<string, unknown>) {
    const message = JSON.stringify({ type, payload });
    for (const [, sockets] of this.connections) {
      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(message);
        }
      }
    }
  }
}

export const connectionManager = new ConnectionManager();
