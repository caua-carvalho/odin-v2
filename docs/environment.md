# ODIN V2 — Environment Report

**Generated:** 2026-10-22  
**Workspace:** `/home/caua/odin-v2`

---

## 1. System Versions

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.14.8 | |
| Node.js | v26.10.0 | |
| npm | 11.21.0 | |
| Expo CLI | 57.0.27 | |
| OpenCode | (current session) | |

---

## 2. Hermes Agent Installation

| Property | Value |
|----------|-------|
| Version | 0.22.2 (2026.9.24) · stable |
| Install Dir | `/home/caua/.hermes/hermes-agent` |
| Install Method | git |
| Config Dir | `/home/caua/.hermes` |
| Python (Hermes) | 3.14.7 |
| OpenAI SDK | 2.24.0 |

### 2.1 Configuration (`~/.hermes/config.yaml`)

Key settings:
- **Personality:** `jarvis` (custom, Portuguese BR)
- **Dashboard Theme:** `ember`
- **STT:** Enabled, provider OpenAI (Whisper-1)
- **Telemetry:** Shared metrics enabled, send disabled
- **Auth:** Adopt external logins (Codex, Claude Code) enabled
- **Gateway:** Multiplex mode (single gateway serves all profiles)

### 2.2 Available Toolsets (from config)

| Toolset | Tools |
|---------|-------|
| `terminal` | `terminal`, `process` |
| `file` | `read_file`, `write_file`, `patch`, `search` |
| `web` | `web_search`, `web_extract` |
| `search` | `web_search` |
| `browser` | Full browser automation (needs BROWSERBASE_API_KEY) |
| `vision` | `vision_analyze` (needs OPENROUTER_API_KEY) |
| `image_gen` | `image_generate` (needs FAL_KEY) |
| `skills` | `skills_list`, `skill_view` |
| `skills_hub` | `skill_hub` (install/manage from registry) |
| `todo` | `todo` (in-memory task planning) |
| `tts` | `text_to_speech` (Edge TTS free) |
| `cronjob` | Scheduled tasks |
| `memory` | Persistent memory across sessions |
| `session_search` | FTS5 + Gemini Flash summarization |

**Composite:** `debugging` (terminal+web+file), `safe` (web+vision), `all`

### 2.3 Hermes Server (Dashboard/API)

- **Command:** `hermes serve --port 9119 --host 127.0.0.1`
- **Base URL:** `http://127.0.0.1:9119`
- **Auth:** Session token via `X-Hermes-Session-Token` header
- **Token Source:** `HERMES_DASHBOARD_SESSION_TOKEN` env var (auto-generated if absent)

#### Verified Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/health` | GET | ✅ Works | Returns version, commit, auth_required |
| `/api/status` | GET | ✅ Works | Full system status (gateway, platforms, storage, memory, disk) |
| `/api/sessions` | GET | ✅ Works | List sessions with filters |
| `/api/pty` | WS | ✅ Exists | PTY-based chat (terminal) |
| `/api/ws` | WS | ✅ Exists | Gateway sidecar WebSocket |
| `/api/console` | WS | ✅ Exists | Curated console engine |
| `/api/events` | WS | ✅ Exists | Event broadcast (pub/sub) |

#### NOT Available (as of v0.22.2)
- `/v1/runs` — No REST runs API
- `/v1/capabilities` — No capabilities endpoint
- `/openapi.json` — No OpenAPI spec
- `/health` (root) — Use `/api/health`

**Integration Approach:** Use WebSocket (`/api/pty` or `/api/ws`) for chat execution. Odin backend maintains WS connection to Hermes, correlates sessions, exposes REST + SSE to clients.

---

## 3. Existing Projects in Workspace

| Path | Description |
|------|-------------|
| `/home/caua/odin-frontend-redesign` | Previous Odin frontend attempt (React) |
| `/home/caua/odin-mcp` | MCP integration experiment |
| `/home/caua/odin-mem0` | Mem0 integration experiment |
| `/home/caua/odin-workspace` | Previous workspace |
| `/home/caua/jarvis` | Jarvis project |
| `/home/caua/OpenJarvis` | OpenJarvis project |
| `/home/caua/amadeus` | Amadeus project |

**Decision:** Clean slate. New monorepo at `/home/caua/odin-v2/`. Do not reuse old code.

---

## 4. Network & Access

| Target | Address | Notes |
|--------|---------|-------|
| Hermes Dashboard | `http://127.0.0.1:9119` | Local only |
| Odin Backend (planned) | `http://127.0.0.1:8000` | Local dev |
| Odin Web (planned) | `http://127.0.0.1:5173` | Vite dev server |
| Odin Mobile (planned) | `exp://192.168.x.x:8081` | Expo dev, LAN access |

**Mobile Access:** Backend must bind `0.0.0.0:8000` for LAN access from phone. Document in README.

---

## 5. Credentials & Secrets

| Secret | Location | Notes |
|--------|----------|-------|
| OpenAI API Key | `~/.hermes/.env` | Managed by Hermes |
| Anthropic API Key | `~/.hermes/.env` | Managed by Hermes |
| Nous Portal | `~/.hermes/auth.json` | Free tier active |
| HERMES_DASHBOARD_SESSION_TOKEN | Auto-generated | Injected by `hermes serve` |

**Odin V2 Secrets (to create):**
- `SECRET_KEY` — Generate new (32+ chars)
- `DATABASE_URL` — `sqlite+aiosqlite:///./odin.db`
- `HERMES_API_URL` — `http://127.0.0.1:9119`
- `HERMES_SESSION_TOKEN` — Copy from Hermes env at startup

---

## 6. Blockers & Limitations

| Issue | Impact | Workaround |
|-------|--------|------------|
| No Hermes REST runs API | Cannot use simple HTTP for agent execution | Use WebSocket (`/api/pty`) from backend |
| No `/v1/capabilities` | Cannot auto-discover toolsets | Hardcode known toolsets from config |
| No approval REST endpoint | Approvals via WebSocket only | Backend proxies approval frames |
| Session token ephemeral | Regenerates on `hermes serve` restart | Read from env at Odin startup |

---

## 7. Next Steps

1. ✅ Environment documented
2. ✅ API contract defined (`docs/api-contract.md`)
3. ⏳ Create backend scaffold (FastAPI, SQLAlchemy, Pydantic)
4. ⏳ Implement Hermes adapter (WebSocket client)
5. ⏳ Implement auth, conversations, runs, approvals, knowledge
6. ⏳ Create web app scaffold (React + Vite + TS)
7. ⏳ Create mobile app scaffold (Expo + RN + TS)
8. ⏳ Parallel development of three fronts
9. ⏳ Integration testing

---

*This document is updated as discoveries are made during implementation.*