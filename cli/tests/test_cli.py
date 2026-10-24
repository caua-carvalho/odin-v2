"""Tests for the ODIN CLI."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from typer.testing import CliRunner

from odin_cli.config import (
    ConfigError,
    Service,
    build_services,
    find_repo_root,
    resolve_services,
)
from odin_cli.main import app
from odin_cli.process import (
    ProcessManager,
    read_last_lines,
)


@pytest.fixture()
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "backend" / "app").mkdir(parents=True)
    (tmp_path / "backend" / "app" / "main.py").write_text("")
    (tmp_path / "backend" / ".env").write_text("API_PORT=8123\nAPI_HOST=127.0.0.1\n")
    (tmp_path / "apps" / "web").mkdir(parents=True)
    (tmp_path / "apps" / "mobile").mkdir(parents=True)
    monkeypatch.setenv("ODIN_ROOT", str(tmp_path))
    return tmp_path


def test_build_services_repo_ports(repo: Path) -> None:
    services = build_services(repo)

    assert list(services) == ["hermes", "backend", "web", "mobile"]
    assert services["backend"].port == 8123
    assert services["web"].port == 5173
    assert services["mobile"].port == 8081
    assert services["backend"].depends_on == ("hermes",)
    assert services["web"].depends_on == ("backend",)


def test_host_override_keeps_hermes_local(repo: Path) -> None:
    services = build_services(repo, host_override="0.0.0.0")

    assert services["backend"].host == "0.0.0.0"
    assert services["web"].host == "0.0.0.0"
    assert services["hermes"].host == "127.0.0.1"


def test_resolve_services_includes_dependencies_in_start_order() -> None:
    services = {
        "hermes": Service("hermes", "H", "", Path("."), ("true",), 1, "127.0.0.1"),
        "backend": Service(
            "backend",
            "B",
            "",
            Path("."),
            ("true",),
            2,
            "127.0.0.1",
            depends_on=("hermes",),
        ),
        "web": Service(
            "web",
            "W",
            "",
            Path("."),
            ("true",),
            3,
            "127.0.0.1",
            depends_on=("backend",),
        ),
    }

    assert [service.name for service in resolve_services(["web"], services)] == [
        "hermes",
        "backend",
        "web",
    ]
    assert [
        service.name for service in resolve_services(["web"], services, include_dependencies=False)
    ] == ["web"]


def test_resolve_services_rejects_unknown_names() -> None:
    services = build_services(Path("/tmp"))
    with pytest.raises(ConfigError, match="desconhecido"):
        resolve_services(["nope"], services)


def test_resolve_service_aliases(repo: Path) -> None:
    services = build_services(repo)

    assert [service.name for service in resolve_services(["frontend"], services)] == [
        "hermes",
        "backend",
        "web",
    ]
    assert [service.name for service in resolve_services(["all"], services)] == [
        "hermes",
        "backend",
        "web",
        "mobile",
    ]


def test_read_last_lines(tmp_path: Path) -> None:
    path = tmp_path / "service.log"
    path.write_text("\n".join(f"linha {index}" for index in range(100)) + "\n")

    assert read_last_lines(path, 3) == ["linha 97", "linha 98", "linha 99"]
    assert read_last_lines(tmp_path / "missing.log", 3) == []


def test_process_manager_start_status_stop(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ODIN_STATE_DIR", str(repo / ".state"))
    service = Service(
        name="dummy",
        label="Dummy",
        description="test service",
        cwd=repo,
        command=(sys.executable, "-c", "import time; time.sleep(30)"),
        port=65530,
        host="127.0.0.1",
        health_url=None,
    )
    manager = ProcessManager(repo, {"dummy": service})

    result = manager.start(service)
    assert result.outcome == "started"
    assert manager.read_record("dummy") is not None

    current = manager.status(service)
    assert current.state in {"starting", "unhealthy"}
    assert current.pid is not None
    assert current.port_open is False

    stopped = manager.stop(service, timeout=3.0)
    assert stopped.outcome == "stopped"
    assert manager.read_record("dummy") is None


def test_status_and_logs_cli(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ODIN_STATE_DIR", str(repo / ".state"))
    runner = CliRunner()

    status = runner.invoke(app, ["status", "--json"])
    assert status.exit_code == 0, status.output
    assert '"service": "hermes"' in status.output

    log_dir = repo / ".state" / "logs"
    log_dir.mkdir(parents=True)
    (log_dir / "backend.log").write_text("hello log\n")
    logs = runner.invoke(app, ["logs", "backend", "-n", "5"])
    assert logs.exit_code == 0
    assert "hello log" in logs.output


def test_cli_help_and_version() -> None:
    runner = CliRunner()
    help_result = runner.invoke(app, ["--help"])
    assert help_result.exit_code == 0
    assert "up" in help_result.output

    version = runner.invoke(app, ["--version"])
    assert version.exit_code == 0
    assert "odin " in version.output


def test_find_repo_root_uses_env(repo: Path) -> None:
    assert find_repo_root() == repo
