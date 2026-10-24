# Hermes ↔ ODIN Communication

**Last verified:** 2026-10-24  
**Hermes version:** v0.22 (`tui_gateway` JSON-RPC over WebSocket)  
**Odin transports:** SSE for web, WebSocket for mobile

This document describes how ODIN V2 talks to Hermes, how a turn becomes a
stream of UI events, and which guarantees clients can rely on. It replaces the
old raw-PTY integration: the PTY stream carried terminal escape sequences and
had no structured tool lifecycle, approvals, or reliable turn completion.

---

## 1. Topology

```
┌──────────────┐   SSE  GET /api/runs/{id}/events?token=…   ┌──────────────┐
│  Web (React) │ ─────────────────────────────────────────▶ │              │
└──────────────┘                                            │  ODIN API    │
┌──────────────┐   WS   /api/runs/{id}/ws?token=…           │  (FastAPI)   │
│ Mobile (RN)  │ ◀────────────────────────────────────────▶ │              │
└──────────────┘                                            └──────┬───────┘
                                                                   │
                                    one multiplexed WebSocket      │
                                    /api/ws?token=<Hermes token>    │
                                                                   ▼
                                                            ┌──────────────┐
                                                            │ Hermes Agent │
                                                            │ tui_gateway  │
                                                            └──────────────┘
```

Key properties:

- **Clients never talk to Hermes directly.** Only the backend knows the Hermes
  session token and session ids.
- **One backend WebSocket to Hermes.** It is multiplexed: every Odin
  conversation gets its own live Hermes session over the same socket.
- **One active run per Odin conversation.** Later turns are queued in the
  backend so events cannot be attributed to the wrong run. Hermes has its own
  prompt queue, but two Odin subscribers on one Hermes session could consume
  each other's deltas.
- **Runs are ordinary resources.** `POST .../runs` returns JSON `202 Accepted`;
  streaming happens on a separate, replayable endpoint.

---

## 2. Authentication

### ODIN clients → ODIN backend

- REST: `Authorization: Bearer <odin access token>`.
- SSE (`EventSource`) and browser WebSocket cannot set headers, so the backend
  also accepts `?token=<odin access token>` on the two stream endpoints.
- **REST endpoints remain header-only**: the query fallback is restricted to
  `/api/runs/{id}/events`, so a token pasted into a normal API URL is rejected.
- `GET /api/runs/{id}/events` and `WS /api/runs/{id}/ws` validate the token as
  an access token and reject with `401` / WS close code `4401` otherwise.

### ODIN backend → Hermes

- Base URL: `HERMES_API_URL` (default `http://127.0.0.1:9119`).
- WebSocket URL: `ws://…/api/ws?token=<HERMES_SESSION_TOKEN>`.
- REST health/status calls use `X-Hermes-Session-Token`.
- The Hermes token is **never** sent to a client.

> Operational note: uvicorn access logs include query strings. A stream token
> therefore appears in the backend log. Treat logs as sensitive and prefer
> short-lived stream tokens or cookie-based stream auth in production.

---

## 3. Hermes gateway handshake

`backend/app/integrations/hermes/gateway.py` owns the connection.

1. Open `GET ws://…/api/ws?token=…`.
2. Wait for the `gateway.ready` event.
3. Send `client.capabilities {"server_requests": true}`. Without this Hermes
   will not deliver approval requests to ODIN.
4. Calls are newline-delimited JSON-RPC 2.0 frames. The backend keeps a map of
   pending call ids and awaits the matching response.

### 3.1 RPC methods used

| Method | Purpose |
|--------|---------|
| `client.capabilities` | Opt in to approvals/interactive server requests |
| `session.create` | Create a live Hermes session (`source: "odin"`, `close_on_disconnect: false`) |
| `session.resume` | Resume a durable transcript (`lazy`, `defer_history`, `omit_messages`) |
| `prompt.submit` | Submit the user turn (`surface: "odin"`) |
| `session.interrupt` | Stop the current turn |
| `approval.respond` | Fallback approval decision when the original server request is gone |
| `approval.pending` | Inspect pending approvals for a live session |

### 3.2 Session identity

Three ids matter:

