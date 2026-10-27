# ODIN V2 — Implementation Report

**Date:** 2026-10-24  
**Version:** 0.1.0 (MVP)  
**Status:** Backend + Web App functional, Mobile App typechecked (native run pending)  
**Hermes integration:** structured `tui_gateway` JSON-RPC (not PTY)

---

## 1. Architecture Summary

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

---

## 2. Components Implemented

### 2.1 Backend (FastAPI) — `/home/caua/odin-v2/backend/`

| Module | Status | Description |
|--------|--------|-------------|
| **Config** | ✅ | Pydantic Settings with env validation |
| **Database** | ✅ | SQLAlchemy 2.0 + aiosqlite, async sessions |
| **Models** | ✅ | User, Conversation, Message, KnowledgeItem, Run, Approval, UserSession |
| **Schemas** | ✅ | Pydantic v2 models for all API contracts |
| **Security** | ✅ | JWT (HS256), bcrypt, refresh tokens in HttpOnly cookies |
| **Auth Routes** | ✅ | `/login`, `/logout`, `/refresh`, `/me` |
| **Conversation Routes** | ✅ | CRUD + message listing |
| **Run Routes** | ✅ | Create (JSON 202), active-run lookup, replayable SSE, WebSocket, stop |
| **Approval Routes** | ✅ | List, Get, Approve, Deny (live Hermes round-trip) |
| **Knowledge Routes** | ✅ | CRUD with filters (type, tags, search) |
| **System Routes** | ✅ | Health, Status (Hermes + DB) |
| **Hermes Gateway** | ✅ | Multiplexed JSON-RPC over `/api/ws`, sessions, events, approvals |
| **Run Manager** | ✅ | Queueing, replayable event bus, persistence, recovery |
| **Tests** | ✅ | 8 passing tests (models, DB) + live E2E checks |

**Key Features:**
- Structured Hermes JSON-RPC gateway (no PTY parsing)
- Token streaming, tool lifecycle and reasoning events
- Inline approvals over the original `srq-*` server request
- Replayable SSE (`Last-Event-ID` / `after`) for web and WebSocket for mobile
- One active run per conversation with an explicit queue
- Stale-run recovery and approval expiry on restart
- Conversations resume their durable Hermes transcript
- CORS restricted to configured origins
- Rate limiting on auth endpoints

### 2.2 Web App (React + TypeScript) — `/home/caua/odin-v2/apps/web/`

| Page | Status | Features |
|------|--------|----------|
| **Login** | ✅ | Email/password, show/hide password, error handling |
| **Chat** | ✅ | Streaming tokens, live tools/reasoning, inline approvals, queue, stop, reconnect, deep links |
| **Knowledge** | ✅ | Grid view, search, filters, modal create/edit/delete |
| **Activity** | ✅ | Runs list (expandable), approvals (approve/deny) |
| **System** | ✅ | Component health, Hermes status, static info cards |

**Tech Stack:**
- React 18 + TypeScript + Vite
- Tailwind CSS (custom Odin palette: black/graphite/orange)
- React Router v6
- Axios with auto token refresh
- Lucide React icons

### 2.3 Mobile App (Expo + React Native) — `/home/caua/odin-v2/apps/mobile/`

| Screen | Status | Notes |
|--------|--------|-------|
| **Login** | ✅ | SecureStore for tokens |
| **Chat (Tab)** | ✅ | Conversation picker, WebSocket streaming, live tools, inline approvals, queue |
| **Knowledge (Tab)** | ✅ | List, search, filters, modal CRUD |
| **Activity (Tab)** | ✅ | Runs + Approvals |
| **System (Tab)** | ✅ | Health status cards |

**Notes:**
- Scaffolded with Expo Router v3
- NativeWind (Tailwind) for styling
- SecureStore for token persistence
- Chat uses `/api/runs/{id}/ws` with replay (`after`) and exponential backoff
- Native build requires `bob` (not available in current environment)

### 2.4 Documentation

| Document | Path | Status |
|----------|------|--------|
| API Contract | `docs/api-contract.md` | ✅ Complete |
| Hermes Communication | `docs/hermes-communication.md` | ✅ Complete |
| Environment Report | `docs/environment.md` | ✅ Complete |
| Architecture | `docs/architecture.md` | ✅ Complete |
| Root README | `README.md` | ✅ Complete |
| Backend README | `backend/README.md` | ✅ Complete |
| Web Package | `apps/web/package.json` | ✅ |
| Mobile Package | `apps/mobile/package.json` | ✅ |

---

## 3. Commands to Run

