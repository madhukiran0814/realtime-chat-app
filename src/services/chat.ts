import { prisma } from '../config/database';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { ChatType, MemberRole } from '@prisma/client';

export class ChatService {
  /** Create a new chat (direct, group, or channel) */
  static async createChat(
    creatorId: string,
    type: ChatType,
    memberIds: string[],
    name?: string,
  ) {
    // For direct chats, check if one already exists between the two users
    if (type === 'DIRECT') {
      if (memberIds.length !== 1) {
        throw badRequest('Direct chats must have exactly one other member');
      }

      const existingChat = await prisma.chat.findFirst({
        where: {
          type: 'DIRECT',
          AND: [
            { members: { some: { userId: creatorId } } },
            { members: { some: { userId: memberIds[0] } } },
          ],
        },
        include: { members: { include: { user: true } } },
      });

      if (existingChat) return existingChat;
    }

    if (type === 'GROUP' && !name) {
      throw badRequest('Group chats must have a name');
    }

    // Ensure all member IDs are valid users
    const allMemberIds = [...new Set([creatorId, ...memberIds])];

    const chat = await prisma.chat.create({
      data: {
        type,
        name,
        createdBy: creatorId,
        members: {
          create: allMemberIds.map((userId) => ({
            userId,
            role: userId === creatorId ? 'OWNER' : 'MEMBER',
          })),
        },
      },
      include: { members: { include: { user: true } } },
    });

    return chat;
  }

  /** Get all chats for a user */
  static async getUserChats(userId: string) {
    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true, isOnline: true, lastSeen: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, senderId: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Compute unread counts
    const results = await Promise.all(
      chats.map(async (chat) => {
        const membership = chat.members.find((m) => m.userId === userId);
        const unreadCount = membership?.lastReadAt
          ? await prisma.message.count({
              where: {
                chatId: chat.id,
                createdAt: { gt: membership.lastReadAt },
                senderId: { not: userId },
              },
            })
          : await prisma.message.count({
              where: {
                chatId: chat.id,
                senderId: { not: userId },
              },
            });

        return {
          ...chat,
          lastMessage: chat.messages[0] || null,
          unreadCount,
          messages: undefined,
        };
      }),
    );

    return results;
  }

  /** Get a single chat by ID (with membership check) */
  static async getChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true, isOnline: true, lastSeen: true },
            },
          },
        },
      },
    });

    if (!chat) throw notFound('Chat');

    const isMember = chat.members.some((m) => m.userId === userId);
    if (!isMember) throw forbidden('You are not a member of this chat');

    return chat;
  }

  /** Add members to a group chat */
  static async addMembers(chatId: string, requesterId: string, memberIds: string[]) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) throw notFound('Chat');
    if (chat.type === 'DIRECT') throw badRequest('Cannot add members to a direct chat');

    const requester = chat.members.find((m) => m.userId === requesterId);
    if (!requester || requester.role === 'MEMBER') {
      throw forbidden('Only admins and owners can add members');
    }

    const existingMemberIds = new Set(chat.members.map((m) => m.userId));
    const newMemberIds = memberIds.filter((id) => !existingMemberIds.has(id));

    if (newMemberIds.length === 0) {
      throw badRequest('All specified users are already members');
    }

    await prisma.chatMember.createMany({
      data: newMemberIds.map((userId) => ({ chatId, userId, role: 'MEMBER' as MemberRole })),
    });

    return prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });
  }

  /** Remove a member from a group chat */
  static async removeMember(chatId: string, requesterId: string, targetUserId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) throw notFound('Chat');
    if (chat.type === 'DIRECT') throw badRequest('Cannot remove members from a direct chat');

    const requester = chat.members.find((m) => m.userId === requesterId);
    const target = chat.members.find((m) => m.userId === targetUserId);

    if (!requester || !target) throw notFound('Member');

    // Only owners/admins can remove others; anyone can remove themselves
    if (requesterId !== targetUserId) {
      if (requester.role === 'MEMBER') throw forbidden('Only admins can remove members');
      if (target.role === 'OWNER') throw forbidden('Cannot remove the owner');
    }

    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });
  }

  /** Update a member's role */
  static async updateMemberRole(
    chatId: string,
    requesterId: string,
    targetUserId: string,
    newRole: MemberRole,
  ) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) throw notFound('Chat');

    const requester = chat.members.find((m) => m.userId === requesterId);
    if (!requester || requester.role !== 'OWNER') {
      throw forbidden('Only the owner can change roles');
    }

    if (newRole === 'OWNER') throw badRequest('Cannot assign owner role');

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: targetUserId } },
      data: { role: newRole },
    });
  }

  /** Get member IDs for a chat */
  static async getChatMemberIds(chatId: string): Promise<string[]> {
    const members = await prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }
}
