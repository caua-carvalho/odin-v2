"""Health checks used by the process manager and the status command."""

from __future__ import annotations

import socket
import urllib.error
import urllib.request

from odin_cli.config import Service


def tcp_ok(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    """Return True when something accepts TCP connections on host:port."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_ok(url: str, timeout: float = 2.0) -> bool:
    """Return True when an HTTP endpoint responds (4xx still means the server is up)."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 500
    except urllib.error.HTTPError as exc:
        return exc.code < 500
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return False


def check_health(service: Service) -> bool:
    """Check a service using its configured health strategy."""
    if service.health_url:
        return http_ok(service.health_url)
    return tcp_ok(service.port, service.probe_host)
