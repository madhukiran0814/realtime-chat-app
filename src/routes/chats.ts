import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { ChatService } from '../services/chat';
import { CreateChatBody, AddMembersBody, UpdateMemberRoleBody } from '../types';

export async function chatRoutes(app: FastifyInstance) {
  // Create a new chat
  app.post('/api/chats', { preHandler: [requireAuth] }, async (request, reply) => {
    const { type, name, memberIds } = request.body as CreateChatBody;

    if (!type || !memberIds || !Array.isArray(memberIds)) {
      return reply.code(400).send({ error: 'type and memberIds are required' });
    }

    const chat = await ChatService.createChat(request.userId!, type, memberIds, name);
    return reply.code(201).send(chat);
  });

  // Get all chats for current user
  app.get('/api/chats', { preHandler: [requireAuth] }, async (request) => {
    return ChatService.getUserChats(request.userId!);
  });

  // Get a specific chat
  app.get('/api/chats/:chatId', { preHandler: [requireAuth] }, async (request) => {
    const { chatId } = request.params as { chatId: string };
    return ChatService.getChat(chatId, request.userId!);
  });

  // Add members to a group chat
  app.post('/api/chats/:chatId/members', { preHandler: [requireAuth] }, async (request) => {
    const { chatId } = request.params as { chatId: string };
    const { memberIds } = request.body as AddMembersBody;
    return ChatService.addMembers(chatId, request.userId!, memberIds);
  });

  // Remove a member from a group chat
  app.delete('/api/chats/:chatId/members/:userId', { preHandler: [requireAuth] }, async (request) => {
    const { chatId, userId } = request.params as { chatId: string; userId: string };
    await ChatService.removeMember(chatId, request.userId!, userId);
    return { success: true };
  });

  // Update a member's role
  app.patch('/api/chats/:chatId/members/:userId/role', { preHandler: [requireAuth] }, async (request) => {
    const { chatId, userId } = request.params as { chatId: string; userId: string };
    const { role } = request.body as UpdateMemberRoleBody;
    await ChatService.updateMemberRole(chatId, request.userId!, userId, role);
    return { success: true };
  });
}
