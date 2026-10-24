# odin CLI

CLI de desenvolvimento do ODIN V2. Controla os quatro serviços do ambiente:

| Serviço | Comando | Porta | Health check |
|---------|---------|-------|--------------|
| `hermes` | `hermes serve` | 9119 | `GET /api/health` |
| `backend` | `uvicorn app.main:app` | 8000 | `GET /api/health` |
| `web` | `npm run dev` (Vite) | 5173 | `GET /` |
| `mobile` | `npm start` (Expo/Metro) | 8081 | TCP |

## Instalação

O CLI é um pacote Python separado do backend. A forma recomendada é instalar como
ferramenta (o binário `odin` fica disponível no `PATH`):

```bash
# com uv (recomendado)
uv tool install --editable ./cli

# ou com pipx
pipx install --editable ./cli

# ou em um ambiente virtual
python3 -m venv .venv-cli
.venv-cli/bin/pip install -e ./cli
```

Para desenvolvimento, rode sem instalar:

```bash
uv run --project cli odin --help
```

> `--editable` faz o binário usar o código-fonte de `cli/`, então alterações no CLI
> valem imediatamente.

## Uso

```bash
# sobe todos os serviços em background e espera o health check
odin up

# sobe apenas o backend (hermes é iniciado como dependência)
odin up backend

# sobe hermes, backend e web (sem o mobile)
odin up hermes backend web

# sobe tudo sem esperar o health check
odin up --no-wait

# acompanha o estado dos quatro serviços
odin status

# acompanha os logs de um serviço
odin logs backend
odin logs mobile -f

# reinicia apenas o frontend
odin restart web

# derruba todos os serviços iniciados pelo CLI
odin down

# valida pré-requisitos e configuração
odin doctor

# abre o frontend, a API, o Swagger ou o dashboard do Hermes
odin open web
odin open docs
```

O CLI mantém os processos em background, com PID e logs por serviço:

```
.odin/
├── run/
│   ├── hermes.json
│   ├── backend.json
│   ├── web.json
│   └── mobile.json
└── logs/
    ├── hermes.log
    ├── backend.log
    ├── web.log
    └── mobile.log
```

### Comandos

| Comando | Descrição |
|---------|-----------|
| `up [serviços...]` | Sobe os serviços e espera ficarem saudáveis (`--no-wait` desliga a espera) |
| `start [serviços...]` | Alias de `up` |
| `down [serviços...]` | Para os serviços gerenciados pelo CLI |
| `stop [serviços...]` | Alias de `down` |
| `restart [serviços...]` | Para e sobe novamente os serviços indicados |
| `status [serviços...]` | Tabela com estado, PID, porta, saúde e uptime (`--json` para scripts) |
| `logs <serviço>` | Últimas linhas do log (`-n`, `-f` para seguir, `--path` para o caminho) |
| `open <alvo>` | Abre `web`, `api`, `docs` ou `hermes` no navegador |
| `doctor` | Verifica binários, venv, `.env`, dependências e estado dos serviços |
| `version` | Versão do CLI (`odin --version` também funciona) |

Os serviços aceitam aliases: `frontend`/`front` → `web`, `api`/`back` →
`backend`, `expo` → `mobile`, `agent` → `hermes`, e `all` para todos.

### Dependências e ordem

```
hermes ← backend ← web
                 ← mobile
```

- `odin up web` inicia `hermes`, `backend` e `web`.
- Use `--no-deps` para iniciar somente o serviço pedido.
- `odin down` só encerra processos iniciados pelo próprio CLI. Serviços que já
  estavam rodando fora dele aparecem como `externo` e são preservados.

## Configuração

Os padrões podem ser sobrescritos por variáveis de ambiente:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `ODIN_ROOT` | detectado | Raiz do repositório |
| `ODIN_HOST` | `127.0.0.1` | Host padrão de backend/web (`0.0.0.0` para LAN) |
| `ODIN_BACKEND_HOST` | valor de `backend/.env` | Host específico do backend |
| `ODIN_HERMES_HOST` | `127.0.0.1` | Host do Hermes (mantenha local; use túnel para acesso remoto) |
| `ODIN_WEB_HOST` | `127.0.0.1` | Host específico do Vite |
| `ODIN_HERMES_PORT` | `9119` | Porta do Hermes |
| `ODIN_BACKEND_PORT` | `API_PORT` do `.env` ou `8000` | Porta do backend |
| `ODIN_WEB_PORT` | `5173` | Porta do Vite |
| `ODIN_MOBILE_PORT` | `8081` | Porta do Expo/Metro |
| `ODIN_BACKEND_RELOAD` | `1` | `0` desliga o `--reload` do uvicorn |
| `ODIN_STATE_DIR` | `<repo>/.odin` | Diretório de PIDs e logs |
| `ODIN_LOG_MAX_BYTES` | `10485760` | Na próxima inicialização, rotaciona logs maiores que isso para `.log.1` |

Exemplos:

```bash
# expor backend e web na rede local (necessário para device físico)
odin up --host 0.0.0.0

# usar outra porta para o frontend
ODIN_WEB_PORT=5174 odin up web

# não recarregar o backend ao editar arquivos
ODIN_BACKEND_RELOAD=0 odin up backend
```

## Como funciona

1. O CLI descobre a raiz do repositório e valida os serviços.
2. Antes de iniciar, verifica se a porta já está ocupada. Se o serviço estiver
   respondendo, ele é reaproveitado; se for outro processo, o CLI não interfere.
3. Cada processo roda em uma sessão própria (`start_new_session`), com
   `stdout`/`stderr` redirecionados para `.odin/logs/<serviço>.log`.
4. O PID e o horário de início são salvos em `.odin/run/<serviço>.json`.
5. `status` valida o PID, o horário de início e o health check para evitar
   confundir um PID reutilizado com o serviço.
6. `down` envia `SIGTERM` para o grupo de processos, espera e usa `SIGKILL`
   apenas se necessário.

## Troubleshooting

```bash
# ver o que está rodando
odin status

# validar configuração e dependências
odin doctor

# acompanhar a inicialização de um serviço que falhou
odin logs backend -f

# reiniciar apenas um serviço
odin restart backend
```

- **Backend encerra logo após iniciar**: normalmente falta `backend/.env` ou
  `SECRET_KEY`. Rode `odin doctor` e confira `odin logs backend`.
- **Porta ocupada por outro processo**: o CLI não mata processos que não
  iniciou. Encerre o processo antigo ou ajuste a porta com `ODIN_*_PORT`.
- **Mobile não conecta no device físico**: suba o backend com
  `odin up --host 0.0.0.0` e crie `apps/mobile/.env` com
  `EXPO_PUBLIC_API_URL=http://<ip-lan>:8000/api`.
