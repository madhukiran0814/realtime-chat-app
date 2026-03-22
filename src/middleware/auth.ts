import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { env } from '../config/env';

/**
 * Fastify preHandler hook — verifies Clerk JWT from Authorization header.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await clerkVerifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    request.userId = payload.sub;
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

/**
 * Verify a Clerk JWT token string (used for WebSocket auth).
 * Returns the user ID or null.
 */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const payload = await clerkVerifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    return payload.sub;
  } catch {
    return null;
  }
}
