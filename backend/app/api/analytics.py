from fastapi import APIRouter, Depends

from app.api.finance import compute_finance_summary
from app.core.deps import CurrentUser, require_founder
from app.db.pool import get_pool

router = APIRouter(prefix="/analytics", tags=["analytics"])

FUNNEL_STATUSES = ("new", "contacted", "qualified", "proposal_sent", "won", "lost")


@router.get("/funnel")
async def funnel(user: CurrentUser = Depends(require_founder)) -> dict:
    """Reconstructs status history purely from `events` (CRM_SPEC.md section 5:
    computed from events + aggregates, not a separate analytics table).
    `created` events imply the initial status 'new'; `status_changed` events
    carry {from, to} in their payload.
    """
    pool = get_pool()

    reached = await pool.fetch(
        """
        WITH status_history AS (
            SELECT entity_id AS lead_id, 'new' AS status
            FROM events WHERE entity_type = 'lead' AND event_type = 'created'
            UNION
            SELECT entity_id, payload->>'to'
            FROM events WHERE entity_type = 'lead' AND event_type = 'status_changed'
        )
        SELECT status, COUNT(DISTINCT lead_id) AS reached_count
        FROM status_history
        GROUP BY status
        """
    )
    reached_by_status = {r["status"]: r["reached_count"] for r in reached}

    avg_time = await pool.fetch(
        """
        WITH status_events AS (
            SELECT entity_id AS lead_id, created_at AS entered_at, 'new' AS status
            FROM events WHERE entity_type = 'lead' AND event_type = 'created'
            UNION ALL
            SELECT entity_id, created_at, payload->>'to'
            FROM events WHERE entity_type = 'lead' AND event_type = 'status_changed'
        ),
        with_next AS (
            SELECT
                lead_id, status, entered_at,
                LEAD(entered_at) OVER (PARTITION BY lead_id ORDER BY entered_at) AS next_entered_at
            FROM status_events
        )
        SELECT
            status,
            AVG(EXTRACT(EPOCH FROM (COALESCE(next_entered_at, now()) - entered_at)) / 3600)
                AS avg_hours_in_status
        FROM with_next
        GROUP BY status
        """
    )
    avg_hours_by_status = {r["status"]: float(r["avg_hours_in_status"]) for r in avg_time}

    return {
        "funnel": [
            {
                "status": s,
                "reached_count": reached_by_status.get(s, 0),
                "avg_hours_in_status": avg_hours_by_status.get(s),
            }
            for s in FUNNEL_STATUSES
        ]
    }


@router.get("/conversion-by-source")
async def conversion_by_source(user: CurrentUser = Depends(require_founder)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            source,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'won') AS won,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE status = 'won') / NULLIF(COUNT(*), 0), 1
            ) AS conversion_pct
        FROM leads
        WHERE deleted_at IS NULL
        GROUP BY source
        ORDER BY source
        """
    )
    return [dict(r) for r in rows]


@router.get("/loss-reasons")
async def loss_reasons(user: CurrentUser = Depends(require_founder)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT loss_reason, COUNT(*) AS count
        FROM leads
        WHERE deleted_at IS NULL AND status = 'lost'
        GROUP BY loss_reason
        ORDER BY count DESC
        """
    )
    return [dict(r) for r in rows]


@router.get("/revenue")
async def revenue(user: CurrentUser = Depends(require_founder)) -> dict:
    return await compute_finance_summary(get_pool())


@router.get("/team-load")
async def team_load(user: CurrentUser = Depends(require_founder)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            u.id AS user_id,
            u.name AS user_name,
            COUNT(*) AS total_tasks,
            COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)
                AS overdue_tasks
        FROM tasks t
        JOIN users u ON u.id = t.assigned_to
        WHERE t.deleted_at IS NULL
        GROUP BY u.id, u.name
        ORDER BY total_tasks DESC
        """
    )
    return [dict(r) for r in rows]


@router.get("/manager-performance")
async def manager_performance(user: CurrentUser = Depends(require_founder)) -> list[dict]:
    """Post-MVP analytics expansion (2026-07-08, founder-requested "фарш"):
    per-manager leaderboard — leads owned/won, conversion, revenue collected
    on their projects, and average time to first response. Revenue sums raw
    `amount` across currencies without conversion, same simplification
    `compute_finance_summary` already makes.
    """
    pool = get_pool()
    rows = await pool.fetch(
        """
        WITH lead_stats AS (
            SELECT
                owner_id,
                COUNT(*) AS leads_owned,
                COUNT(*) FILTER (WHERE status = 'won') AS leads_won,
                AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)
                    AS avg_first_response_hours
            FROM leads
            WHERE deleted_at IS NULL AND owner_id IS NOT NULL
            GROUP BY owner_id
        ),
        revenue_stats AS (
            SELECT
                p.owner_id,
                COALESCE(
                    SUM(fe.amount) FILTER (WHERE fe.type = 'invoice' AND fe.status = 'paid'), 0
                ) AS revenue_paid
            FROM projects p
            JOIN finance_entries fe ON fe.project_id = p.id AND fe.deleted_at IS NULL
            WHERE p.deleted_at IS NULL AND p.owner_id IS NOT NULL
            GROUP BY p.owner_id
        )
        SELECT
            u.id AS user_id,
            u.name AS user_name,
            COALESCE(ls.leads_owned, 0) AS leads_owned,
            COALESCE(ls.leads_won, 0) AS leads_won,
            ROUND(
                100.0 * COALESCE(ls.leads_won, 0) / NULLIF(ls.leads_owned, 0), 1
            ) AS conversion_pct,
            ls.avg_first_response_hours,
            COALESCE(rs.revenue_paid, 0) AS revenue_paid
        FROM users u
        LEFT JOIN lead_stats ls ON ls.owner_id = u.id
        LEFT JOIN revenue_stats rs ON rs.owner_id = u.id
        WHERE u.role = 'manager' AND u.deleted_at IS NULL
        ORDER BY revenue_paid DESC, leads_won DESC
        """
    )
    return [dict(r) for r in rows]


@router.get("/leads-by-channel-over-time")
async def leads_by_channel_over_time(user: CurrentUser = Depends(require_founder)) -> list[dict]:
    """Post-MVP analytics expansion (2026-07-08): monthly lead volume per
    source, for a channel-comparison trend chart.
    """
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            source,
            COUNT(*) AS count
        FROM leads
        WHERE deleted_at IS NULL
        GROUP BY 1, 2
        ORDER BY 1, 2
        """
    )
    return [dict(r) for r in rows]


@router.get("/stale-leads")
async def stale_leads(days: int = 7, user: CurrentUser = Depends(require_founder)) -> list[dict]:
    """Leads with no `events` activity for > `days` (default 7, CRM_SPEC.md
    section 5: "лиды без activity > N дней"), excluding closed leads.
    """
    pool = get_pool()
    rows = await pool.fetch(
        """
        WITH last_activity AS (
            SELECT entity_id AS lead_id, MAX(created_at) AS last_event_at
            FROM events
            WHERE entity_type = 'lead'
            GROUP BY entity_id
        )
        SELECT
            l.id, l.name, l.status, l.owner_id, la.last_event_at,
            EXTRACT(DAY FROM (now() - la.last_event_at))::int AS days_since_activity
        FROM leads l
        JOIN last_activity la ON la.lead_id = l.id
        WHERE l.deleted_at IS NULL
          AND l.status NOT IN ('won', 'lost')
          AND la.last_event_at < now() - make_interval(days => $1)
        ORDER BY days_since_activity DESC
        """,
        days,
    )
    return [dict(r) for r in rows]
