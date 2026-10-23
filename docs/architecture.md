# ODIN V2 — Architecture Document

**Version:** 0.1.0  
**Date:** 2026-10-23

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                       │
│  ┌─────────────────┐         ┌─────────────────┐                       │
│  │   Web App       │         │  Mobile App     │                       │
│  │   (React/TS)    │         │  (Expo/RN/TS)   │                       │
│  └────────┬────────┘         └────────┬────────┘                       │
└───────────│────────────────────────────│────────────────────────────────┘
            │                            │
            │        HTTPS / REST + SSE  │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ODIN BACKEND (FastAPI)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │  Auth    │ │  Conv.   │ │ Knowledge│ │  Runs    │ │ Approvals  │   │
│  │  Service │ │ Service  │ │ Service  │ │ Service  │ │ Service    │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘   │
│       │            │            │            │            │            │
│       └────────────┴────────────┴────────────┴────────────┘            │
│                            │                                            │
│              ┌─────────────▼─────────────┐                              │
│              │    Hermes Adapter         │                              │
│              │  (WebSocket Proxy)        │                              │
│              │  - Session management     │                              │
│              │  - Event processing       │                              │
│              │  - Approval proxy         │                              │
│              └─────────────┬─────────────┘                              │
└───────────────────────────│─────────────────────────────────────────────┘
                            │
                            │ WebSocket (local)
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    HERMES AGENT (v0.22.2)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │ Terminal │ │  File    │ │   Web    │ │ Browser  │ │  Skills    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │ Vision   │ │   Todo   │ │ Memory   │ │ Cronjob  │ │  Session   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Responsibilities

### 2.1 Odin Backend (`backend/`)

| Layer | Responsibility |
|-------|----------------|
| **API Routes** | HTTP endpoints, request/response validation |
| **Services** | Business logic, orchestration |
| **Hermes Adapter** | WebSocket connection pool, event translation |
| **Models** | SQLAlchemy ORM, database schema |
| **Schemas** | Pydantic v2, serialization/validation |
| **Security** | JWT, bcrypt, session management |
| **Database** | SQLite (async), migrations via Alembic |

### 2.2 Web App (`apps/web/`)

| Component | Responsibility |
|-----------|----------------|
| **Pages** | Route-level components (Chat, Knowledge, Activity, System) |
| **Components** | Reusable UI (Layout, LoadingScreen, MessageBubble) |
| **Contexts** | Auth state (login, logout, token refresh) |
| **Hooks** | Custom logic (useAuth) |
| **Lib** | API client (axios), utilities |

### 2.3 Mobile App (`apps/mobile/`)

| Component | Responsibility |
|-----------|----------------|
| **Screens** | Tab screens (Chat, Knowledge, Activity, System) |
| **Contexts** | Auth state with SecureStore |
| **Lib** | API client (axios + SecureStore) |

### 2.4 Hermes Agent (External)

- Runs as separate process: `hermes serve --port 9119`
- Provides tool execution environment
- WebSocket endpoints for chat (`/api/pty`)
- Manages toolsets, sessions, approvals

---

## 3. Data Flow

### 3.1 Chat Message Flow

```
User (Web/Mobile)
    │
    ▼
POST /api/conversations/{id}/runs { message, stream: true }
    │
    ▼
Odin Backend
    ├─ Creates Run record (status: queued)
    ├─ Creates user Message
    ├─ Creates placeholder assistant Message
    │
    ▼
Hermes Adapter
    ├─ Get/Create WebSocket to Hermes /api/pty
    ├─ Send user_message frame
    │
    ▼
Hermes Agent
    ├─ Process message with tools
    ├─ Stream tokens via WebSocket
    ├─ Tool calls/results via WebSocket
    ├─ Approval requests via WebSocket
    │
    ▼
Hermes Adapter (event processing)
    ├─ Token events → SSE "token"
    ├─ Tool calls → SSE "tool_call"
    ├─ Tool results → SSE "tool_result"
    ├─ Approval requests → SSE "approval_requested" + DB record
    ├─ Completion → SSE "run_completed" + update Run
    │
    ▼
Client (SSE)
    ├─ Receives streaming tokens
    ├─ Shows tool calls/results
    ├─ Prompts for approvals
    ├─ Updates run status
```

### 3.2 Approval Flow

