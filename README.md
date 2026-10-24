# ODIN V2 — Personal AI Assistant

A personal AI assistant with chat, knowledge library, and agent execution capabilities, powered by Hermes Agent.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ODIN V2 Backend (FastAPI)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth      │  │ Conversations│  │ Knowledge Library   │  │
│  │   JWT       │  │   Chat       │  │  Notes, Links, etc  │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
│                         │                                    │
│              ┌──────────▼──────────┐                         │
│              │  Runs / Executions  │                         │
│              │  SSE (web) / WS (m) │                         │
│              └──────────┬──────────┘                         │
│                         │                                    │
│              ┌──────────▼──────────┐                         │
│              │  Hermes Gateway     │                         │
│              │  JSON-RPC over WS   │                         │
│              └──────────┬──────────┘                         │
└─────────────────────────│────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Hermes Agent v0.22  │
              │   (Local Notebook)    │
              │  http://127.0.0.1:9119│
              └───────────────────────┘
```

## Components

| Component | Tech Stack | Port |
|-----------|------------|------|
| **Backend** | FastAPI + SQLAlchemy + SQLite | 8000 |
| **Web App** | React 18 + TypeScript + Vite | 5173 |
| **Mobile App** | Expo + React Native + TypeScript | 8081 |
| **Hermes Agent** | Python (existing installation) | 9119 |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Hermes Agent installed and running (`hermes serve --port 9119`)

### 1. Start Hermes Agent

```bash
hermes serve --port 9119 --host 127.0.0.1
```

Verify it's running:
```bash
curl http://127.0.0.1:9119/api/health
```

### 2. Start Backend

```bash
cd backend
cp ../.env.example .env
# Edit .env - generate SECRET_KEY: python -c "import secrets; print(secrets.token_urlsafe(32))"

pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Start Web App

```bash
cd apps/web
npm install
npm run dev
```

Open http://127.0.0.1:5173

### 4. Start Mobile App

```bash
cd apps/mobile
cp .env.example .env
# Edit .env with your API URL

npm install
npm start
```

Scan QR code with Expo Go app, or press `a` for Android emulator, `i` for iOS simulator.

## Environment Variables

### Backend (.env)

```env
# API
API_HOST=127.0.0.1
API_PORT=8000

# Database
DATABASE_URL=sqlite+aiosqlite:///./odin.db

# Security (REQUIRED - generate with: python -c "import secrets; print(secrets.token_urlsafe(32))")
SECRET_KEY=your-32-char-secret-key

# CORS
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,exp://192.168.1.0/24:8081

# Hermes Integration
HERMES_API_URL=http://127.0.0.1:9119
# HERMES_SESSION_TOKEN is auto-read from Hermes env
```

### Web (.env)

```env
VITE_API_URL=http://127.0.0.1:8000/api
```

### Mobile (.env)

```env
# For iOS Simulator
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api

# For Android Emulator
# EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api

# For Physical Device (use your LAN IP)
# EXPO_PUBLIC_API_URL=http://192.168.1.xxx:8000/api
```

## API Documentation

- **Swagger UI**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc
- **Contract**: `docs/api-contract.md`

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| POST | `/api/conversations/{id}/runs` | Start agent run (JSON 202) |
| GET | `/api/conversations/{id}/runs/active` | Current run for reattach |
| GET | `/api/runs/{id}` | Get run status |
| GET | `/api/runs/{id}/events` | Replayable SSE event stream |
| WS | `/api/runs/{id}/ws` | WebSocket event stream (mobile) |
| POST | `/api/runs/{id}/stop` | Stop run |
| GET | `/api/approvals` | List pending approvals |
| POST | `/api/approvals/{id}/approve` | Approve operation |
| POST | `/api/approvals/{id}/deny` | Deny operation |
| GET | `/api/knowledge` | List knowledge items |
| POST | `/api/knowledge` | Create knowledge item |
| GET | `/api/system/status` | System health |