| Id | Where it lives | Meaning |
|----|----------------|---------|
| Odin `conversation_id` | Odin DB | Stable conversation |
| Hermes `stored_session_id` | `conversations.hermes_session_id` | Durable transcript id, survives backend restarts |
| Hermes `live_id` | `runs.hermes_session_id` | Live server session for one turn |

`get_or_create_session()` first returns the in-memory live session; otherwise it
resumes the stored id, and only creates a new session if resuming fails. The
live session is kept after a turn (`close_on_disconnect: false`) so follow-up
messages reuse the same context. A `session.title` event updates the Odin
conversation title.

---

## 4. Run lifecycle

### 4.1 Creation

```
POST /api/conversations/{conversation_id}/runs
{ "message": "…" }
→ 202 { "id": "run_…", "status": "queued", "queue_position": 0, … }
```

`create_run` writes the user message, an empty assistant message and the run in
one transaction, then starts a background task. It **never** holds the HTTP
request open for the duration of the turn. `data.stream` is accepted for
backward compatibility and ignored.

### 4.2 Execution

`run_manager.execute_run()`:

1. Marks the run `running`, emits `run_started`.
2. Resumes/creates the Hermes session, stores `stored_session_id` and
   `live_id`, emits `session_started`.
3. Subscribes to the Hermes session **before** `prompt.submit`, so the first
   deltas and tool events cannot be lost.
4. Relays normalized events, persists tool calls/results, expands approvals.
5. On `message.complete` (or an error/interrupt), persists the assistant
   message and run status, **commits**, then emits the terminal event.

The commit-before-terminal-event order matters: clients reload the run and
messages as soon as the terminal event arrives. Publishing first exposed the
previous `running` status and an empty assistant message for a few
milliseconds.

### 4.3 Queueing

If a conversation already has an active run, a new run is persisted as
`queued`, gets a `run_queued` event with its 1-based position, and is launched
when the active run finishes. `GET /api/conversations/{id}/runs/active`
prefers `waiting_approval`/`running` over `queued`, so a page reload always
reattaches to the turn that owns the Hermes session instead of to the queue.

Stopping a queued run removes it from the queue and finalizes it as
`cancelled` without touching Hermes.

### 4.4 Recovery

`recover_stale_runs()` runs at startup. Rows left `queued`, `running` or
`waiting_approval` are marked `failed`, their pending approvals are expired, and
a `run_failed` event is published. Live Hermes sessions do not survive an ODIN
restart, so leaving these rows active would spin forever in the UI.

---

## 5. Event model

Every event published by `RunEventBus` has:

```json
{
  "type": "token",
  "data": { "delta": "Olá" },
  "run_id": "run_…",
  "timestamp": "2026-10-24T00:00:00.000Z",
  "seq": 42
}
```

`seq` is monotonic per run and is the cursor for replay.

### 5.1 Odin event vocabulary

| Odin event | Source (Hermes) | Meaning |
|------------|-----------------|---------|
| `run_queued` | Odin queue | Run is waiting behind another turn |
| `run_started` | Odin | Background execution began |
| `session_started` | Odin | Hermes live/stored session resolved |
| `message_start` | `message.start` | Assistant message begins |
| `token` | `message.delta`, `token` | Incremental answer text |
| `reasoning` | `reasoning.delta`, `thinking.delta` | Reasoning text (placeholder frames filtered) |
| `status` | `tool.generating`, `tool.progress`, `status.update` | Human-readable activity |
| `session_info` | `session.info` | Model/provider/approval mode/cwd |
| `title` | `session.title` | Generated conversation title |
| `tool_call` | `tool.start` | Tool invocation with args/context |
| `tool_result` | `tool.complete` | Result, error flag and duration |
| `approval_requested` | `approval` server request | Inline approval card |
| `approval_resolved` | ODIN | A decision was sent to Hermes |
| `approval_cancelled` | `approval.cancelled`, `request.cancel` | Hermes stopped waiting |
| `run_stopping` | ODIN | Interrupt requested |
| `run_completed` | `message.complete` (complete) | Terminal success |
| `run_failed` | error / connection lost / internal error | Terminal failure |
| `run_cancelled` | `message.complete` (interrupted), interrupt | Terminal cancellation |
| `run_snapshot` | ODIN fallback | DB snapshot when no live bus exists |

