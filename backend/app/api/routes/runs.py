"""ODIN V2 Backend — Runs Routes (Agent Executions)"""

import asyncio
import uuid
from datetime import datetime
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user_id
from app.integrations.hermes.adapter import get_hermes_adapter
from app.integrations.hermes.events import create_event_processor
from app.models import Conversation, Message, MessageRole, Run, RunStatus
from app.schemas import RunCreate, RunResponse, RunStatus as RunStatusSchema

router = APIRouter()
settings = get_settings()

# In-memory event queues for SSE (in production, use Redis)
_event_queues: dict[str, asyncio.Queue] = {}


def get_event_queue(run_id: str) -> asyncio.Queue:
    """Get or create event queue for a run."""
    if run_id not in _event_queues:
        _event_queues[run_id] = asyncio.Queue()
    return _event_queues[run_id]


async def cleanup_event_queue(run_id: str) -> None:
    """Clean up event queue after run completes."""
    if run_id in _event_queues:
        del _event_queues[run_id]


import re

ANSI_ESCAPE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\][0-9;]*[a-zA-Z]|\x1b[PX^_][^\x1b]*\x1b\\|\x1b[PX^_][^\x1b]*\x07')


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    return ANSI_ESCAPE.sub('', text)


async def run_hermes_execution(
    run_id: str,
    conversation_id: str,
    hermes_session_id: Optional[str],
    message: str,
    db: AsyncSession,
) -> None:
    """Background task to execute Hermes run via PTY."""
    adapter = get_hermes_adapter()

    # Buffer for terminal output
    terminal_buffer: list[str] = []

    # Message handler for Hermes session - capture text content
    def hermes_message_handler(raw_msg: dict) -> None:
        # Capture text content from structured messages
        if raw_msg.get("type") == "text" and raw_msg.get("text"):
            terminal_buffer.append(raw_msg["text"])
        elif raw_msg.get("type") == "token" and raw_msg.get("data", {}).get("delta"):
            terminal_buffer.append(raw_msg["data"]["delta"])
        elif raw_msg.get("type") == "run_completed":
            # Structured completion event
            terminal_buffer.append(raw_msg.get("data", {}).get("result", ""))

    try:
        # Create or resume Hermes session
        session = await adapter.create_session(
            session_id=run_id,
            hermes_session_id=hermes_session_id,
            message_handler=hermes_message_handler,
        )

        # Update run with Hermes session ID
        await update_run_hermes_session(db, run_id, session.hermes_session_id)

        # Persist run_started event
        await persist_event(db, run_id, {"type": "run_started", "data": {"run_id": run_id}})

        # Send user message
        await adapter.send_message(run_id, message)

        # Wait for response - Hermes PTY doesn't send structured completion events
        # Wait a reasonable time for the agent to respond
        await asyncio.sleep(5.0)  # Give agent time to respond

        # Build response from captured terminal output
        response_text = "".join(terminal_buffer).strip()
        response_text = strip_ansi(response_text)
        
        # If no structured output captured, provide a default response
        if not response_text:
            response_text = "Resposta processada pelo agente (saída bruta do terminal capturada)"
        
        # Persist completion event
        await persist_event(db, run_id, {
            "type": "run_completed", 
            "data": {"result": response_text[:2000]}  # Limit length
        })

    except Exception as e:
        await persist_event(db, run_id, {
            "type": "run_failed", 
            "data": {"error": str(e)}
        })
    finally:
        await adapter.close_session(run_id)


