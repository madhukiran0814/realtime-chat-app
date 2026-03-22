import { prisma } from '../config/database';

export class UserService {
  /** Upsert a user from Clerk data */
  static async upsertUser(id: string, data: { username: string; email: string; avatarUrl?: string }) {
    return prisma.user.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }

  /** Get user by ID */
  static async getUser(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  /** Search users by username (excludes inactive users) */
  static async searchUsers(query: string, excludeUserId?: string) {
    return prisma.user.findMany({
      where: {
        username: { contains: query, mode: 'insensitive' },
        active: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, isOnline: true, lastSeen: true },
      take: 20,
    });
  }
}