### Prerequisites
```bash
# Start Hermes Agent (required)
hermes serve --port 9119 --host 127.0.0.1

# Verify Hermes is running
curl http://127.0.0.1:9119/api/health
```

### Backend
```bash
cd /home/caua/odin-v2/backend
source venv/bin/activate
cp ../.env.example .env
# Edit .env with SECRET_KEY (generate: python -c "import secrets; print(secrets.token_urlsafe(32))")
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# API docs: http://127.0.0.1:8000/docs
# Health: http://127.0.0.1:8000/api/health
```

### Web App
```bash
cd /home/caua/odin-v2/apps/web
npm install
npm run dev
# Opens http://127.0.0.1:5173 (proxies /api to backend)
```

### Mobile App (requires native build environment)
```bash
cd /home/caua/odin-v2/apps/mobile
npm install
# For development (requires bob for react-native-screens):
# npm start
# For physical device: edit .env with LAN IP
# EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000/api
```

### Run Tests
```bash
# Backend
cd /home/caua/odin-v2/backend
source venv/bin/activate
pytest -v

# Web
cd /home/caua/odin-v2/apps/web
npm run typecheck
npm run lint
```

---

## 4. API Contract Highlights

### Auth
- `POST /api/auth/login` → `{ access_token, expires_in }`
- `POST /api/auth/refresh` → new access token
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Conversations
- `GET /api/conversations` (paginated)
- `POST /api/conversations` → creates conversation + optional initial message
- `GET /api/conversations/{id}/messages`

### Runs (Agent Executions)
- `POST /api/conversations/{id}/runs` → `202` JSON run (`queued`/`running`); execution is a background task
- `GET /api/conversations/{id}/runs/active` → current run (prefers running/waiting over queued)
- `GET /api/runs/{id}` → status, result, persisted events
- `GET /api/runs/{id}/events?after=<seq>` → replayable SSE (`Last-Event-ID` supported)
- `WS /api/runs/{id}/ws?after=<seq>` → same events over WebSocket (mobile)
- `POST /api/runs/{id}/stop` → interrupt; returns `cancelled` or `stopping`

### Approvals
- `GET /api/approvals?status=pending&run_id=…` → pending/resolved
- `POST /api/approvals/{id}/approve?choice=once|session|always` → send decision to Hermes
- `POST /api/approvals/{id}/deny?choice=deny` → deny and let the turn finish

### Knowledge
- `GET /api/knowledge` (filters: type, tags, q)
- `POST /api/knowledge` → create
- `PATCH/DELETE /api/knowledge/{id}`

### System
- `GET /api/health` → lightweight
- `GET /api/system/status` → full component health

---

## 5. Hermes Integration Details

The backend speaks the structured `tui_gateway` JSON-RPC protocol over one
multiplexed WebSocket (`/api/ws`). The old PTY parser is gone. Full details are
in `docs/hermes-communication.md`.

### Gateway Handshake
1. Connect to `ws://…/api/ws?token=<HERMES_SESSION_TOKEN>`.
2. Wait for `gateway.ready`.
3. Send `client.capabilities {"server_requests": true}` (required for approvals).
4. Issue JSON-RPC calls (`session.create`, `session.resume`, `prompt.submit`,
   `session.interrupt`, `approval.respond`).

### Session Correlation
- Odin `conversation` → `conversations.hermes_session_id` (durable stored id)
- Each Odin run → `runs.hermes_session_id` (live Hermes id)
- Conversations resume the durable transcript; only a failed resume creates a
  new Hermes session.

### Event Mapping
Hermes events (`message.delta`, `tool.start`, `tool.complete`,
`message.complete`, `approval` server requests, …) are normalized to Odin
events (`token`, `tool_call`, `tool_result`, `run_completed`, …), persisted
where useful, and fanned out with a per-run sequence number.

### Approvals
Hermes server requests carry an `srq-*` id. ODIN persists the approval, pauses
the run in `waiting_approval`, and answers the original JSON-RPC request. If the
frame is gone after a reconnect, it falls back to `approval.respond`. Choices:
`once`, `session`, `always`, `deny`.

### Streaming
- SSE for the web, with `Last-Event-ID` / `after` replay and heartbeats.
- WebSocket for mobile, same event objects, replay via `after`.
- One active run per conversation; later runs are queued with a position.
- Terminal events are published only after the DB commit.
- Startup recovery fails stale runs and expires their approvals.

### Toolsets Available
`terminal`, `file`, `web`, `browser`, `vision`, `skills`, `todo`, `cronjob`, `memory`, `session_search`, `image_gen`, `tts`, `skills_hub`

---

## 6. Test Results

