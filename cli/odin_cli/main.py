"""Typer entry point for the ODIN V2 development CLI."""

from __future__ import annotations

import json
import shutil
import sys
import time
import webbrowser
from pathlib import Path
from typing import Annotated, NoReturn

import typer
from rich import box
from rich.console import Console
from rich.markup import escape
from rich.table import Table

from odin_cli import __version__
from odin_cli.config import (
    SERVICE_ORDER,
    ConfigError,
    Service,
    build_services,
    canonical_service_name,
    find_repo_root,
    read_env_file,
    require_repo_root,
    resolve_services,
)
from odin_cli.process import (
    ProcessError,
    ProcessManager,
    ServiceStatus,
    iter_follow,
    read_last_lines,
)

console = Console(highlight=False)

STATE_LABELS = {
    "running": ("executando", "green"),
    "external": ("externo", "cyan"),
    "starting": ("iniciando", "yellow"),
    "unhealthy": ("sem resposta", "red"),
    "stopped": ("parado", "dim"),
}

CHECK_LABELS = {
    "ok": ("ok", "green"),
    "warn": ("atenção", "yellow"),
    "fail": ("falha", "red"),
}

SERVICES_HELP = "Serviços alvo: hermes, backend, web, mobile. Padrão: todos."

app = typer.Typer(
    name="odin",
    help="Controle dos servidores de desenvolvimento do ODIN V2.",
    no_args_is_help=True,
    add_completion=False,
    rich_markup_mode="rich",
    context_settings={"help_option_names": ["-h", "--help"]},
)


# --------------------------------------------------------------------------- helpers


def _fail(message: str, code: int = 1) -> NoReturn:
    console.print(f"[red]erro:[/] {message}")
    raise typer.Exit(code)


def _context(host: str | None = None) -> tuple[Path, dict[str, Service], ProcessManager]:
    root = require_repo_root()
    services = build_services(root, host_override=host)
    return root, services, ProcessManager(root, services)


def _format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def _state_cell(status: ServiceStatus) -> str:
    label, style = STATE_LABELS[status.state]
    return f"[{style}]● {label}[/]"


def _health_cell(status: ServiceStatus) -> str:
    if status.state == "stopped":
        return "[dim]—[/]"
    if status.healthy:
        return "[green]ok[/]"
    return "[red]falha[/]"


def _resolved(
    requested: list[str] | None,
    services: dict[str, Service],
    *,
    include_dependencies: bool,
) -> list[Service]:
    try:
        return resolve_services(requested, services, include_dependencies=include_dependencies)
    except ConfigError as exc:
        _fail(str(exc))


def _selected_context(
    requested: list[str] | None,
    host: str | None = None,
    *,
    include_dependencies: bool = True,
) -> tuple[Path, dict[str, Service], ProcessManager, list[Service]]:
    try:
        root, services, manager = _context(host)
    except ConfigError as exc:
        _fail(str(exc))
    selected = _resolved(requested, services, include_dependencies=include_dependencies)
    return root, services, manager, selected


# --------------------------------------------------------------------------- commands


@app.command()
def up(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    host: Annotated[
        str | None,
        typer.Option(
            "--host", "-H", help="Host de bind do backend/web (ex.: 127.0.0.1 ou 0.0.0.0)."
        ),
    ] = None,
    timeout: Annotated[
        float,
        typer.Option("--timeout", "-t", min=1.0, help="Segundos de espera pelo health check."),
    ] = 60.0,
    wait: Annotated[
        bool,
        typer.Option("--wait/--no-wait", help="Aguardar o serviço ficar saudável."),
    ] = True,
    deps: Annotated[
        bool,
        typer.Option("--deps/--no-deps", help="Iniciar também as dependências."),
    ] = True,
) -> None:
    """Sobe os serviços (padrão: todos) em background e espera ficarem prontos."""
    _up_impl(services, host, timeout, wait, deps)


@app.command()
def start(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    host: Annotated[
        str | None,
        typer.Option(
            "--host", "-H", help="Host de bind do backend/web (ex.: 127.0.0.1 ou 0.0.0.0)."
        ),
    ] = None,
    timeout: Annotated[
        float,
        typer.Option("--timeout", "-t", min=1.0, help="Segundos de espera pelo health check."),
    ] = 60.0,
    wait: Annotated[
        bool,
        typer.Option("--wait/--no-wait", help="Aguardar o serviço ficar saudável."),
    ] = True,
    deps: Annotated[
        bool,
        typer.Option("--deps/--no-deps", help="Iniciar também as dependências."),
    ] = True,
) -> None:
    """Alias de up."""
    _up_impl(services, host, timeout, wait, deps)


