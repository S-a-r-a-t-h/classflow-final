# ClassFlow — Production-Ready EdTech Platform

Live class platform with WebRTC video/audio, screen sharing, recording, in-app video player, and download.

---

## Features

- **Live Classes** — Teacher starts a class, students join via shareable link
- **WebRTC Video + Audio** — Peer-to-peer, works across the internet (STUN-based NAT traversal)
- **Screen Sharing** — Teacher or student can share their screen during class
- **Auto Recording** — Class is recorded automatically (browser MediaRecorder → server chunks)
- **In-App Video Player** — Watch recordings inside the app with full controls (play, pause, seek, volume, fullscreen)
- **Download Recordings** — One-click download of any recording
- **Chat** — Real-time chat sidebar during class
- **Raise Hand** — Students can raise/lower their hand
- **Mute Controls** — Teacher can mute individual students
- **Role-based Auth** — Teacher and Student roles with JWT authentication

---

## Project Structure

```
classflow/
├── server/                   # FastAPI backend
│   ├── main.py               # App entry point, CORS, static files
│   ├── signaling.py          # WebSocket signaling for WebRTC
│   ├── recording.py          # Recording upload, streaming, download
│   ├── requirements.txt
│   ├── routes/
│   │   ├── auth.py           # Login, register, /me
│   │   └── rooms.py          # Room CRUD + recording router
│   └── utils/
│       └── auth_utils.py     # JWT, bcrypt helpers
├── client/                   # Next.js frontend
│   ├── pages/
│   │   ├── index.tsx         # Landing / redirect
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── dashboard.tsx     # Rooms + Recordings tabs, video player
│   │   ├── room/[id].tsx     # Live class room (WebRTC + controls)
│   │   └── class/[id].tsx    # Student join page
│   ├── hooks/
│   │   ├── useWebRTC.ts      # WebRTC + screen share hook
│   │   ├── useRecording.ts   # MediaRecorder → server chunks
│   │   └── useAuth.tsx       # Auth context
│   ├── components/
│   │   ├── VideoTile.tsx
│   │   ├── ChatSidebar.tsx
│   │   └── ParticipantsSidebar.tsx
│   └── utils/
│       └── api.ts            # Axios client (reads NEXT_PUBLIC_API_URL)
├── recordings/               # Auto-created, stores .webm files
├── render.yaml               # One-click Render deployment
└── README.md
```

---

## Local Development

### 1. Backend

```bash
cd server
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env (copy from .env example)
cp .env .env.local

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at: http://localhost:8000  
API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd client
npm install

# Set backend URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Frontend runs at: http://localhost:3000

### 3. Test accounts (pre-seeded)

| Role    | Email                     | Password   |
|---------|---------------------------|------------|
| Teacher | teacher@classflow.com     | teacher123 |
| Student | student@classflow.com     | student123 |
| Student | student2@classflow.com    | student123 |

---

## Production Deployment

### Backend → Render

1. Push your code to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your repo, set **Root Directory** to `server`
4. Configure:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 10000`
   - **Environment:** Python 3

5. Add environment variables:
   ```
   SECRET_KEY        = <generate a long random string>
   ALGORITHM         = HS256
   ACCESS_TOKEN_EXPIRE_MINUTES = 1440
   RECORDINGS_DIR    = /var/data/recordings
   FRONTEND_URL      = https://your-app.vercel.app
   ```

6. Add a **Disk** (Render → your service → Disks):
   - Name: `recordings`
   - Mount Path: `/var/data/recordings`
   - Size: 5 GB (or more)

   > Without a persistent disk, recordings are lost every time the service restarts.

7. Note your backend URL: `https://classflow-backend.onrender.com`

---

### Alternative Backend → Railway

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select your repo, set root to `server/`
3. Add environment variables (same as Render above)
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Railway sets `$PORT` automatically
5. Add a Volume for `/var/data/recordings`

---

### Frontend → Vercel

