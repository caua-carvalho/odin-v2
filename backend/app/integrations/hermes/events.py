"""ODIN V2 Backend — Hermes Event Processor

Processes raw Hermes WebSocket events into Odin's internal event format.
"""

import logging
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class HermesEventProcessor:
    """Processes Hermes WebSocket messages into structured events."""

    def __init__(self, on_event: Callable[[dict], None]):
        """
        Args:
            on_event: Callback function(event_dict) for processed events.
                      event_dict contains: type, data, timestamp
        """
        self.on_event = on_event
        self._pending_tool_calls: Dict[str, dict] = {}

    def process(self, raw_message: dict) -> None:
        """Process a raw message from Hermes WebSocket."""
        msg_type = raw_message.get("type", "unknown")

        # Map Hermes event types to Odin event types
        if msg_type == "session_started":
            self._handle_session_started(raw_message)
        elif msg_type == "token":
            self._handle_token(raw_message)
        elif msg_type == "tool_call" or msg_type == "tool_call_start":
            self._handle_tool_call_start(raw_message)
        elif msg_type == "tool_result" or msg_type == "tool_call_end":
            self._handle_tool_result(raw_message)
        elif msg_type == "approval_requested":
            self._handle_approval_requested(raw_message)
        elif msg_type == "turn_complete" or msg_type == "run_completed":
            self._handle_run_completed(raw_message)
        elif msg_type == "error" or msg_type == "run_failed":
            self._handle_error(raw_message)
        elif msg_type == "interrupted" or msg_type == "cancelled":
            self._handle_interrupted(raw_message)
        elif msg_type == "system":
            self._handle_system(raw_message)
        else:
            # Pass through unknown events
            self._emit("hermes_raw", raw_message)

    def _emit(self, event_type: str, data: dict) -> None:
        """Emit a processed event."""
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        self.on_event(event)

    def _handle_session_started(self, msg: dict) -> None:
        """Hermes session started/resumed."""
        session_id = msg.get("session_id")
        logger.info(f"Hermes session started: {session_id}")
        self._emit("session_started", {"hermes_session_id": session_id})

    def _handle_token(self, msg: dict) -> None:
        """Streaming token from agent."""
        delta = msg.get("content") or msg.get("delta") or ""
        if delta:
            self._emit("token", {"delta": delta})

    def _handle_tool_call_start(self, msg: dict) -> None:
        """Tool call started."""
        call_id = msg.get("call_id") or msg.get("id") or str(id(msg))
        tool_name = msg.get("tool") or msg.get("name") or "unknown"
        args = msg.get("args") or msg.get("arguments") or {}

        self._pending_tool_calls[call_id] = {
            "tool": tool_name,
            "args": args,
            "start_time": datetime.utcnow(),
        }

        self._emit("tool_call", {"tool": tool_name, "args": args, "call_id": call_id})

    def _handle_tool_result(self, msg: dict) -> None:
        """Tool call completed."""
        call_id = msg.get("call_id") or msg.get("id")
        result = msg.get("result") or msg.get("output") or ""
        is_error = msg.get("is_error") or msg.get("error") is not None
        error = msg.get("error") if is_error else None

        if call_id in self._pending_tool_calls:
            call_info = self._pending_tool_calls.pop(call_id)
            call_info["result"] = result
            call_info["is_error"] = is_error
            call_info["error"] = error
        else:
            call_info = {"tool": "unknown", "args": {}, "result": result, "is_error": is_error, "error": error}

        self._emit("tool_result", {"call_id": call_id, "result": result, "is_error": is_error, "error": error})

    def _handle_approval_requested(self, msg: dict) -> None:
        """Hermes requests approval for an operation."""
        approval_id = msg.get("approval_id") or msg.get("id")
        operation = msg.get("operation") or msg.get("tool") or "unknown"
        details = msg.get("details") or msg.get("args") or {}

        logger.warning(f"Approval requested: {approval_id} for {operation}")
        self._emit(
            "approval_requested",
            {"approval_id": approval_id, "operation": operation, "details": details},
        )

    def _handle_run_completed(self, msg: dict) -> None:
        """Run completed successfully."""
        result = msg.get("result") or msg.get("content") or ""
        self._emit("run_completed", {"result": result})

    def _handle_error(self, msg: dict) -> None:
        """Run failed with error."""
        error = msg.get("error") or msg.get("message") or "Unknown error"
        logger.error(f"Hermes run error: {error}")
        self._emit("run_failed", {"error": error})

    def _handle_interrupted(self, msg: dict) -> None:
        """Run was interrupted/cancelled."""
        reason = msg.get("reason") or "Interrupted"
        self._emit("run_cancelled", {"reason": reason})

    def _handle_system(self, msg: dict) -> None:
        """System message from Hermes."""
        content = msg.get("content") or str(msg)
        self._emit("system", {"content": content})


def create_event_processor(run_id: str, event_sink: Callable[[dict], None]) -> HermesEventProcessor:
    """Factory for creating an event processor tied to a run."""
    import asyncio

    def on_event(event: dict) -> None:
        event["run_id"] = run_id
        # Handle both sync and async event sinks
        result = event_sink(event)
        if asyncio.iscoroutine(result):
            # Schedule the coroutine to run
            asyncio.create_task(result)

    return HermesEventProcessor(on_event)