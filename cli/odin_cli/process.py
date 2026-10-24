"""Background process management with PID files and per-service logs."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from odin_cli.config import Service
from odin_cli.health import check_health, tcp_ok

STARTING_GRACE_SECONDS = 15.0
DEFAULT_STOP_TIMEOUT = 10.0
DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024


class ProcessError(RuntimeError):
    """Raised when a managed process cannot be started or stopped."""


@dataclass(frozen=True)
class ProcessRecord:
    """Metadata persisted for a process started by the CLI."""

    pid: int
    service: str
    command: tuple[str, ...]
    started_at: float
    proc_start: int | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "pid": self.pid,
            "service": self.service,
            "command": list(self.command),
            "started_at": self.started_at,
            "proc_start": self.proc_start,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> ProcessRecord:
        proc_start = data.get("proc_start")
        return cls(
            pid=int(data["pid"]),
            service=str(data["service"]),
            command=tuple(str(part) for part in data.get("command", [])),  # type: ignore[union-attr]
            started_at=float(data["started_at"]),
            proc_start=int(proc_start) if proc_start is not None else None,
        )


@dataclass(frozen=True)
class StartResult:
    outcome: Literal["started", "already_managed", "external"]
    record: ProcessRecord | None = None


@dataclass(frozen=True)
class StopResult:
    outcome: Literal["stopped", "forced", "not_running", "external"]
    record: ProcessRecord | None = None
    elapsed: float = 0.0


@dataclass(frozen=True)
class ServiceStatus:
    service: Service
    state: Literal["running", "external", "starting", "unhealthy", "stopped"]
    pid: int | None
    managed: bool
    healthy: bool
    port_open: bool
    started_at: float | None

    @property
    def uptime(self) -> float | None:
        if self.started_at is None:
            return None
        return max(0.0, time.time() - self.started_at)


def _proc_stat_fields(pid: int) -> list[str] | None:
    """Return the fields after the comm field from /proc/<pid>/stat."""
    try:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    _, separator, tail = raw.rpartition(")")
    if not separator:
        return None
    return tail.strip().split()


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    fields = _proc_stat_fields(pid)
    return not (fields and fields[0] == "Z")


def _proc_start_time(pid: int) -> int | None:
    fields = _proc_stat_fields(pid)
    if fields is None or len(fields) < 20:
        return None
    try:
        return int(fields[19])
    except ValueError:
        return None


def _group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _group_has_live_processes(pgid: int) -> bool:
    """Like _group_alive, but ignore zombies that have not been reaped yet."""
    proc = Path("/proc")
    if not proc.is_dir():
        return _group_alive(pgid)

    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        fields = _proc_stat_fields(int(entry.name))
        if fields is None or len(fields) < 3:
            continue
        if fields[0] != "Z" and fields[2] == str(pgid):
            return True
    return False


def read_last_lines(path: Path, count: int) -> list[str]:
    """Read the last ``count`` lines of a file without loading all of it."""
    if count <= 0 or not path.is_file():
        return []

    with path.open("rb") as handle:
        handle.seek(0, os.SEEK_END)
        position = handle.tell()
        data = b""
        while position > 0 and data.count(b"\n") <= count:
            size = min(8192, position)
            position -= size
            handle.seek(position)
            data = handle.read(size) + data

    return data.decode("utf-8", errors="replace").splitlines()[-count:]


def iter_follow(path: Path, poll_interval: float = 0.3) -> Iterator[str]:
    """Yield lines appended to a log file, surviving truncation and rotation."""
    first_open = True
    while True:
        if not path.is_file():
            time.sleep(poll_interval)
            continue

        with path.open("r", encoding="utf-8", errors="replace") as handle:
            if first_open:
                handle.seek(0, os.SEEK_END)
                first_open = False
            inode = os.fstat(handle.fileno()).st_ino

            while True:
                line = handle.readline()
                if line:
                    yield line
                    continue

                time.sleep(poll_interval)
                try:
                    stat = path.stat()
                except FileNotFoundError:
                    break
                if stat.st_ino != inode or stat.st_size < handle.tell():
                    break


class ProcessManager:
    """Start, stop and inspect the ODIN development services."""

    def __init__(
        self,
        root: Path,
        services: Mapping[str, Service],
        state_dir: Path | None = None,
    ) -> None:
        self.root = root
        self.services = services

        env_state = os.environ.get("ODIN_STATE_DIR")
        if state_dir is None and env_state:
            candidate = Path(env_state).expanduser()
            state_dir = candidate if candidate.is_absolute() else root / candidate
        self.state_dir = (state_dir or root / ".odin").resolve()
        self.run_dir = self.state_dir / "run"
        self.log_dir = self.state_dir / "logs"

    # ------------------------------------------------------------------ paths

    def record_path(self, name: str) -> Path:
        return self.run_dir / f"{name}.json"

    def log_path(self, name: str) -> Path:
        return self.log_dir / f"{name}.log"

    def _ensure_dirs(self) -> None:
        try:
            self.run_dir.mkdir(parents=True, exist_ok=True)
            self.log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ProcessError(f"Não foi possível criar {self.state_dir}: {exc}") from exc

    # --------------------------------------------------------------- records

    def _write_record(self, record: ProcessRecord) -> None:
        self._ensure_dirs()
        path = self.record_path(record.service)
        temporary = path.with_suffix(".json.tmp")
        try:
            temporary.write_text(json.dumps(record.to_dict(), indent=2), encoding="utf-8")
            os.replace(temporary, path)
        except OSError as exc:
            raise ProcessError(f"Não foi possível salvar o PID de {record.service}: {exc}") from exc

    def _remove_record(self, name: str) -> None:
        try:
            self.record_path(name).unlink()
        except FileNotFoundError:
            pass
        except OSError:
            pass

    def read_record(self, name: str) -> ProcessRecord | None:
        path = self.record_path(name)
        if not path.is_file():
            return None

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            record = ProcessRecord.from_dict(data)
        except (OSError, ValueError, KeyError, TypeError):
            self._remove_record(name)
            return None

        if record.service != name or not _pid_alive(record.pid):
            self._remove_record(name)
            return None

        current_start = _proc_start_time(record.pid)
        if (
            record.proc_start is not None
            and current_start is not None
            and record.proc_start != current_start
        ):
            self._remove_record(name)
            return None
        return record

    # ---------------------------------------------------------------- actions

    def start(self, service: Service) -> StartResult:
        record = self.read_record(service.name)
        if record is not None:
            return StartResult("already_managed", record)

        if tcp_ok(service.port, service.probe_host):
            if check_health(service):
                return StartResult("external")
            raise ProcessError(
                f"A porta {service.port} de {service.label} já está em uso por outro "
                "processo e não responde ao health check."
            )

        if not service.cwd.is_dir():
            raise ProcessError(f"Diretório não encontrado para {service.label}: {service.cwd}")

        self._ensure_dirs()
        log_path = self.log_path(service.name)
        self._rotate_log(log_path)

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        environment = os.environ.copy()
        environment.update(service.env)

        try:
            with log_path.open("a", encoding="utf-8", errors="replace") as log_file:
                log_file.write(f"\n===== odin: iniciando {service.name} em {timestamp} =====\n")
                log_file.flush()
                process = subprocess.Popen(
                    service.command,
                    cwd=service.cwd,
                    env=environment,
                    stdin=subprocess.DEVNULL,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                    close_fds=True,
                )
        except FileNotFoundError as exc:
            raise ProcessError(
                f"Comando não encontrado para {service.label}: {service.command[0]}. "
                "Execute 'odin doctor' para verificar os pré-requisitos."
            ) from exc
        except OSError as exc:
            raise ProcessError(f"Falha ao iniciar {service.label}: {exc}") from exc

        time.sleep(0.5)
        exit_code = process.poll()
        if exit_code is not None:
            tail = "\n".join(read_last_lines(log_path, 15)) or "(sem saída)"
            raise ProcessError(
                f"{service.label} encerrou logo após iniciar (código {exit_code}).\n{tail}"
            )

        record = ProcessRecord(
            pid=process.pid,
            service=service.name,
            command=service.command,
            started_at=time.time(),
            proc_start=_proc_start_time(process.pid),
        )
        try:
            self._write_record(record)
        except ProcessError:
            self._signal(record, signal.SIGKILL)
            raise

        return StartResult("started", record)

    def stop(
        self,
        service: Service,
        timeout: float = DEFAULT_STOP_TIMEOUT,
        *,
        force: bool = False,
    ) -> StopResult:
        record = self.read_record(service.name)
        if record is None:
            if tcp_ok(service.port, service.probe_host):
                return StopResult("external")
            return StopResult("not_running")

        started = time.monotonic()
        forced = force
        self._signal(record, signal.SIGKILL if force else signal.SIGTERM)

        deadline = started + max(0.5, timeout)
        while time.monotonic() < deadline:
            if not self._record_alive(record):
                self._remove_record(service.name)
                outcome: Literal["stopped", "forced"] = "forced" if forced else "stopped"
                return StopResult(outcome, record, time.monotonic() - started)
            time.sleep(0.1)

        self._signal(record, signal.SIGKILL, ignore_missing=True)
        forced = True
        kill_deadline = time.monotonic() + 3.0
        while time.monotonic() < kill_deadline:
            if not self._record_alive(record):
                self._remove_record(service.name)
                return StopResult("forced", record, time.monotonic() - started)
            time.sleep(0.1)

        raise ProcessError(
            f"Não foi possível encerrar {service.label} (PID {record.pid}) nem com SIGKILL."
        )

    def status(self, service: Service) -> ServiceStatus:
        record = self.read_record(service.name)
        port_open = tcp_ok(service.port, service.probe_host)
        healthy = check_health(service) if (record is not None or port_open) else False

        if record is not None:
            if healthy:
                state: Literal["running", "unhealthy", "starting"] = "running"
            elif port_open:
                state = "unhealthy"
            elif time.time() - record.started_at < STARTING_GRACE_SECONDS:
                state = "starting"
            else:
                state = "unhealthy"
        elif port_open:
            state = "external"
        else:
            state = "stopped"

        return ServiceStatus(
            service=service,
            state=state,
            pid=record.pid if record is not None else None,
            managed=record is not None,
            healthy=healthy,
            port_open=port_open,
            started_at=record.started_at if record is not None else None,
        )

    def wait_until_healthy(self, service: Service, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if check_health(service):
                return True
            if self.read_record(service.name) is None and not tcp_ok(
                service.port, service.probe_host
            ):
                return False
            time.sleep(0.25)
        return False

    # ----------------------------------------------------------------- helpers

    def tail(self, name: str, lines: int = 20) -> list[str]:
        return read_last_lines(self.log_path(name), lines)

    def _record_alive(self, record: ProcessRecord) -> bool:
        if _pid_alive(record.pid):
            return True
        return _group_has_live_processes(record.pid)

    def _signal(
        self,
        record: ProcessRecord,
        sig: signal.Signals,
        *,
        ignore_missing: bool = False,
    ) -> None:
        try:
            try:
                pgid = os.getpgid(record.pid)
            except ProcessLookupError:
                pgid = None
            if pgid == record.pid:
                os.killpg(pgid, sig)
            else:
                os.kill(record.pid, sig)
        except ProcessLookupError:
            if ignore_missing:
                return
            raise ProcessError(
                f"O processo de {record.service} (PID {record.pid}) já não existe."
            ) from None
        except PermissionError as exc:
            raise ProcessError(
                f"Sem permissão para encerrar {record.service} (PID {record.pid})."
            ) from exc

    def _rotate_log(self, path: Path) -> None:
        raw_limit = os.environ.get("ODIN_LOG_MAX_BYTES")
        try:
            limit = int(raw_limit) if raw_limit else DEFAULT_LOG_MAX_BYTES
        except ValueError:
            limit = DEFAULT_LOG_MAX_BYTES
        if limit <= 0:
            return
        try:
            if path.is_file() and path.stat().st_size > limit:
                rotated = path.with_suffix(path.suffix + ".1")
                os.replace(path, rotated)
        except OSError:
            pass
