"""Repository discovery and service definitions for the ODIN CLI."""

from __future__ import annotations

import os
import socket
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

SERVICE_ORDER: tuple[str, ...] = ("hermes", "backend", "web", "mobile")

SERVICE_ALIASES: dict[str, str] = {
    "agent": "hermes",
    "api": "backend",
    "back": "backend",
    "back-end": "backend",
    "front": "web",
    "front-end": "web",
    "frontend": "web",
    "expo": "mobile",
}


class ConfigError(RuntimeError):
    """Raised when the CLI cannot resolve the repository or its configuration."""


@dataclass(frozen=True)
class Service:
    """A development service managed by the CLI."""

    name: str
    label: str
    description: str
    cwd: Path
    command: tuple[str, ...]
    port: int
    host: str
    probe_host: str = "127.0.0.1"
    health_url: str | None = None
    depends_on: tuple[str, ...] = ()
    url: str = ""
    env: Mapping[str, str] = field(default_factory=dict)

    @property
    def health_kind(self) -> str:
        return "http" if self.health_url else "tcp"


def env_bool(name: str, default: bool) -> bool:
    """Read a boolean environment variable."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


def read_env_file(path: Path) -> dict[str, str]:
    """Read a simple KEY=VALUE .env file, ignoring comments and quotes."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def _int_or_none(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _env_port(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return fallback
    port = _int_or_none(raw)
    if port is None or not 1 <= port <= 65535:
        raise ConfigError(f"{name} inválido: {raw!r} (esperado uma porta entre 1 e 65535)")
    return port