1. Go to https://vercel.com → New Project → Import from GitHub
2. Set **Root Directory** to `client`
3. Framework: **Next.js** (auto-detected)
4. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL = https://classflow-backend.onrender.com
   ```
5. Deploy

---

## Environment Variables Reference

### Backend (`server/.env`)

| Variable                    | Default                        | Description                          |
|-----------------------------|--------------------------------|--------------------------------------|
| `SECRET_KEY`                | `classflow-secret-key-...`    | JWT signing secret — CHANGE THIS     |
| `ALGORITHM`                 | `HS256`                        | JWT algorithm                        |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440`                       | Token lifetime (24h)                 |
| `RECORDINGS_DIR`            | `recordings`                   | Directory to store .webm files       |
| `FRONTEND_URL`              | `*`                            | CORS allowed origin (set in prod)    |

### Frontend (`client/.env.local`)

| Variable               | Example                                        | Description              |
|------------------------|------------------------------------------------|--------------------------|
| `NEXT_PUBLIC_API_URL`  | `https://classflow-backend.onrender.com`       | Backend base URL         |

---

## Screen Sharing

Screen sharing uses `navigator.mediaDevices.getDisplayMedia()`.

- Works in: Chrome 72+, Firefox 66+, Edge 79+, Safari 13+
- On mobile: supported on Chrome Android; not supported on iOS Safari
- The teacher's screen replaces their video feed in all peer connections using `RTCRtpSender.replaceTrack()` — no renegotiation needed
- When screen sharing stops (via button or browser's native stop button), camera is automatically restored

---

## Recording System

Recordings flow:
1. Teacher clicks **Start Class** → frontend calls `POST /api/rooms/recordings/start`
2. `MediaRecorder` captures the local stream and sends 2-second chunks to `POST /api/rooms/recordings/chunk/{sessionId}`
3. Teacher clicks **End Class** → `MediaRecorder.stop()` fires final chunk, then `POST /api/rooms/recordings/stop/{sessionId}` closes the file
4. File saved as: `ClassName_TopicName_YYYY-MM-DD_HH-MM.webm`
5. Metadata (class name, topic, date, size) stored in `recordings/metadata.json`

**In-app playback** uses `GET /api/rooms/recordings/stream/{filename}` which supports HTTP range requests (206 Partial Content) so the browser can seek.

**Download** uses `GET /api/rooms/recordings/{filename}` which returns the file with `Content-Disposition: attachment`.

---

## WebRTC Architecture

```
Teacher ──── WebSocket (signaling) ────► Server
Student ──── WebSocket (signaling) ────► Server
Teacher ←────────── P2P WebRTC ─────────► Student
```

- Signaling server relays offer/answer/ICE candidates via WebSocket
- Media flows peer-to-peer (server never sees video/audio)
- ICE candidates are buffered until remote description is set (fixes race condition)
- STUN servers used: `stun.l.google.com:19302` (free, no TURN needed for most networks)

For enterprise firewalls that block P2P, add a TURN server:
```typescript
// In useWebRTC.ts, add to ICE_SERVERS:
{
  urls: "turn:your-turn-server.com:3478",
  username: "user",
  credential: "password"
}
```

Free TURN: https://www.metered.ca/tools/openrelay/

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/me` | Yes | Current user info |
| GET | `/api/rooms/` | Yes | List all rooms |
| POST | `/api/rooms/` | Teacher | Create room |
| GET | `/api/rooms/{id}` | Yes | Get room details |
| PATCH | `/api/rooms/{id}/active` | Teacher | Start/end class |
| GET | `/api/rooms/validate/{id}` | No | Validate class link |
| POST | `/api/rooms/recordings/start` | Teacher | Start recording session |
| POST | `/api/rooms/recordings/chunk/{id}` | Yes | Upload media chunk |
| POST | `/api/rooms/recordings/stop/{id}` | Yes | Finalize recording |
| GET | `/api/rooms/recordings/` | Yes | List recordings |
| GET | `/api/rooms/recordings/stream/{file}` | Yes | Stream for in-app player |
| GET | `/api/rooms/recordings/{file}` | Yes | Download recording |
| WS | `/ws/{roomId}` | Token in first message | WebRTC signaling |

---

## Upgrading to Production Database

The current implementation uses in-memory dicts (rooms, users reset on restart). To persist data, swap the dicts in `routes/auth.py` and `routes/rooms.py` for SQLAlchemy models:

```bash
pip install sqlalchemy psycopg2-binary alembic
```

Add `DATABASE_URL` to your environment variables and replace `_rooms` / `_users` dicts with DB queries. The recording system already uses the filesystem (no change needed).
