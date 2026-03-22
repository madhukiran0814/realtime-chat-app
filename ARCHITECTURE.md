# Chat App — Architecture & Deployment Guide

## Folder Structure

```
chat-app-global/
├── prisma/
│   └── schema.prisma          # Database schema (6 tables)
├── public/
│   └── index.html             # Minimal test frontend
├── src/
│   ├── config/
│   │   ├── env.ts             # Environment variable config
│   │   └── database.ts        # Prisma client singleton
│   ├── middleware/
│   │   └── auth.ts            # Clerk JWT verification
│   ├── routes/
│   │   ├── users.ts           # User sync, search
│   │   ├── chats.ts           # Chat CRUD, group management
│   │   └── messages.ts        # Message history, read receipts
│   ├── services/
│   │   ├── connection-manager.ts  # In-memory WebSocket connection tracking
│   │   ├── presence.ts        # Online/offline, typing, last seen
│   │   ├── chat.ts            # Chat business logic
│   │   ├── message.ts         # Message send/read/sync logic
│   │   └── user.ts            # User CRUD
│   ├── ws/
│   │   └── handler.ts         # WebSocket event router + heartbeat
│   ├── types/
│   │   └── index.ts           # TypeScript types & interfaces
│   ├── utils/
│   │   └── errors.ts          # Custom error classes
│   └── server.ts              # Main entry point (Fastify + WS)
├── .env.example
├── tsconfig.json
└── package.json
```

## Database Schema

```
users              ← Synced from Clerk (id = Clerk user ID)
  ├── chat_members ← Many-to-many pivot (with role: OWNER/ADMIN/MEMBER)
  │   └── chats    ← DIRECT / GROUP / CHANNEL
  ├── messages     ← Sent messages (with reply threading)
  ├── message_reads← Per-user read receipts
  └── presence     ← Per-connection tracking (multi-tab support)
```

## WebSocket Event Design

### Client → Server

| Event             | Payload                                           | Description              |
|-------------------|---------------------------------------------------|--------------------------|
| `message:send`    | `{ chatId, content, replyToId?, clientMessageId }` | Send a message          |
| `message:read`    | `{ chatId, messageId }`                           | Mark message as read     |
| `message:typing`  | `{ chatId, isTyping }`                            | Typing indicator         |
| `presence:ping`   | `{ timestamp }`                                   | Keep-alive ping          |
| `sync:request`    | `{ since: ISO8601 }`                              | Request missed messages  |

### Server → Client

| Event                    | Payload                                             | Description              |
|--------------------------|-----------------------------------------------------|--------------------------|
| `connected`              | `{ userId, connectionId }`                          | Connection acknowledged  |
| `message:new`            | Full message object + `clientMessageId`             | New message broadcast    |
| `message:ack`            | `{ clientMessageId, messageId, createdAt }`         | Send confirmation        |
| `message:delivered`      | `{ messageId, chatId, deliveredTo[] }`              | Delivery receipt         |
| `message:seen`           | `{ messageId, chatId, seenBy, seenAt }`             | Read receipt             |
| `message:typing_indicator`| `{ chatId, userId, isTyping }`                     | Typing broadcast         |
| `presence:update`        | `{ userId, isOnline, lastSeen }`                    | Presence change          |
| `presence:pong`          | `{ timestamp }`                                     | Pong response            |
| `sync:messages`          | `{ messages[] }`                                    | Missed messages batch    |
| `error`                  | `{ message, clientMessageId? }`                     | Error notification       |

## REST API Endpoints

| Method | Path                                      | Auth | Description                  |
|--------|-------------------------------------------|------|------------------------------|
| POST   | `/api/users/sync`                         | Yes  | Upsert user from Clerk       |
| GET    | `/api/users/me`                           | Yes  | Get current user profile      |
| GET    | `/api/users/search?q=`                    | Yes  | Search users by username      |
| POST   | `/api/chats`                              | Yes  | Create chat (direct/group)    |
| GET    | `/api/chats`                              | Yes  | List user's chats + unread    |
| GET    | `/api/chats/:chatId`                      | Yes  | Get chat details              |
| POST   | `/api/chats/:chatId/members`              | Yes  | Add members (admin only)      |
| DELETE | `/api/chats/:chatId/members/:userId`      | Yes  | Remove member                 |
| PATCH  | `/api/chats/:chatId/members/:userId/role` | Yes  | Update member role            |
| GET    | `/api/chats/:chatId/messages`             | Yes  | Get messages (cursor pagination) |
| POST   | `/api/chats/:chatId/messages/:id/read`    | Yes  | Mark message as read          |
| GET    | `/health`                                 | No   | Health check                  |

## How This Avoids Vendor Lock-In

1. **Supabase is used ONLY as PostgreSQL** — no Realtime, no Edge Functions, no Storage. The app connects via standard PostgreSQL connection string through Prisma ORM.

2. **To migrate off Supabase**: change `DATABASE_URL` to any PostgreSQL instance (self-hosted, AWS RDS, Neon, etc.). Zero code changes needed.

3. **Clerk is isolated** to `src/middleware/auth.ts`. To swap auth providers, only replace the `verifyToken` function.

4. **WebSocket is handled by the app itself** using the `ws` library — no dependency on any managed WebSocket service.

## Scaling Path

### Phase 1 (Current — Free Tier)
- Single server instance
- In-memory connection tracking
- Supabase free tier PostgreSQL
- Deploy to Railway/Render/Fly.io free tier

### Phase 2 (Redis)
- Add Redis for:
  - Connection tracking across multiple server instances
  - Pub/Sub for cross-instance message broadcasting
  - Presence caching
  - Rate limiting
- Replace `ConnectionManager` with Redis adapter

### Phase 3 (Horizontal Scaling)
- Run multiple server instances behind a load balancer
- Use sticky sessions or Redis pub/sub for WebSocket routing
- Add message queue (BullMQ/Redis Streams) for async processing
- Separate WebSocket servers from REST API servers

### Phase 4 (Enterprise)
- Sharded PostgreSQL (by chat/user)
- CDN for media/attachments
- Elasticsearch for message search
- Monitoring (Prometheus + Grafana)

## Deployment Guide (Free)

### Option 1: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init
railway login
railway init

# Set environment variables
railway variables set DATABASE_URL="..."
railway variables set CLERK_SECRET_KEY="..."
railway variables set CORS_ORIGIN="https://your-app.railway.app"
railway variables set NODE_ENV="production"

# Deploy
railway up
```

### Option 2: Render
1. Push code to GitHub
2. Create a new **Web Service** on render.com
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables in dashboard
6. Deploy

### Option 3: Fly.io
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
fly launch
fly secrets set DATABASE_URL="..."
fly secrets set CLERK_SECRET_KEY="..."
fly deploy
```

### Database Setup (Supabase)
1. Create a project at supabase.com
2. Go to Settings → Database → Connection string
3. Copy the URI (use "Session mode" for Prisma)
4. Run migrations: `npx prisma db push`
