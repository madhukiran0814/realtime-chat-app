import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { UserService } from '../services/user';

export async function userRoutes(app: FastifyInstance) {
  // Sync/upsert current user profile (called after Clerk login)
  app.post('/api/users/sync', { preHandler: [requireAuth] }, async (request, reply) => {
    const { username, email, avatarUrl } = request.body as {
      username: string;
      email: string;
      avatarUrl?: string;
    };

    if (!username || !email) {
      return reply.code(400).send({ error: 'username and email are required' });
    }

    const user = await UserService.upsertUser(request.userId!, { username, email, avatarUrl });
    return user;
  });

  // Get current user profile
  app.get('/api/users/me', { preHandler: [requireAuth] }, async (request) => {
    const user = await UserService.getUser(request.userId!);
    return user;
  });

  // Search users
  app.get('/api/users/search', { preHandler: [requireAuth] }, async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.length < 2) return [];
    return UserService.searchUsers(q, request.userId!);
  });
}