@app.command()
def down(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    timeout: Annotated[
        float,
        typer.Option("--timeout", "-t", min=0.5, help="Segundos antes de enviar SIGKILL."),
    ] = 10.0,
    force: Annotated[
        bool,
        typer.Option("--force", "-f", help="Enviar SIGKILL imediatamente."),
    ] = False,
) -> None:
    """Para os serviços iniciados pelo CLI (padrão: todos)."""
    _down_impl(services, timeout, force)


@app.command()
def stop(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    timeout: Annotated[
        float,
        typer.Option("--timeout", "-t", min=0.5, help="Segundos antes de enviar SIGKILL."),
    ] = 10.0,
    force: Annotated[
        bool,
        typer.Option("--force", "-f", help="Enviar SIGKILL imediatamente."),
    ] = False,
) -> None:
    """Alias de down."""
    _down_impl(services, timeout, force)


@app.command()
def restart(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    host: Annotated[
        str | None,
        typer.Option(
            "--host", "-H", help="Host de bind do backend/web (ex.: 127.0.0.1 ou 0.0.0.0)."
        ),
    ] = None,
    timeout: Annotated[
        float,
        typer.Option("--timeout", "-t", min=1.0, help="Segundos de espera pelo health check."),
    ] = 60.0,
    wait: Annotated[
        bool,
        typer.Option("--wait/--no-wait", help="Aguardar o serviço ficar saudável."),
    ] = True,
) -> None:
    """Reinicia os serviços indicados (padrão: todos)."""
    _down_impl(services, timeout=10.0, force=False)
    _up_impl(services, host, timeout, wait, deps=True)


@app.command()
def status(
    services: Annotated[list[str] | None, typer.Argument(help=SERVICES_HELP)] = None,
    as_json: Annotated[
        bool,
        typer.Option("--json", help="Saída em JSON para scripts."),
    ] = False,
) -> None:
    """Mostra o estado, PID, porta, saúde e uptime dos serviços."""
    _root, _services, manager, selected = _selected_context(services, include_dependencies=False)

    statuses = [manager.status(service) for service in selected]

    if as_json:
        payload = [
            {
                "service": status.service.name,
                "label": status.service.label,
                "state": status.state,
                "managed": status.managed,
                "pid": status.pid,
                "port": status.service.port,
                "healthy": status.healthy,
                "url": status.service.url,
                "uptime_seconds": (round(status.uptime, 1) if status.uptime is not None else None),
            }
            for status in statuses
        ]
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    table = Table(
        title="ODIN V2 — servidores",
        box=box.SIMPLE_HEAD,
        title_justify="left",
        header_style="bold",
        caption=f"estado: {manager.run_dir} · logs: {manager.log_dir}",
        caption_justify="left",
    )
    table.add_column("Serviço", no_wrap=True)
    table.add_column("Estado", no_wrap=True)
    table.add_column("PID", justify="right", no_wrap=True)
    table.add_column("Porta", justify="right", no_wrap=True)
    table.add_column("Saúde", no_wrap=True)
    table.add_column("Uptime", justify="right", no_wrap=True)

    for item in statuses:
        table.add_row(
            f"[bold]{item.service.label}[/] [dim]({item.service.name})[/]",
            _state_cell(item),
            str(item.pid) if item.pid is not None else "[dim]—[/]",
            str(item.service.port),
            _health_cell(item),
            _format_duration(item.uptime),
        )

    console.print()
    console.print(table)
    urls = " · ".join(f"[bold]{item.service.name}[/] {item.service.url}" for item in statuses)
    console.print(f"[dim]URLs:[/] {urls}")
    console.print(
        "[dim]Dica: 'odin logs <serviço> -f' acompanha os logs; "
        "'odin doctor' valida os pré-requisitos.[/]"
    )


