import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { MessageService } from '../services/message';

export async function messageRoutes(app: FastifyInstance) {
  // Get messages for a chat (paginated)
  app.get('/api/chats/:chatId/messages', { preHandler: [requireAuth] }, async (request) => {
    const { chatId } = request.params as { chatId: string };
    const { cursor, limit } = request.query as { cursor?: string; limit?: string };

    return MessageService.getMessages(
      chatId,
      request.userId!,
      cursor,
      limit ? parseInt(limit, 10) : 50,
    );
  });

  // Mark messages as read (REST fallback; also available via WebSocket)
  app.post('/api/chats/:chatId/messages/:messageId/read', { preHandler: [requireAuth] }, async (request) => {
    const { chatId, messageId } = request.params as { chatId: string; messageId: string };
    await MessageService.markAsRead(chatId, request.userId!, messageId);
    return { success: true };
  });
}
