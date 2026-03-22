import { prisma } from '../config/database';
import { connectionManager } from './connection-manager';
import { ChatService } from './chat';
import { forbidden, notFound } from '../utils/errors';

export class MessageService {
  /** Send a message to a chat */
  static async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    replyToId?: string,
    clientMessageId?: string,
  ) {
    // Verify sender is a member
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: senderId } },
    });
    if (!membership) throw forbidden('You are not a member of this chat');

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        replyToId,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        replyTo: {
          select: { id: true, content: true, senderId: true, sender: { select: { username: true } } },
        },
      },
    });

    // Update chat's updatedAt
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Auto-mark as read by sender
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: senderId } },
      data: { lastReadAt: new Date(), lastReadMsgId: message.id },
    });

    // Broadcast to all chat members EXCEPT the sender (sender already has optimistic msg)
    const memberIds = await ChatService.getChatMemberIds(chatId);
    connectionManager.sendToChat(
      memberIds,
      'message:new',
      { ...message, clientMessageId },
      senderId, // exclude sender
    );

    return { message, memberIds };
  }

  /** Get messages for a chat with cursor-based pagination */
  static async getMessages(chatId: string, userId: string, cursor?: string, limit = 50) {
    // Verify membership
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!membership) throw forbidden('You are not a member of this chat');

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        replyTo: {
          select: { id: true, content: true, senderId: true, sender: { select: { username: true } } },
        },
        reads: {
          select: { userId: true, readAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra to check if there's a next page
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { messages: items.reverse(), nextCursor, hasMore };
  }

  /** Mark messages as read — marks the given message AND all prior unread messages in the chat */
  static async markAsRead(chatId: string, userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw notFound('Message');

    // Get the user's current read cursor
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    // Find all unread messages from others up to (and including) this message
    const createdAtFilter = membership?.lastReadAt
      ? { gt: membership.lastReadAt, lte: message.createdAt }
      : { lte: message.createdAt };

    const unreadMessages = await prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: userId },
        createdAt: createdAtFilter,
        deletedAt: null,
      },
      select: { id: true, senderId: true },
    });

    // Update read cursor
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date(), lastReadMsgId: messageId },
    });

    // Batch create read receipts for all unread messages
    const now = new Date();
    const seenAt = now.toISOString();
    for (const msg of unreadMessages) {
      await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId: msg.id, userId } },
        create: { messageId: msg.id, userId },
        update: { readAt: now },
      });

      // Update message status in DB
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: 'SEEN' },
      });

      // Notify each sender that their message was seen
      connectionManager.sendToUser(msg.senderId, 'message:seen', {
        messageId: msg.id,
        chatId,
        seenBy: userId,
        seenAt,
      });
    }
  }

  /** Mark a message as delivered in DB and notify sender */
  static async markAsDelivered(chatId: string, messageId: string, deliveredToUserId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, status: true },
    });
    if (!message || message.senderId === deliveredToUserId) return;

    // Only upgrade SENT → DELIVERED (don't downgrade SEEN)
    if (message.status === 'SENT') {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'DELIVERED' },
      });
    }

    connectionManager.sendToUser(message.senderId, 'message:delivered', {
      messageId,
      chatId,
      deliveredTo: [deliveredToUserId],
    });
  }

  /** Mark ALL undelivered messages across all chats as delivered for this user */
  static async markAllAsDelivered(userId: string) {
    // Find all chats this user is in
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    const chatIds = memberships.map((m) => m.chatId);
    if (chatIds.length === 0) return;

    // Find all SENT messages from others in those chats
    const undelivered = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        senderId: { not: userId },
        status: 'SENT',
        deletedAt: null,
      },
      select: { id: true, chatId: true, senderId: true },
    });

    if (undelivered.length === 0) return;

    // Batch update to DELIVERED
    await prisma.message.updateMany({
      where: {
        id: { in: undelivered.map((m) => m.id) },
        status: 'SENT',
      },
      data: { status: 'DELIVERED' },
    });

    // Notify each sender
    const bySender = new Map<string, { messageId: string; chatId: string }[]>();
    for (const msg of undelivered) {
      if (!bySender.has(msg.senderId)) bySender.set(msg.senderId, []);
      bySender.get(msg.senderId)!.push({ messageId: msg.id, chatId: msg.chatId });
    }

    for (const [senderId, msgs] of bySender) {
      for (const { messageId, chatId } of msgs) {
        connectionManager.sendToUser(senderId, 'message:delivered', {
          messageId,
          chatId,
          deliveredTo: [userId],
        });
      }
    }
  }

  /** Get messages since a timestamp (for sync on reconnect) */
  static async getMessagesSince(userId: string, since: Date) {
    // Get all chats the user is a member of
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    const chatIds = memberships.map((m) => m.chatId);

    const messages = await prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        createdAt: { gt: since },
        deletedAt: null,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        replyTo: {
          select: { id: true, content: true, senderId: true, sender: { select: { username: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500, // cap to prevent huge payloads
    });

    return messages;
  }
}
