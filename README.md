# ChatWave – Real-time Chat (MERN + Socket.io)

A real-time chat application with multiple rooms, live presence, typing indicators and persistent message history.

## Features
- **Real-time messaging** with Socket.io (no page refresh, no polling)
- Multiple chat rooms; create new rooms and they appear instantly for everyone
- **Online users** list per room, updated live
- **Typing indicators** ("Sara is typing…")
- Messages saved in MongoDB, with **"Load older messages"** cursor pagination
- JWT authentication for both REST routes **and the WebSocket handshake**
- Server-side validation (length limits, must be in the room) and a **rate limit** (5 messages / 3 s)
- Automatic reconnect: the client rejoins its room if the connection drops
- Responsive layout, with the room list as a slide-in drawer on mobile

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Axios, socket.io-client, Context API |
| Backend | Node.js, Express, Socket.io |
| Database | MongoDB + Mongoose |
| Auth | JWT, bcryptjs |

## Getting Started

### Prerequisites
Node.js 18+, and MongoDB (local) or a free MongoDB Atlas connection string.

### 1. Backend
```bash
cd server
npm install
cp .env.example .env     # set MONGO_URI and JWT_SECRET
npm run dev
```
Three default rooms (General, Random, Tech Talk) are created automatically on first start.

### 2. Frontend
```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173. **To see the real-time part, open a second browser window (or a private window), register a second user, and chat between them.**

## How the real-time flow works
```
Browser A                Server                     Browser B
   |  message:send  ---->  validate + rate limit        |
   |                       save to MongoDB              |
   | <---- message:new ---- io.to(room).emit ----> message:new
```

## Socket events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `room:join` | client → server | Join a room (leaves the previous one) |
| `message:send` | client → server | Send a message (acknowledged with `{ ok, error }`) |
| `typing` | client → server | Start/stop typing |
| `message:new` | server → room | New message |
| `room:users` | server → room | Current online users |
| `typing` | server → others | Someone is typing |
| `room:created` | server → all | A new room exists |

## REST API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/rooms` | List rooms |
| POST | `/api/rooms` | Create room |
| GET | `/api/rooms/:id/messages?before=<id>&limit=30` | Message history (cursor pagination) |

## Key Design Decisions
- **Socket authentication:** an `io.use()` middleware verifies the JWT before a socket may connect.
- **Server-authoritative:** the sender's identity comes from the verified token, never from the message payload.
- **Cursor pagination** using `_id` (indexed on `{ room, _id }`) instead of skip/offset, so it stays fast with large histories.
- **Join first, then fetch history, then merge and de-duplicate** so no message is lost in between.
- **Presence by user, not socket:** the same user in two tabs counts once.

## Deployment
- Database: MongoDB Atlas
- Backend: Render / Railway (needs WebSocket support). Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`
- Frontend: Vercel / Netlify. Set `VITE_API_URL` and `VITE_SOCKET_URL`

## Ideas to Extend
- Private/direct messages
- Image and file sharing
- Read receipts, message edit and delete
- Redis adapter to scale Socket.io across multiple servers
- Tests with Jest + socket.io-client