## Hermes Integration

The backend uses Hermes' structured `tui_gateway` JSON-RPC protocol over a
single multiplexed WebSocket (`/api/ws`). It streams tokens/tools/approvals to
clients over SSE (web) or WebSocket (mobile). See
`docs/hermes-communication.md` for the full protocol, event mapping, approval
round-trip, queueing and reconnect semantics.

### Required Hermes Setup

1. Run `hermes serve --port 9119 --host 127.0.0.1`
2. The `HERMES_DASHBOARD_SESSION_TOKEN` is auto-generated
3. Backend reads this token from environment at startup

### Toolsets Available

- `terminal` - Command execution
- `file` - File operations (read, write, patch, search)
- `web` - Web search & extraction
- `browser` - Browser automation (needs BROWSERBASE_API_KEY)
- `vision` - Image analysis (needs OPENROUTER_API_KEY)
- `skills` - Skill management
- `todo` - Task planning
- `memory` - Persistent memory
- `cronjob` - Scheduled tasks

## Development

### Backend Tests

```bash
cd backend
pytest -v
```

### Web Type Check

```bash
cd apps/web
npm run typecheck
npm run lint
```

### Mobile Type Check

```bash
cd apps/mobile
npm run typecheck
npm run lint
```

## Project Structure

```
odin-v2/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/routes/      # API endpoints
│   │   ├── core/            # Config, DB, Security
│   │   ├── integrations/hermes/  # Hermes WebSocket adapter
│   │   ├── models/          # SQLAlchemy models
│   │   └── schemas/         # Pydantic schemas
│   ├── tests/               # Pytest tests
│   └── pyproject.toml
├── apps/
│   ├── web/                 # React web app
│   │   ├── src/
│   │   │   ├── components/  # Reusable components
│   │   │   ├── contexts/    # React contexts (Auth)
│   │   │   ├── hooks/       # Custom hooks
│   │   │   ├── lib/         # API client, utils
│   │   │   └── pages/       # Page components
│   │   └── package.json
│   └── mobile/              # Expo mobile app
│       ├── app/             # Expo Router screens
│       │   ├── (tabs)/      # Tab screens
│       │   └── login.tsx
│       ├── contexts/        # Auth context
│       ├── lib/             # API client, utils
│       └── package.json
├── docs/
│   ├── api-contract.md      # API specification
│   ├── architecture.md      # Architecture docs
│   └── environment.md       # Environment report
├── scripts/                 # Utility scripts
├── .env.example
├── .gitignore
└── README.md
```

## Security

- **Hermes credentials never leave backend** - Only the backend has `HERMES_SESSION_TOKEN`
- **JWT tokens** - Access tokens (15min) + Refresh tokens (7 days, HttpOnly cookie / SecureStore)
- **CORS restricted** - Only configured origins allowed
- **Rate limiting** - Auth endpoints limited to 10 req/min
- **Input validation** - Pydantic schemas on all endpoints

## Mobile Network Access

For testing on a physical device:

1. Find your machine's LAN IP: `ip addr show` (Linux) or `ifconfig` (macOS)
2. Update backend `.env`: `API_HOST=0.0.0.0`
3. Update mobile `.env`: `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000/api`
4. Restart backend and mobile app

## Known Limitations (MVP)

- No push notifications (approvals visible while the app is open)
- No vector search / RAG for knowledge (basic text search only)
- Single Odin backend instance (event buses and queues are in-memory)
- One active run per conversation (later messages are queued)
- Stream auth uses `?token=` because EventSource/browser WebSocket cannot set headers
- No native mobile build/device run in this environment (typecheck passes)

## Future Roadmap

- [ ] Central Odin server + distributed executors
- [ ] Vector search for knowledge library
- [ ] Push notifications for approvals
- [ ] Offline-first mobile sync
- [ ] Multi-user workspaces
- [ ] Plugin system for custom tools

## License

MIT