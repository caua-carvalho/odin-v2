# ODIN V2 — Personal AI Assistant

|A personal AI assistant with chat, knowledge library, and agent execution capabilities, powered by Hermes Agent.

## Arquitetura

```
odin-v2/  (raiz do projeto)
├── cli/            ✝️  comando "odin" (orquestração dos serviços)
├── docs/           documentação
├── scripts/        utilitários
├── .gitmodules     ← subscritos (submodules)
├── apps/web/       → repositório `odin-web`   (React + Vite)   :5173
├── apps/mobile/    → repositório `odin-mobile`(Expo)            :8081
└── backend/        → repositório `odin-backend` (FastAPI)       :8000
```

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

## Componentes

| Component | Tech Stack | Port | Repositório |
|-----------|------------|------|-------------|
| **Backend** | FastAPI + SQLAlchemy + SQLite | 8000 | `odin-backend` |
| **Web App** | React 18 + TypeScript + Vite | 5173 | `odin-web` |
| **Mobile App** | Expo + React Native + TypeScript | 8081 | `odin-mobile` |
| **Hermes Agent** | Python (existing installation) | 9119 | n/a (instalação local) |

> Cada componente vive em seu próprio repositório, registrado como `git submodule` no
> repositório monorepo principal. O CLI `odin` continua a orquestrar tudo por cima.

## CLI de desenvolvimento

O diretório [`cli/`](cli/README.md) contém o comando `odin`, que controla os quatro
serviços em background (PID + logs por serviço), com health checks e resolução de
dependências:

```bash
# instala o binário no PATH (código editável)
uv tool install --editable ./cli
# ou: pipx install --editable ./cli

odin doctor          # valida binários, venv, .env e dependências
odin up              # sobe hermes → backend → web + mobile
odin status          # estado, PID, porta, saúde e uptime
odin logs backend -f # acompanha o log
odin restart web     # reinicia apenas o frontend
odin down            # para apenas o que o CLI iniciou
```

O CLI reaproveita serviços que já estejam rodando fora dele (aparecem como
`externo`) e nunca encerra processos que não iniciou. PIDs e logs ficam em `.odin/`.
Veja a documentação completa em [`cli/README.md`](cli/README.md).

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Hermes Agent instalado e em execução (`hermes serve --port 9119`)

### 1. Iniciar Hermes Agent

```bash
hermes serve --port 9119 --host 127.0.0.1
```

Verificar se está rodando:

```bash
curl http://127.0.0.1:9119/api/health
```

### 2. Iniciar Backend

```bash
cd backend
cp ../.env.example .env
# Editar .env - gerar SECRET_KEY: python -c "import secrets; print(secrets.token_urlsafe(32))"

pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Iniciar Web App

```bash
cd apps/web
npm install
npm run dev
```

Abra http://127.0.0.1:5173

### 4. Iniciar Mobile App

```bash
cd apps/mobile
cp .env.example .env
# Editar .env com a URL da API

npm install
npm start
```

Escaneie o QR code com o app Expo Go, ou pressione `a` para Android e `i` para iOS.

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
├── .gitmodules            # Subscrições para os repositórios separados
├── cli/                   # Comando "odin" (Typer) — orquestração
├── docs/                  # Documentação
│   ├── api-contract.md    # Especificação da API
│   ├── architecture.md    # Arquitetura do sistema
│   └── environment.md     # Relatório de ambiente
├── scripts/               # Scripts de utilidade
├── tests/                 # Testes do CLI
├── backend/               # FastAPI API (submódulo de odin-backend)
│   ├── app/
│   │   ├── api/routes/    # Endpoints da API
│   │   ├── core/          # Config, DB, Segurança
│   │   ├── integrations/hermes/  # Adapter do Hermes
│   │   ├── models/        # SQLAlchemy models
│   │   └── schemas/       # Pydantic schemas
│   └── ...
├── apps/web/              # Aplicação web (submódulo de odin-web)
│   ├── src/
│   │   ├── components/    # Componentes reutilizáveis
│   │   ├── contexts/      # React contexts (Auth)
│   │   ├── hooks/         # Hooks customizados
│   │   ├── lib/           # Cliente API, utils
│   │   └── pages/         # Componentes de páginas
│   └── ...
└── apps/mobile/           # Aplicação mobile (submódulo de odin-mobile)
    ├── app/               # Telas Expo Router
    │   ├── (tabs)/        # Telas de abas
    │   └── login.tsx
    ├── contexts/          # Contexto de Auth
    ├── lib/               # Cliente API, utils
    └── ...
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