@app.command()
def logs(
    service: Annotated[str, typer.Argument(help="Serviço: hermes, backend, web ou mobile.")],
    lines: Annotated[
        int,
        typer.Option("--lines", "-n", min=1, max=10000, help="Quantidade de linhas finais."),
    ] = 50,
    follow: Annotated[
        bool,
        typer.Option("--follow", "-f", help="Acompanhar o arquivo em tempo real."),
    ] = False,
    path_only: Annotated[
        bool,
        typer.Option("--path", help="Imprimir apenas o caminho do arquivo de log."),
    ] = False,
) -> None:
    """Mostra os logs de um serviço gerenciado pelo CLI."""
    _root, services, manager = _context()
    service = canonical_service_name(service)
    if service not in services:
        _fail(f"serviço desconhecido: {service!r}. Disponíveis: {', '.join(services)}")

    path = manager.log_path(service)
    if path_only:
        typer.echo(path)
        return

    if not path.is_file():
        _fail(
            f"sem logs para {service} em {path}. "
            "Inicie o serviço com 'odin up' ou confira 'odin status'."
        )

    for line in read_last_lines(path, lines):
        sys.stdout.write(f"{line}\n")
    sys.stdout.flush()

    if not follow:
        return

    console.print(f"[dim]Seguindo {path} — Ctrl+C para sair.[/]")
    try:
        for line in iter_follow(path):
            sys.stdout.write(line)
            sys.stdout.flush()
    except KeyboardInterrupt:
        console.print("\n[dim]Parado.[/]")
    except BrokenPipeError:
        raise typer.Exit(0) from None


@app.command("open")
def open_target(
    target: Annotated[
        str,
        typer.Argument(help="Alvo: web, api, docs ou hermes."),
    ],
) -> None:
    """Abre uma URL do ambiente no navegador padrão."""
    _root, services, manager = _context()
    normalized = target.strip().lower()
    targets = {
        "web": ("web", services["web"].url),
        "api": ("backend", services["backend"].url),
        "docs": ("backend", f"{services['backend'].url}/docs"),
        "hermes": ("hermes", services["hermes"].url),
    }
    if normalized not in targets:
        _fail(f"alvo inválido: {target!r}. Use: {', '.join(targets)}")

    service_name, url = targets[normalized]
    service_status = manager.status(services[service_name])
    if service_status.state == "stopped":
        console.print(
            f"[yellow]atenção:[/] {services[service_name].label} não está rodando. "
            f"Abra mesmo assim ou execute 'odin up {service_name}'."
        )

    if webbrowser.open(url):
        console.print(f"[green]Abrindo[/] {url}")
    else:
        console.print(f"[yellow]Não foi possível abrir o navegador.[/] URL: {url}")