`tool.complete` terminal results are `{output, exit_code, error}`; the mapper
prefers `summary`/`result_text`, then `output`/`error`, and truncates large
payloads.

### 5.2 Persistence

Tool calls, tool results, approvals and terminal events are appended to
`runs.events` (bounded payloads). The assistant message stores the final text
plus `tool_calls`/`tool_results`. `reasoning`, token deltas and status events
are stream-only.

---

## 6. Streaming transports

### 6.1 SSE (web)

```
GET /api/runs/{run_id}/events?after=<seq>&token=<jwt>
Accept: text/event-stream

id: 42
event: token
data: {"type":"token","data":{"delta":"Olá"},…,"seq":42}
```

- Named events: the client registers listeners for every type in
  `RUN_EVENT_TYPES`; `onmessage` alone is not enough.
- Replay: `after=<seq>` or `Last-Event-ID` header. EventSource sends the last
  `id:` automatically on reconnect.
- Heartbeat: `: keep-alive` comment every 15 s.
- The server closes the stream on a terminal event.
- If the bus is gone (restart or 15-minute TTL after the run ended), the server
  emits one `run_snapshot` with the DB status instead of hanging.

### 6.2 WebSocket (mobile)

```
WS /api/runs/{run_id}/ws?after=<seq>&token=<jwt>
```

- Frames are the same JSON objects as the SSE `data` payloads.
- Heartbeats arrive as `{"type":"heartbeat","run_id":"…"}` and are ignored.
- Close code `4401` = unauthorized, `4404` = unknown run.
- The server closes after a terminal event.

### 6.3 Client reconnect behavior

- Web: if the stream errors, retry with exponential backoff (1 s → 8 s, six
  attempts) and `after=lastSeq`. Reloads reattach via `GET .../runs/active`.
- Mobile: same policy over WebSocket. Both clients also call
  `GET /api/approvals?status=pending&run_id=…` when attaching to a
  `waiting_approval` run, which restores the approval card after a refresh even
  if the event backlog is unavailable.

---

## 7. Approvals

### 7.1 Request

Hermes sends a **server → client request**:

```json
{
  "jsonrpc": "2.0",
  "id": "srq-ec7f7702426c",
  "method": "approval",
  "params": {
    "session_id": "60ad191b",
    "request_id": "b24807783e8c4498a10b4538053b721c",
    "command": "rm -rf /tmp/probe",
    "description": "delete in root path",
    "choices": ["once", "session", "always", "deny"]
  }
}
```

The gateway indexes the frame by both the `srq-*` id and the Hermes
`request_id`, then publishes `approval_requested` with
`_server_request_id: "srq-…"`.

Odin persists an `Approval` row:

| Column | Value |
|--------|-------|
| `hermes_approval_id` | Hermes `request_id` |
| `operation` | `tool_name` (usually `approval`) |
| `details.command` / `description` / `choices` | Copied from the request |
| `details.server_request_id` | `srq-*` frame id |
| `status` | `pending` |

The run moves to `waiting_approval` and the UI renders an inline card.
`approval_requested` is also persisted in `runs.events`.

### 7.2 Decision

```
POST /api/approvals/{approval_id}/approve?choice=once
POST /api/approvals/{approval_id}/deny?choice=deny
```

Choices are validated against the stored list. The backend prefers answering
the original server request:

```json
{"jsonrpc":"2.0","id":"srq-…","result":{"choice":"once"}}
```

If the original frame is gone (reconnect, SDK restart), it falls back to
`approval.respond {session_id, request_id, choice}`. The approval and run
statuses are committed and `approval_resolved` is fanned out. Hermes then emits
`tool_result` (approved) or a `BLOCKED` result (denied).

### 7.3 Cancellation and expiry

- Hermes may emit `approval.cancelled` or `request.cancel`; matching pending
  rows become `expired`, the run returns to `running`, and
  `approval_cancelled` is streamed.
- When a run reaches any terminal state, `_finalize()` expires remaining
  pending approvals and the client drops the card.
- Hermes' own approval window is controlled by `approvals.timeout` (default
  300 s). Odin's per-turn safety timeout is `HERMES_RUN_TIMEOUT` (default
  3600 s); on expiry the backend interrupts the session and fails the run.

