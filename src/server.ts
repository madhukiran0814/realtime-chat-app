import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { env, validateEnv } from './config/env';
import { prisma } from './config/database';
import { userRoutes } from './routes/users';
import { chatRoutes } from './routes/chats';
import { messageRoutes } from './routes/messages';
import { webhookRoutes } from './routes/webhooks';
import { handleWebSocketConnection, startHeartbeat, stopHeartbeat } from './ws/handler';
import { AppError } from './utils/errors';

async function main() {
  validateEnv();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  // ─── CORS ──────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  // ─── WebSocket ─────────────────────────────────────────────────────────
  await app.register(websocket);

  app.register(async function wsRoutes(fastify) {
    fastify.get('/ws', { websocket: true }, (socket, request) => {
      handleWebSocketConnection(socket, {
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
      });
    });
  });

  // ─── Webhooks (separate plugin scope for raw body parsing) ─────────────
  await app.register(webhookRoutes);

  // ─── REST routes ───────────────────────────────────────────────────────
  await app.register(userRoutes);
  await app.register(chatRoutes);
  await app.register(messageRoutes);

  // ─── Static files (frontend) ──────────────────────────────────────────
  const publicDir = path.join(__dirname, '..', 'public');
  app.get('/', async (request, reply) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      reply.type('text/html').send(fs.readFileSync(indexPath, 'utf-8'));
    } else {
      reply.send({ status: 'Chat API is running', docs: '/api' });
    }
  });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ─── Clerk publishable key (for frontend) ─────────────────────────────
  app.get('/api/config', async () => ({
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
  }));

  // ─── Error handler ────────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  });

  // ─── Start ─────────────────────────────────────────────────────────────
  startHeartbeat();

  try {
    await prisma.$connect();
    app.log.info('Database connected');

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    stopHeartbeat();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
