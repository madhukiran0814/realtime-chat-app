import { prisma } from '../config/database';
import { connectionManager } from './connection-manager';

export class PresenceService {
  /** Mark user as online when they connect */
  static async goOnline(userId: string, connectionId: string, userAgent?: string) {
    await prisma.$transaction([
      prisma.presence.upsert({
        where: { connectionId },
        create: { userId, connectionId, isOnline: true, userAgent },
        update: { isOnline: true, lastPing: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { isOnline: true, lastSeen: new Date() },
      }),
    ]);

    // Notify contacts about online status
    await this.broadcastPresence(userId, true);
  }

  /** Mark user as offline when they disconnect */
  static async goOffline(userId: string, connectionId: string) {
    await prisma.presence.delete({
      where: { connectionId },
    }).catch(() => {}); // ignore if already deleted

    // Only mark user offline if no other connections remain
    if (!connectionManager.isOnline(userId)) {
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
      await this.broadcastPresence(userId, false);
    }
  }

  /** Update last ping for a connection */
  static async ping(connectionId: string) {
    await prisma.presence.update({
      where: { connectionId },
      data: { lastPing: new Date() },
    }).catch(() => {});
  }

  /** Get online status for a list of user IDs */
  static async getPresence(userIds: string[]) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, isOnline: true, lastSeen: true },
    });
    return users;
  }

  /** Broadcast presence change to all chats the user is in */
  private static async broadcastPresence(userId: string, isOnline: boolean) {
    // Find all chats this user belongs to
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: {
        chat: {
          select: {
            members: { select: { userId: true } },
          },
        },
      },
    });

    // Collect unique member IDs
    const memberIds = new Set<string>();
    for (const m of memberships) {
      for (const member of m.chat.members) {
        memberIds.add(member.userId);
      }
    }
    memberIds.delete(userId);

    // Send presence update to all relevant users
    connectionManager.sendToChat(
      Array.from(memberIds),
      'presence:update',
      { userId, isOnline, lastSeen: new Date().toISOString() },
    );
  }
}