```
Hermes Agent requests approval
    │
    ▼
Hermes Adapter receives "approval_requested"
    │
    ▼
Creates Approval record in DB (status: pending)
    │
    ▼
SSE "approval_requested" to client
    │
    ▼
User clicks Approve/Deny in UI
    │
    ▼
POST /api/approvals/{id}/approve|deny
    │
    ▼
Hermes Adapter sends "approval" frame to Hermes
    │
    ▼
Hermes continues execution
    │
    ▼
Updates Approval record (status: approved/denied)
```

---

## 4. Database Schema

### Core Tables

| Table | Key Fields |
|-------|------------|
| `users` | id, email, hashed_password, is_active, created_at |
| `user_sessions` | id, user_id, token_hash, expires_at |
| `conversations` | id, title, hermes_session_id, created_at, updated_at |
| `messages` | id, conversation_id, role, content, tool_calls, tool_results, run_id |
| `knowledge` | id, type, title, content, url, tags, created_at, updated_at |
| `runs` | id, conversation_id, hermes_run_id, hermes_session_id, status, started_at, completed_at, result_summary, error, events (JSON) |
| `approvals` | id, run_id, hermes_approval_id, operation, details (JSON), status, created_at, resolved_at, expires_at |

### Key Relationships

- `User` 1:N `Conversation` (via ownership in future)
- `Conversation` 1:N `Message`
- `Conversation` 1:N `Run`
- `Run` 1:N `Message` (via run_id)
- `Run` 1:N `Approval`
- `User` 1:N `UserSession`

---

## 5. Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY BOUNDARIES                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CLIENT (Browser/Mobile)                                     │
│  ├─ Access Token (JWT, 15min) in Authorization header       │
│  └─ Refresh Token in HttpOnly Cookie / SecureStore          │
│                                                              │
│  ──────────────── TLS ────────────────                     │
│                                                              │
│  ODIN BACKEND                                                │
│  ├─ Validates JWT on every request                          │
│  ├─ Rate limits auth endpoints                              │
│  ├─ CORS: only configured origins                           │
│  ├─ SECRET_KEY for JWT signing (env only)                   │
│  ├─ Passwords: bcrypt (never stored plain)                  │
│  └─ Hermes credentials: ONLY in backend env                 │
│                                                              │
│  ──────────────── Local WebSocket ────────────────         │
│                                                              │
│  HERMES AGENT                                                │
│  ├─ X-Hermes-Session-Token from backend                     │
│  ├─ Runs tools with user permissions                        │
│  └─ Approval gates for dangerous operations                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Credentials Management

| Credential | Location | Access |
|------------|----------|--------|
| `SECRET_KEY` | Backend `.env` | Backend only |
| `HERMES_SESSION_TOKEN` | Backend env (from Hermes) | Backend only |
| User passwords | DB (bcrypt hash) | Backend only |
| Access tokens | Client memory | Client only |
| Refresh tokens | HttpOnly cookie / SecureStore | Client only |
| Mobile tokens | Expo SecureStore | Mobile app only |

---

## 6. Future Evolution: Distributed Architecture

### Phase 1: Current (MVP)
- Single backend + local Hermes
- All clients → single backend → local Hermes

### Phase 2: Central Server + Executors
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  Central    │────▶│  Executor   │
│  (Web/Mob)  │     │  Odin API   │     │  (Notebook) │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                    ┌──────▼──────┐     ┌──────▼──────┐
                    │  Database   │     │  Hermes     │
                    │  (PostgreSQL)│     │  (Remote)   │
                    └─────────────┘     └─────────────┘
```

### Key Changes for Distribution

| Component | Current | Distributed |
|-----------|---------|-------------|
| Database | SQLite | PostgreSQL |
| Run Queue | In-memory | Redis/RabbitMQ |
| Executor Discovery | Hardcoded | Service registry |
| Session Affinity | Single process | Sticky sessions or shared state |
| Auth | Single JWT | Token exchange / mTLS |

---

## 7. Deployment Considerations

### Development
- Backend: `uvicorn --reload`
- Web: `vite dev` (proxy to backend)
- Mobile: `expo start` (Expo Go)
- Hermes: `hermes serve`

### Production
- Backend: Gunicorn + Uvicorn workers behind Nginx
- Web: Static files served by Nginx/CDN
- Mobile: EAS Build → App Store / Play Store
- Database: PostgreSQL with connection pooling
- Cache: Redis for SSE queues, rate limiting
- Monitoring: Prometheus + Grafana
- Logs: Structured JSON → Loki/ELK

---

*Architecture document generated from implementation.*