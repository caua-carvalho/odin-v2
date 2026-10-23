"""ODIN V2 Backend — Hermes WebSocket Adapter

Communicates with Hermes Agent via its dashboard WebSocket endpoints.
Uses `/api/pty` for PTY-based chat sessions (primary method).
"""

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class HermesAdapterError(Exception):
    """Base exception for Hermes adapter errors."""

    pass


class HermesConnectionError(HermesAdapterError):
    """Failed to connect to Hermes."""

    pass


class HermesTimeoutError(HermesAdapterError):
    """Operation timed out."""

    pass


class HermesSession:
    """Represents a Hermes chat session with its WebSocket connection."""

    def __init__(
        self,
        session_id: str,
        hermes_session_id: str,
        websocket: websockets.WebSocketClientProtocol,
        message_handler: Callable[[dict], None],
    ):
        self.session_id = session_id
        self.hermes_session_id = hermes_session_id
        self.websocket = websocket
        self.message_handler = message_handler
        self._receive_task: Optional[asyncio.Task] = None
        self._closed = False

    async def start(self) -> None:
        """Start the receive loop."""
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self) -> None:
        """Continuously receive messages from Hermes."""
        try:
            async for message in self.websocket:
                if self._closed:
                    break
                try:
                    # Hermes PTY stream mixes JSON messages with raw terminal output
                    # Only process valid JSON lines
                    if isinstance(message, bytes):
                        message = message.decode('utf-8', errors='ignore')
                    
                    # Try to parse each line as JSON
                    for line in message.splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            self.message_handler(data)
                        except json.JSONDecodeError:
                            # Ignore non-JSON lines (ANSI escape codes, terminal output)
                            pass
                except Exception as e:
                    logger.warning(f"Error processing Hermes message: {e}")
        except ConnectionClosed:
            logger.info(f"Hermes connection closed for session {self.session_id}")
        except WebSocketException as e:
            logger.error(f"WebSocket error for session {self.session_id}: {e}")
        except Exception as e:
            logger.exception(f"Unexpected error in receive loop: {e}")

    async def send(self, message: dict) -> None:
        """Send a message to Hermes."""
        if self._closed:
            raise HermesConnectionError("Session is closed")
        await self.websocket.send(json.dumps(message))

    async def send_user_message(self, content: str) -> None:
        """Send a user message to the agent."""
        await self.send({"type": "user_message", "content": content})

    async def interrupt(self) -> None:
        """Interrupt the current run."""
        await self.send({"type": "interrupt"})

    async def approve(self, approval_id: str) -> None:
        """Approve a pending operation."""
        await self.send({"type": "approval", "decision": "approve", "approval_id": approval_id})

    async def deny(self, approval_id: str) -> None:
        """Deny a pending operation."""
        await self.send({"type": "approval", "decision": "deny", "approval_id": approval_id})

    async def close(self) -> None:
        """Close the session."""
        self._closed = True
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        await self.websocket.close()


