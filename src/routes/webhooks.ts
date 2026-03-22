import { FastifyInstance } from 'fastify';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { prisma } from '../config/database';
import { env } from '../config/env';

interface ClerkUserEvent {
  data: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    image_url: string | null;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string | null;
    created_at: number;
    updated_at: number;
  };
  type: string;
}

export async function webhookRoutes(app: FastifyInstance) {
  // Clerk needs the raw body for signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post('/api/webhooks/clerk', async (request, reply) => {
    // Select webhook secret based on ?env=dev query param
    const queryEnv = (request.query as { env?: string }).env || 'prod';
    const webhookSecret =
      queryEnv === 'dev' ? env.CLERK_WEBHOOK_SECRET_DEV : env.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      app.log.error('Clerk webhook secret not configured');
      return reply.code(500).send({ error: 'Webhook secret not configured' });
    }

    // Verify the webhook signature
    let event: ClerkUserEvent;
    try {
      // Build a Request-like object for verifyWebhook
      const headers: Record<string, string> = {};
      for (const [key, val] of Object.entries(request.headers)) {
        if (typeof val === 'string') headers[key] = val;
      }

      const rawBody = request.body as Buffer;
      const req = new Request(`http://localhost${request.url}`, {
        method: 'POST',
        headers,
        body: rawBody,
      });

      event = (await verifyWebhook(req, { signingSecret: webhookSecret })) as ClerkUserEvent;
    } catch (err: any) {
      app.log.error(`Webhook verification failed: ${err.message}`);
      return reply.code(400).send({ error: 'Invalid webhook signature' });
    }

    // Extract primary email
    const primaryEmail = event.data.email_addresses?.find(
      (e) => e.id === event.data.primary_email_address_id,
    )?.email_address;

    switch (event.type) {
      case 'user.created': {
        try {
          const user = await prisma.user.create({
            data: {
              id: event.data.id,
              username: event.data.username || event.data.id,
              email: primaryEmail || `${event.data.id}@placeholder.local`,
              firstName: event.data.first_name,
              lastName: event.data.last_name,
              avatarUrl: event.data.image_url,
              createdAt: new Date(event.data.created_at),
            },
          });
          app.log.info(`Webhook: user.created → ${user.id}`);
          return reply.send({ user });
        } catch (err: any) {
          app.log.error(`Webhook user.created error: ${err.message}`);
          return reply.code(500).send({ error: err.message });
        }
      }

      case 'user.updated': {
        try {
          const user = await prisma.user.update({
            where: { id: event.data.id },
            data: {
              username: event.data.username || undefined,
              email: primaryEmail || undefined,
              firstName: event.data.first_name,
              lastName: event.data.last_name,
              avatarUrl: event.data.image_url,
            },
          });
          app.log.info(`Webhook: user.updated → ${user.id}`);
          return reply.send({ user });
        } catch (err: any) {
          app.log.error(`Webhook user.updated error: ${err.message}`);
          return reply.code(500).send({ error: err.message });
        }
      }

      case 'user.deleted': {
        try {
          const user = await prisma.user.update({
            where: { id: event.data.id },
            data: {
              active: false,
            },
          });
          app.log.info(`Webhook: user.deleted (soft) → ${user.id}`);
          return reply.send({ user });
        } catch (err: any) {
          app.log.error(`Webhook user.deleted error: ${err.message}`);
          return reply.code(500).send({ error: err.message });
        }
      }

      default: {
        app.log.info(`Webhook: unhandled event type → ${event.type}`);
        return reply.send({ success: true });
      }
    }
  });
}