@app.command()
def doctor() -> None:
    """Valida pré-requisitos, configuração e o estado dos serviços."""
    try:
        root = find_repo_root()
    except ConfigError as exc:
        _fail(str(exc))
    if root is None:
        _fail(
            "repositório odin-v2 não encontrado. Execute dentro do repositório ou defina ODIN_ROOT."
        )

    try:
        services = build_services(root)
        manager = ProcessManager(root, services)
    except ConfigError as exc:
        _fail(str(exc))

    checks: list[tuple[str, str, str]] = []

    def add(name: str, state: str, detail: str) -> None:
        checks.append((name, state, detail))

    add("Repositório", "ok", str(root))
    add("CLI", "ok", f"odin {__version__} · Python {sys.version.split()[0]}")

    hermes_bin = shutil.which("hermes")
    add(
        "Hermes CLI",
        "ok" if hermes_bin else "fail",
        hermes_bin or "não encontrado no PATH (instale o Hermes Agent)",
    )

    node_bin = shutil.which("node")
    npm_bin = shutil.which("npm")
    add(
        "Node.js",
        "ok" if node_bin else "fail",
        node_bin or "não encontrado no PATH",
    )
    add(
        "npm",
        "ok" if npm_bin else "fail",
        npm_bin or "não encontrado no PATH",
    )

    backend_root = root / "backend"
    venv_python = backend_root / "venv" / "bin" / "python"
    add(
        "Backend venv",
        "ok" if venv_python.is_file() else "fail",
        (
            str(venv_python)
            if venv_python.is_file()
            else "não encontrado. Crie com: cd backend && python3 -m venv venv && "
            'venv/bin/pip install -e ".[dev]"'
        ),
    )

    backend_env = read_env_file(backend_root / ".env")
    secret = backend_env.get("SECRET_KEY", "")
    secret_ok = len(secret) >= 32 and not secret.lower().startswith(("your-", "sua-"))
    if not (backend_root / ".env").is_file():
        add(
            "Backend .env",
            "fail",
            "ausente. Copie ../.env.example para backend/.env e gere SECRET_KEY",
        )
    elif not secret_ok:
        add(
            "Backend .env",
            "fail",
            "SECRET_KEY ausente ou com menos de 32 caracteres",
        )
    else:
        add("Backend .env", "ok", str(backend_root / ".env"))

    if backend_env.get("HERMES_SESSION_TOKEN"):
        add("Token do Hermes", "ok", "HERMES_SESSION_TOKEN definido no backend/.env")
    else:
        add(
            "Token do Hermes",
            "warn",
            "HERMES_SESSION_TOKEN não definido (o backend tenta obtê-lo automaticamente)",
        )

    for label, modules_path, install_hint in (
        (
            "Deps web",
            root / "apps" / "web" / "node_modules",
            "cd apps/web && npm install",
        ),
        (
            "Deps mobile",
            root / "apps" / "mobile" / "node_modules",
            "cd apps/mobile && npm install",
        ),
    ):
        add(
            label,
            "ok" if modules_path.is_dir() else "fail",
            str(modules_path) if modules_path.is_dir() else f"ausente. Rode: {install_hint}",
        )

    mobile_env = root / "apps" / "mobile" / ".env"
    if mobile_env.is_file():
        add("Mobile .env", "ok", str(mobile_env))
    else:
        add(
            "Mobile .env",
            "warn",
            "ausente; o app usa 127.0.0.1 (ok para emulador). "
            "Para device físico, crie com EXPO_PUBLIC_API_URL=http://<ip-lan>:8000/api",
        )

    for name in SERVICE_ORDER:
        service_status = manager.status(services[name])
        if service_status.healthy:
            state = "ok"
            detail = f"respondendo em {services[name].url}"
        elif service_status.state == "stopped":
            state = "warn"
            detail = f"parado (use: odin up {name})"
        elif service_status.port_open:
            state = "warn"
            detail = f"porta {services[name].port} ocupada, mas sem health check"
        else:
            state = "warn"
            detail = "processo sem porta aberta (veja: odin logs " + name + " -f)"
        add(f"Serviço {name}", state, detail)

    table = Table(
        title="ODIN V2 — doctor",
        box=box.SIMPLE_HEAD,
        title_justify="left",
        header_style="bold",
    )
    table.add_column("Checagem", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Detalhe", overflow="fold")

    for name, state, detail in checks:
        label, style = CHECK_LABELS[state]
        table.add_row(name, f"[{style}]{label}[/]", detail)

    console.print()
    console.print(table)

    failures = sum(1 for _, state, _ in checks if state == "fail")
    warnings = sum(1 for _, state, _ in checks if state == "warn")
    if failures:
        console.print(
            f"\n[red]{failures} problema(s) crítico(s)[/] e "
            f"[yellow]{warnings} aviso(s)[/]. Corrija os itens acima."
        )
        raise typer.Exit(1)
    if warnings:
        console.print(f"\n[yellow]{warnings} aviso(s)[/], nenhum bloqueio crítico.")
        return
    console.print("\n[green]Tudo pronto.[/] Use 'odin up' para subir o ambiente.")


@app.command()
def version() -> None:
    """Mostra a versão do CLI."""
    typer.echo(f"odin {__version__}")


# --------------------------------------------------------------------- implementations


def _up_impl(
    requested: list[str] | None,
    host: str | None,
    timeout: float,
    wait: bool,
    include_dependencies: bool,
) -> None:
    root, _services, manager, selected = _selected_context(
        requested, host, include_dependencies=include_dependencies
    )

    console.print(f"\n[bold]Subindo[/] [dim]{root}[/]")
    failures: list[Service] = []

    for service in selected:
        try:
            current = manager.status(service)
        except ProcessError as exc:
            console.print(f"  [red]●[/] {service.label:<18} {escape(str(exc))}")
            failures.append(service)
            continue

        if current.state == "running":
            console.print(f"  [green]●[/] {service.label:<18} já em execução (PID {current.pid})")
            continue

        if current.state == "external":
            if current.healthy:
                console.print(
                    f"  [cyan]●[/] {service.label:<18} já em execução fora do CLI "
                    f"(porta {service.port})"
                )
            else:
                console.print(
                    f"  [red]●[/] {service.label:<18} porta {service.port} ocupada "
                    "por outro processo sem health check"
                )
                failures.append(service)
            continue

        action = "processo já existente"
        if not current.managed:
            try:
                result = manager.start(service)
            except ProcessError as exc:
                lines = str(exc).splitlines()
                console.print(f"  [red]●[/] {service.label:<18} {escape(lines[0])}")
                for detail in lines[1:]:
                    console.print(f"      [dim]{escape(detail)}[/]")
                failures.append(service)
                continue

            if result.outcome == "external":
                console.print(
                    f"  [cyan]●[/] {service.label:<18} já em execução fora do CLI "
                    f"(porta {service.port})"
                )
                continue
            action = "iniciado"

        if not wait:
            record = manager.read_record(service.name)
            pid = f"PID {record.pid}" if record is not None else f"porta {service.port}"
            console.print(
                f"  [green]●[/] {service.label:<18} {action} ({pid}), health check em segundo plano"
            )
            continue

        started = time.monotonic()
        with console.status(f"  [yellow]…[/] {service.label}: aguardando health check"):
            healthy = manager.wait_until_healthy(service, timeout)
        elapsed = time.monotonic() - started

        if healthy:
            record = manager.read_record(service.name)
            detail = f"PID {record.pid}" if record is not None else f"porta {service.port}"
            console.print(
                f"  [green]●[/] {service.label:<18} pronto em {elapsed:.1f}s · "
                f"{detail} · {service.url}"
            )
        else:
            console.print(f"  [red]●[/] {service.label:<18} sem resposta após {timeout:.0f}s")
            recent = manager.tail(service.name, 8)
            if recent:
                console.print("      [dim]últimas linhas do log:[/]")
                for line in recent:
                    console.print(f"      [dim]{escape(line)}[/]")
            console.print(f"      [dim]veja: odin logs {service.name} -f[/]")
            failures.append(service)

    if failures:
        names = ", ".join(service.name for service in failures)
        console.print(f"\n[red]Falha em:[/] {names}")
        raise typer.Exit(1)

    console.print(
        "\n[green]Servidores prontos.[/] "
        "[dim]Use 'odin status' para acompanhar ou 'odin logs <serviço> -f'.[/]"
    )


def _down_impl(
    requested: list[str] | None,
    timeout: float,
    force: bool,
) -> None:
    root, _services, manager, selected = _selected_context(requested, include_dependencies=False)

    console.print(f"\n[bold]Parando[/] [dim]{root}[/]")
    failures: list[Service] = []
    external: list[Service] = []

    for service in reversed(selected):
        try:
            result = manager.stop(service, timeout=timeout, force=force)
        except ProcessError as exc:
            console.print(f"  [red]●[/] {service.label:<18} {escape(str(exc))}")
            failures.append(service)
            continue

        if result.outcome == "stopped":
            console.print(f"  [green]●[/] {service.label:<18} encerrado em {result.elapsed:.1f}s")
        elif result.outcome == "forced":
            console.print(
                f"  [yellow]●[/] {service.label:<18} encerrado à força em {result.elapsed:.1f}s"
            )
        elif result.outcome == "not_running":
            console.print(f"  [dim]○[/] {service.label:<18} já estava parado")
        else:
            console.print(
                f"  [yellow]●[/] {service.label:<18} rodando fora do CLI — não foi encerrado"
            )
            external.append(service)

    if failures:
        names = ", ".join(service.name for service in failures)
        console.print(f"\n[red]Falha ao parar:[/] {names}")
        raise typer.Exit(1)

    if external:
        names = ", ".join(service.name for service in external)
        console.print(
            f"\n[yellow]Atenção:[/] {names} continuam em execução (não gerenciados pelo CLI)."
        )
    console.print("\n[green]Serviços gerenciados parados.[/]")


# ------------------------------------------------------------------------- callbacks


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"odin {__version__}")
        raise typer.Exit()


@app.callback()
def _root(
    version: Annotated[
        bool,
        typer.Option(
            "--version",
            "-V",
            help="Mostra a versão e sai.",
            is_eager=True,
            callback=_version_callback,
        ),
    ] = False,
) -> None:
    """Controle dos servidores de desenvolvimento do ODIN V2."""


def main() -> None:
    """Console script entry point."""
    app()


if __name__ == "__main__":
    main()