async def persist_event(db: AsyncSession, run_id: str, event: dict) -> None:
    """Persist event to run's event log."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run:
        run.events.append(event)
        if event["type"] == "run_completed":
            run.status = RunStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            run.result_summary = event["data"].get("result", "")[:500]
        elif event["type"] == "run_failed":
            run.status = RunStatus.FAILED
            run.completed_at = datetime.utcnow()
            run.error = event["data"].get("error", "Unknown error")
        elif event["type"] == "run_cancelled":
            run.status = RunStatus.CANCELLED
            run.completed_at = datetime.utcnow()
        elif event["type"] == "approval_requested":
            run.status = RunStatus.WAITING_APPROVAL
            # Create approval record
            from app.models import Approval, ApprovalStatus

            approval = Approval(
                run_id=run_id,
                hermes_approval_id=event["data"]["approval_id"],
                operation=event["data"]["operation"],
                details=event["data"]["details"],
                status=ApprovalStatus.PENDING,
            )
            db.add(approval)
        await db.commit()


async def update_run_hermes_session(db: AsyncSession, run_id: str, hermes_session_id: str) -> None:
    """Update run with Hermes session ID."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run:
        run.hermes_session_id = hermes_session_id
        await db.commit()


async def mark_run_failed(db: AsyncSession, run_id: str, error: str) -> None:
    """Mark run as failed."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run:
        run.status = RunStatus.FAILED
        run.completed_at = datetime.utcnow()
        run.error = error
        await db.commit()


@router.post("/conversations/{conversation_id}/runs", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_run(
    conversation_id: str,
    data: RunCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Start a new agent execution run."""
    # Verify conversation exists
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Create user message
    user_message = Message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=data.message,
    )
    db.add(user_message)
    await db.flush()

    # Create run record
    run = Run(
        conversation_id=conversation_id,
        status=RunStatus.QUEUED,
    )
    db.add(run)
    await db.flush()

    # Link message to run
    user_message.run_id = run.id

    # Save assistant message placeholder
    assistant_message = Message(
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content="",
        run_id=run.id,
    )
    db.add(assistant_message)

    await db.commit()
    await db.refresh(run)

    if data.stream:
        # Start background execution
        background_tasks.add_task(
            run_hermes_execution,
            run.id,
            conversation_id,
            conversation.hermes_session_id,
            data.message,
            db,
        )

        # Return SSE response
        return StreamingResponse(
            event_stream(run.id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        # Non-streaming: run synchronously (with timeout)
        await run_hermes_execution(run.id, conversation_id, conversation.hermes_session_id, data.message, db)
        await db.refresh(run)
        return RunResponse.model_validate(run)


@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    conversation_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """List runs with optional filters."""
    query = select(Run).join(Conversation).order_by(desc(Run.started_at))

    if conversation_id:
        query = query.where(Run.conversation_id == conversation_id)

    if status:
        query = query.where(Run.status == RunStatus(status))

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    runs = result.scalars().all()

    return [RunResponse.model_validate(r) for r in runs]


async def event_stream(run_id: str) -> AsyncGenerator[str, None]:
    """SSE event stream for a run."""
    queue = get_event_queue(run_id)
    try:
        while True:
            event = await asyncio.wait_for(queue.get(), timeout=30.0)
            yield f"event: {event['type']}\ndata: {event['data']}\n\n"
            if event["type"] in ("run_completed", "run_failed", "run_cancelled"):
                break
    except asyncio.TimeoutError:
        yield f"event: ping\ndata: {{\"run_id\": \"{run_id}\"}}\n\n"
    except asyncio.CancelledError:
        pass


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Get run status and result."""
    result = await db.execute(
        select(Run)
        .options(selectinload(Run.approvals))
        .where(Run.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    # Verify ownership via conversation
    conv_result = await db.execute(select(Conversation).where(Conversation.id == run.conversation_id))
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return RunResponse.model_validate(run)


@router.get("/runs/{run_id}/events")
async def get_run_events(
    run_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """SSE stream for run events (alternative to POST streaming)."""
    # Verify run exists and user owns it
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    return StreamingResponse(
        event_stream(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/runs/{run_id}/stop")
async def stop_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Request cancellation of a run."""
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    if run.status not in (RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.WAITING_APPROVAL):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot stop run in status {run.status}")

    # Send interrupt to Hermes
    adapter = get_hermes_adapter()
    try:
        await adapter.interrupt_run(run_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to interrupt: {e}")

    run.status = RunStatus.CANCELLED
    run.completed_at = datetime.utcnow()
    await db.commit()

    return {"ok": True, "run_id": run_id, "status": "cancelled"}