class HermesAdapter:
    """Adapter for communicating with Hermes Agent via WebSocket."""

    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.base_url = self.settings.hermes_api_url.rstrip("/")
        self.session_token = self.settings.hermes_session_token
        self._sessions: Dict[str, HermesSession] = {}
        self._connect_lock = asyncio.Lock()

    def _ws_url(self, endpoint: str = "/api/pty", hermes_session_id: Optional[str] = None) -> str:
        """Convert HTTP URL to WebSocket URL with auth token."""
        ws_base = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        url = f"{ws_base}{endpoint}"
        params = []
        if self.session_token:
            params.append(f"token={self.session_token}")
        if hermes_session_id:
            params.append(f"session_id={hermes_session_id}")
        if params:
            url += "?" + "&".join(params)
        return url

    async def create_session(
        self,
        session_id: str,
        hermes_session_id: Optional[str] = None,
        message_handler: Optional[Callable[[dict], None]] = None,
    ) -> HermesSession:
        """Create a new Hermes session (or resume existing)."""
        async with self._connect_lock:
            # Check if we already have this session
            if session_id in self._sessions:
                existing = self._sessions[session_id]
                if not existing._closed:
                    return existing
                else:
                    del self._sessions[session_id]

            # Build connection URL with token as query param
            url = self._ws_url("/api/pty", hermes_session_id)

            logger.info(f"Connecting to Hermes at {url}")

            try:
                websocket = await asyncio.wait_for(
                    websockets.connect(
                        url,
                        open_timeout=self.settings.hermes_connect_timeout,
                        ping_interval=20,
                        ping_timeout=10,
                    ),
                    timeout=self.settings.hermes_connect_timeout,
                )
            except asyncio.TimeoutError:
                raise HermesConnectionError(f"Connection to Hermes timed out ({self.settings.hermes_connect_timeout}s)")
            except WebSocketException as e:
                raise HermesConnectionError(f"Failed to connect to Hermes: {e}")

            # Default message handler logs events
            def default_handler(msg: dict) -> None:
                logger.debug(f"Hermes event: {msg.get('type', 'unknown')}")

            session = HermesSession(
                session_id=session_id,
                hermes_session_id=hermes_session_id or "new",
                websocket=websocket,
                message_handler=message_handler or default_handler,
            )

            await session.start()
            self._sessions[session_id] = session

            # Wait for session_id confirmation from Hermes
            # Hermes sends: {"type": "session_started", "session_id": "..."}
            # We'll capture this in the message handler

            return session

    async def get_session(self, session_id: str) -> Optional[HermesSession]:
        """Get an existing session."""
        session = self._sessions.get(session_id)
        if session and session._closed:
            del self._sessions[session_id]
            return None
        return session

    async def close_session(self, session_id: str) -> None:
        """Close and remove a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.close()

    async def close_all(self) -> None:
        """Close all sessions."""
        for session in list(self._sessions.values()):
            await session.close()
        self._sessions.clear()

    async def send_message(self, session_id: str, content: str) -> None:
        """Send a user message to a session."""
        session = await self.get_session(session_id)
        if not session:
            raise HermesAdapterError(f"Session {session_id} not found")
        await session.send_user_message(content)

    async def interrupt_run(self, session_id: str) -> None:
        """Interrupt the current run in a session."""
        session = await self.get_session(session_id)
        if not session:
            raise HermesAdapterError(f"Session {session_id} not found")
        await session.interrupt()

    async def approve_operation(self, session_id: str, approval_id: str) -> None:
        """Approve a pending operation."""
        session = await self.get_session(session_id)
        if not session:
            raise HermesAdapterError(f"Session {session_id} not found")
        await session.approve(approval_id)

    async def deny_operation(self, session_id: str, approval_id: str) -> None:
        """Deny a pending operation."""
        session = await self.get_session(session_id)
        if not session:
            raise HermesAdapterError(f"Session {session_id} not found")
        await session.deny(approval_id)

    async def health_check(self) -> bool:
        """Check if Hermes is reachable."""
        import httpx

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/health")
                return response.status_code == 200
        except Exception:
            return False

    async def get_system_status(self) -> Optional[dict]:
        """Get Hermes system status."""
        import httpx

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                headers = self._headers()
                response = await client.get(f"{self.base_url}/api/status", headers=headers)
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.warning(f"Failed to get Hermes status: {e}")
        return None


# Singleton instance
_adapter: Optional[HermesAdapter] = None


def get_hermes_adapter() -> HermesAdapter:
    """Get the singleton Hermes adapter instance."""
    global _adapter
    if _adapter is None:
        _adapter = HermesAdapter()
    return _adapter


async def init_hermes_adapter(settings=None) -> HermesAdapter:
    """Initialize the Hermes adapter."""
    global _adapter
    _adapter = HermesAdapter(settings)
    return _adapter


async def close_hermes_adapter() -> None:
    """Close the Hermes adapter and all sessions."""
    global _adapter
    if _adapter:
        await _adapter.close_all()
        _adapter = None