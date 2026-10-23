"""ODIN V2 Backend — Approvals Routes"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.integrations.hermes.adapter import get_hermes_adapter
from app.models import Approval, ApprovalStatus, Run
from app.schemas import ApprovalActionResponse, ApprovalListResponse, ApprovalResponse

router = APIRouter()


@router.get("", response_model=ApprovalListResponse)
async def list_approvals(
    status: str = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """List pending approvals."""
    query = select(Approval).join(Run).order_by(Approval.created_at.desc())

    if status:
        query = query.where(Approval.status == ApprovalStatus(status))

    result = await db.execute(query)
    approvals = result.scalars().all()

    items = [ApprovalResponse.model_validate(a) for a in approvals]
    return ApprovalListResponse(items=items)


@router.get("/{approval_id}", response_model=ApprovalResponse)
async def get_approval(
    approval_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Get approval details."""
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    return ApprovalResponse.model_validate(approval)


@router.post("/{approval_id}/approve", response_model=ApprovalActionResponse)
async def approve_operation(
    approval_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Approve a pending operation."""
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")

    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Approval already {approval.status}")

    # Send approval to Hermes
    adapter = get_hermes_adapter()
    try:
        await adapter.approve_operation(approval.run_id, approval.hermes_approval_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to approve: {e}")

    approval.status = ApprovalStatus.APPROVED
    approval.resolved_at = __import__("datetime").datetime.utcnow()
    await db.commit()

    return ApprovalActionResponse(ok=True, approval_id=approval_id, status="approved")


@router.post("/{approval_id}/deny", response_model=ApprovalActionResponse)
async def deny_operation(
    approval_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Deny a pending operation."""
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")

    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Approval already {approval.status}")

    # Send denial to Hermes
    adapter = get_hermes_adapter()
    try:
        await adapter.deny_operation(approval.run_id, approval.hermes_approval_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to deny: {e}")

    approval.status = ApprovalStatus.DENIED
    approval.resolved_at = __import__("datetime").datetime.utcnow()
    await db.commit()

    return ApprovalActionResponse(ok=True, approval_id=approval_id, status="denied")