def _env_host(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def _probe_host(bind_host: str) -> str:
    """Use loopback when a service listens on a wildcard address."""
    if bind_host in {"0.0.0.0", "::", "localhost"}:
        return "127.0.0.1"
    return bind_host


def _find_walking_up(start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        if _is_repo_root(candidate):
            return candidate
    return None


def _is_repo_root(path: Path) -> bool:
    return (path / "backend" / "app" / "main.py").is_file() and (path / "apps").is_dir()


def find_repo_root(start: Path | None = None) -> Path | None:
    """Find the odin-v2 repository root.

    Resolution order: ``ODIN_ROOT``, the current directory (walking up), then
    the location of this package (works for an editable install).
    """
    override = os.environ.get("ODIN_ROOT")
    if override:
        root = Path(override).expanduser().resolve()
        if not _is_repo_root(root):
            raise ConfigError(
                f"ODIN_ROOT aponta para {root}, mas não parece ser o repositório odin-v2"
            )
        return root

    starts = [start or Path.cwd(), Path(__file__).resolve().parents[2]]
    for candidate_start in starts:
        root = _find_walking_up(candidate_start.resolve())
        if root is not None:
            return root
    return None


def require_repo_root(start: Path | None = None) -> Path:
    """Return the repository root or raise a helpful error."""
    root = find_repo_root(start)
    if root is None:
        raise ConfigError(
            "Não foi possível localizar o repositório odin-v2. "
            "Execute o comando dentro do repositório ou defina ODIN_ROOT."
        )
    return root


@lru_cache(maxsize=1)
def get_lan_ip() -> str | None:
    """Best-effort LAN IP used for Expo URLs and mobile hints."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(0.2)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def build_services(root: Path, host_override: str | None = None) -> dict[str, Service]:
    """Build the service catalog for a repository root."""
    backend_root = root / "backend"
    web_root = root / "apps" / "web"
    mobile_root = root / "apps" / "mobile"
    backend_env = read_env_file(backend_root / ".env")

    backend_port = _env_port(
        "ODIN_BACKEND_PORT",
        _int_or_none(backend_env.get("API_PORT")) or 8000,
    )
    hermes_port = _env_port("ODIN_HERMES_PORT", 9119)
    web_port = _env_port("ODIN_WEB_PORT", 5173)
    mobile_port = _env_port("ODIN_MOBILE_PORT", 8081)

    default_host = os.environ.get("ODIN_HOST", "127.0.0.1")
    hermes_host = _env_host("ODIN_HERMES_HOST") or "127.0.0.1"
    backend_host = (
        host_override
        or _env_host("ODIN_BACKEND_HOST", "ODIN_HOST")
        or backend_env.get("API_HOST")
        or "127.0.0.1"
    )
    web_host = host_override or _env_host("ODIN_WEB_HOST") or default_host

    venv_python = backend_root / "venv" / "bin" / "python"
    python = str(venv_python) if venv_python.is_file() else "python3"

    backend_command: list[str] = [
        python,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        backend_host,
        "--port",
        str(backend_port),
    ]
    if env_bool("ODIN_BACKEND_RELOAD", True):
        backend_command.append("--reload")

    hermes_probe = _probe_host(hermes_host)
    backend_probe = _probe_host(backend_host)
    web_probe = _probe_host(web_host)
    local_url = "http://127.0.0.1"
    lan_ip = get_lan_ip() or "127.0.0.1"

    services = {
        "hermes": Service(
            name="hermes",
            label="Hermes Agent",
            description="Gateway JSON-RPC/WebSocket do agente",
            cwd=root,
            command=(
                "hermes",
                "serve",
                "--host",
                hermes_host,
                "--port",
                str(hermes_port),
            ),
            port=hermes_port,
            host=hermes_host,
            probe_host=hermes_probe,
            health_url=f"http://{hermes_probe}:{hermes_port}/api/health",
            url=f"{local_url}:{hermes_port}",
            env={"PYTHONUNBUFFERED": "1"},
        ),
        "backend": Service(
            name="backend",
            label="Backend",
            description="API FastAPI + runs/SSE/WebSocket",
            cwd=backend_root,
            command=tuple(backend_command),
            port=backend_port,
            host=backend_host,
            probe_host=backend_probe,
            health_url=f"http://{backend_probe}:{backend_port}/api/health",
            depends_on=("hermes",),
            url=f"{local_url}:{backend_port}",
            env={"PYTHONUNBUFFERED": "1"},
        ),
        "web": Service(
            name="web",
            label="Frontend Web",
            description="React + Vite",
            cwd=web_root,
            command=(
                "npm",
                "run",
                "dev",
                "--",
                "--host",
                web_host,
                "--port",
                str(web_port),
                "--strictPort",
            ),
            port=web_port,
            host=web_host,
            probe_host=web_probe,
            health_url=f"http://{web_probe}:{web_port}/",
            depends_on=("backend",),
            url=f"{local_url}:{web_port}",
            env={"BROWSER": "none"},
        ),
        "mobile": Service(
            name="mobile",
            label="Mobile (Expo)",
            description="Expo / React Native (Metro)",
            cwd=mobile_root,
            command=("npm", "start", "--", "--port", str(mobile_port)),
            port=mobile_port,
            host="0.0.0.0",
            health_url=None,
            depends_on=("backend",),
            url=f"exp://{lan_ip}:{mobile_port}",
            env={"BROWSER": "none", "EXPO_NO_TELEMETRY": "1"},
        ),
    }
    return {name: services[name] for name in SERVICE_ORDER}


def canonical_service_name(name: str) -> str:
    """Map user-facing aliases (frontend, api, expo...) to canonical names."""
    normalized = name.strip().lower()
    return SERVICE_ALIASES.get(normalized, normalized)


def resolve_services(
    requested: Sequence[str] | None,
    services: Mapping[str, Service],
    *,
    include_dependencies: bool = True,
) -> list[Service]:
    """Resolve requested service names (and their dependencies) in start order."""
    raw_names = list(requested) if requested else list(services)
    if any(name.strip().lower() == "all" for name in raw_names):
        raw_names = list(services)
    names = [canonical_service_name(name) for name in raw_names]
    unknown = sorted({name for name in names if name not in services})
    if unknown:
        available = ", ".join(services)
        raise ConfigError(
            f"Serviço(s) desconhecido(s): {', '.join(unknown)}. Disponíveis: {available}"
        )

    selected: set[str] = set()

    def visit(name: str) -> None:
        if name in selected:
            return
        if include_dependencies:
            for dependency in services[name].depends_on:
                visit(dependency)
        selected.add(name)

    for name in names:
        visit(name)

    return [service for name, service in services.items() if name in selected]