### Backend Tests
```
============================= test session starts ==============================
tests/test_models.py::test_settings_load PASSED
tests/test_models.py::test_models_import PASSED
tests/test_models.py::test_database_init PASSED
tests/test_models.py::test_user_model PASSED
tests/test_models.py::test_conversation_model PASSED
tests/test_models.py::test_knowledge_model PASSED
tests/test_models.py::test_run_model PASSED
tests/test_models.py::test_approval_model PASSED
============================== 8 passed in 0.69s ==============================
```

### Web Build
```
vite v5.4.21 building for production...
✓ 1628 modules transformed.
dist/index.html                   0.81 kB │ gzip:   0.46 kB
dist/assets/index-DpkkTYya.css   32.87 kB │ gzip:   5.78 kB
dist/assets/index-DxAWtYJp.js   323.63 kB │ gzip: 100.49 kB
✓ built in 6.04s
```

### Mobile Typecheck
```
> odin-mobile@0.1.0 typecheck
> tsc --noEmit
(no errors)
```

### Live Integration Tests
- ✅ Token streaming, generated title, persisted assistant message
- ✅ Tool call/result persistence with `call_id` and duration
- ✅ Approval request → REST pending list → SSE replay → approve `once` →
  `approval_resolved` → command executed → `run_completed`
- ✅ Deny → `BLOCKED` tool result → run completes → target untouched
- ✅ Second run while first waits → `run_queued` (position) → serialized start
- ✅ WebSocket transport (mobile): live turn streamed with ordered `seq` and
  replayed from `after=0`; SSE snapshot fallback returned the DB status
- ✅ Reload while waiting → active-run lookup returns the waiting run → approval
  card restored
- ✅ Terminal event arrives after the DB commit (immediate GET sees `completed`)
- ✅ Stop while waiting for approval → run `cancelled`, card cleared
- ✅ Web UI smoke test (Playwright/Chromium): send, queue, reload, approve,
  deep link, no console errors

### Manual Integration Test
- ✅ Hermes health check via backend
- ✅ User registration + login (JWT)
- ✅ System status shows Hermes connected
- ✅ Web app builds and runs against the live backend
- ✅ Backend starts and serves API docs

---

## 7. Known Limitations (MVP)

| Limitation | Impact | Workaround |
|------------|--------|------------|
| In-memory event bus/queue | One backend worker only; no horizontal scale | Redis/durable queue before scaling out |
| Replay window (3000 events, 15 min TTL) | Very old runs only expose `runs.events`/snapshot | Persist events or extend TTL |
| Stream JWT in query string | Token can appear in access logs | Short-lived stream tokens or cookie auth |
| One active run per conversation | No parallel turns in the same chat | Deliberate; queue later messages |
| Native mobile build/device run not performed | UI validated by typecheck only | Install Expo deps and run on a device/emulator |
| No push notifications | Approvals only visible while app is open | Future: Expo Push |
| No vector search/RAG | Basic text search only | SQLite FTS planned |
| Single Odin instance | No distributed executors | Central server protocol later |

---

## 8. Next Steps (Priority Order)

1. **Mobile validation** — install Expo dependencies, typecheck and run the new WebSocket chat path
2. **Stream token hardening** — short-lived, single-use tokens for SSE/WS instead of the access JWT in the query string
3. **Durable event bus/queue** — Redis streams so multiple backend workers and restarts keep replay/queue semantics
4. **Push notifications** — Expo Push for approval requests and run completion
5. **Vector search** — SQLite VSS or pgvector for knowledge RAG
6. **Multi-user** — workspaces, sharing, RBAC
7. **Rate limiting** — per-user limits on runs/approvals
8. **Audit logging** — structured logs for security-relevant actions
9. **CI integration tests** — run the Playwright approval/queue/reconnect flows in CI

---

## 9. Security Notes

- ✅ Hermes credentials never leave backend (`HERMES_SESSION_TOKEN` in env only)
- ✅ JWT tokens: 7-day access + 30-day refresh, both configurable (refresh in HttpOnly cookie)
- ✅ Passwords: bcrypt (direct `bcrypt` API; no passlib)
- ✅ CORS restricted to configured origins
- ✅ Rate limiting on auth endpoints (10 req/min)
- ✅ Input validation via Pydantic on all endpoints
- ✅ Mobile tokens in SecureStore (encrypted)
- ⚠️ Stream endpoints accept `?token=` (EventSource/WS limitation); redact query strings from logs or issue short-lived stream tokens
- ⚠️ SQLite file permissions — ensure `chmod 600` in production
- ⚠️ HTTPS required for production (CORS + secure cookies)

---

*Generated automatically from implementation session.*