---

## 8. Stop, errors and timeouts

- `POST /api/runs/{id}/stop` calls `session.interrupt`, publishes
  `run_stopping`, and starts a 25 s watchdog. If Hermes does not confirm, the
  watchdog finalizes the run as `cancelled` so the UI never stays stuck.
- A Hermes RPC error or a closed gateway socket produces `run_failed` with a
  human-readable message; a connection loss also finalizes every active
  subscription (`connection_lost`).
- Unexpected backend exceptions are logged and finalized as `run_failed`.
- In-memory queues are bounded (3000 events per bus, 4000 per Hermes
  subscription). Overflow drops the event and logs a warning rather than
  blocking the reader.

---

## 9. Verified end-to-end

All checks ran against a live Hermes instance and the real UI.

### API/SSE (live)

- Token streaming, generated title, persisted assistant message.
- Tool call/result persisted with `call_id` and duration.
- `approval_requested` → REST pending list → SSE replay after reconnect →
  `approve once` → `approval_resolved` → `tool_result` → `run_completed`;
  command executed.
- Second run while the first waits for approval → `run_queued` with position →
  starts only after the first terminal event.
- `deny` → `BLOCKED` tool result → run still completes → target untouched.
- WebSocket transport (mobile path): live turn streamed 36 ordered events and
  replayed the same events from `after=0`; SSE snapshot fallback returned the
  DB status for a run whose bus no longer existed.
- Page reload while waiting → `/runs/active` returns the waiting run (not the
  queued one) → approval card restored.
- Terminal event observed only after the DB commit: the immediate
  `GET /api/runs/{id}` returns `completed`.
- Restart recovery: active rows become `failed`, pending approvals expire.

### Web UI (Playwright/Chromium)

- Login, send, live status, inline approval card.
- Queue a second message while waiting.
- Reload mid-approval → card and status reattach.
- Approve once → run completes, queued run runs next.
- `Negar` → agent reports it was not authorized; target file remains.
- Stop while waiting for approval → UI settles as cancelled; approval card
  disappears.
- Deep link `/chat/{conversationId}` restores the transcript.
- No console/page errors during the flows.

### Checks

```bash
cd backend && ./venv/bin/python -m pytest -q     # 8 passed
cd apps/web && npm run typecheck && npm run build
cd apps/mobile && npm ci && npm run typecheck     # passes
```

A native mobile build/device run was not performed in this environment.

---

## 10. Operational notes and limits

- **Single process.** Event buses, queues and active-run maps are in memory.
  Running multiple backend workers would split subscribers; use one worker or
  move the bus/queue to Redis before scaling out.
- **Replay window.** A bus keeps the last 3000 events and is disposed 15
  minutes after the terminal event. Older runs only have `runs.events` and the
  `run_snapshot` fallback.
- **One turn per conversation.** This is a deliberate correctness trade-off,
  not a Hermes limit.
- **Approval choices.** `session` and `always` persist approvals inside Hermes
  (`always` writes `command_allowlist` in the Hermes config). ODIN only forwards
  the choice.
- **Token in query strings.** Required by EventSource/browser WebSocket; see the
  security note in §2.
- **Hermes availability.** Hermes may start after ODIN; the gateway retries on
  the first run. A run started while Hermes is down fails with a clear message
  and can be retried from the UI.

---

## 11. File map

| Concern | File |
|---------|------|
| JSON-RPC gateway, sessions, approvals | `backend/app/integrations/hermes/gateway.py` |
| Hermes → Odin event mapping | `backend/app/integrations/hermes/events.py` |
| Queueing, replay, persistence, recovery | `backend/app/services/run_manager.py` |
| Run creation, SSE, WS, active run, stop | `backend/app/api/routes/runs.py` |
| Approve/deny | `backend/app/api/routes/approvals.py` |
| Query-token auth | `backend/app/core/security.py` |
| Web client (SSE) | `apps/web/src/lib/api.ts`, `apps/web/src/pages/ChatPage.tsx` |
| Mobile client (WS) | `apps/mobile/lib/api.ts`, `apps/mobile/app/(tabs)/index.tsx` |
