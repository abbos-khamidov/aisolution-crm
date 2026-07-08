from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import CurrentUser, require_founder
from app.db.pool import get_pool

router = APIRouter(prefix="/crm-goal", tags=["crm-goal"])


class GoalPatch(BaseModel):
    target_amount: Decimal
    currency: str = "USD"
    year: int = 2026


async def _current_progress(pool) -> Decimal:
    value = await pool.fetchval(
        """
        SELECT COALESCE(SUM(amount), 0)
        FROM finance_entries
        WHERE deleted_at IS NULL
          AND type = 'invoice'
        """
    )
    return Decimal(value or 0)


@router.get("")
async def get_goal(user: CurrentUser = Depends(require_founder)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow("SELECT value FROM crm_settings WHERE key = 'goal_2026'")
    value = row["value"] if row else {}
    target = Decimal(str(value.get("target_amount", 0)))
    current = await _current_progress(pool)
    remaining = max(Decimal("0"), target - current)
    percent = float((current / target * 100) if target else 0)
    return {
        "year": value.get("year", 2026),
        "currency": value.get("currency", "USD"),
        "target_amount": str(target),
        "current_amount": str(current),
        "remaining_amount": str(remaining),
        "percent": min(100, round(percent, 1)),
    }


@router.patch("")
async def patch_goal(body: GoalPatch, user: CurrentUser = Depends(require_founder)) -> dict:
    pool = get_pool()
    value = {
        "year": body.year,
        "target_amount": str(body.target_amount),
        "currency": body.currency,
    }
    await pool.execute(
        """
        INSERT INTO crm_settings (key, value)
        VALUES ('goal_2026', $1)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = now()
        """,
        value,
    )
    return await get_goal(user)
