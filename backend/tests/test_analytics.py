import datetime as dt

import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_analytics_endpoints_are_founder_only(client, db):
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    for path in (
        "/analytics/funnel",
        "/analytics/conversion-by-source",
        "/analytics/loss-reasons",
        "/analytics/revenue",
        "/analytics/team-load",
        "/analytics/stale-leads",
    ):
        resp = await client.get(path, headers=auth_headers(manager_token))
        assert resp.status_code == 403, path


@pytest.mark.asyncio
async def test_funnel_reflects_events_history(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")

    lead = await client.post("/leads/webhook/website", json={"name": "Lead A"})
    lead_id = lead.json()["id"]
    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(manager_token))
    await client.patch(
        f"/leads/{lead_id}",
        json={"status": "contacted"},
        headers=auth_headers(manager_token),
    )
    await client.patch(
        f"/leads/{lead_id}",
        json={"status": "lost", "loss_reason": "no budget"},
        headers=auth_headers(manager_token),
    )

    events = await db.fetch(
        "SELECT event_type, payload FROM events WHERE entity_type = 'lead' AND entity_id = $1 "
        "ORDER BY created_at",
        lead_id,
    )
    assert [e["event_type"] for e in events] == [
        "created",
        "assigned",
        "status_changed",
        "status_changed",
    ]

    funnel = (
        await client.get("/analytics/funnel", headers=auth_headers(founder_token))
    ).json()["funnel"]
    by_status = {row["status"]: row for row in funnel}
    assert by_status["new"]["reached_count"] == 1
    assert by_status["contacted"]["reached_count"] == 1
    assert by_status["lost"]["reached_count"] == 1
    assert by_status["won"]["reached_count"] == 0
    # every reached status had a manually-verifiable, non-negative duration
    assert by_status["new"]["avg_hours_in_status"] >= 0


@pytest.mark.asyncio
async def test_conversion_by_source_and_loss_reasons(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")

    won_lead = await client.post("/leads/webhook/website", json={"name": "Won"})
    await client.post(
        f"/leads/{won_lead.json()['id']}/claim", headers=auth_headers(manager_token)
    )
    await client.patch(
        f"/leads/{won_lead.json()['id']}",
        json={"status": "won"},
        headers=auth_headers(manager_token),
    )

    lost_lead = await client.post("/leads/webhook/website", json={"name": "Lost"})
    await client.post(
        f"/leads/{lost_lead.json()['id']}/claim", headers=auth_headers(manager_token)
    )
    await client.patch(
        f"/leads/{lost_lead.json()['id']}",
        json={"status": "lost", "loss_reason": "budget"},
        headers=auth_headers(manager_token),
    )

    conversion = (
        await client.get(
            "/analytics/conversion-by-source", headers=auth_headers(founder_token)
        )
    ).json()
    website_row = next(r for r in conversion if r["source"] == "website")
    assert website_row["total"] == 2
    assert website_row["won"] == 1
    assert float(website_row["conversion_pct"]) == 50.0

    reasons = (
        await client.get("/analytics/loss-reasons", headers=auth_headers(founder_token))
    ).json()
    assert any(r["loss_reason"] == "budget" and r["count"] == 1 for r in reasons)


@pytest.mark.asyncio
async def test_team_load_counts_overdue(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, _ = await make_user(db, "Student", "s@example.com", "student")

    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "T1", "due_date": yesterday},
        headers=auth_headers(founder_token),
    )
    await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "T2"},
        headers=auth_headers(founder_token),
    )

    load = (
        await client.get("/analytics/team-load", headers=auth_headers(founder_token))
    ).json()
    row = next(r for r in load if r["user_id"] == student_id)
    assert row["total_tasks"] == 2
    assert row["overdue_tasks"] == 1


@pytest.mark.asyncio
async def test_stale_leads_flags_old_unclaimed_activity(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")

    lead = await client.post("/leads/webhook/website", json={"name": "Stale"})
    lead_id = lead.json()["id"]

    await db.execute(
        "UPDATE events SET created_at = now() - interval '10 days' "
        "WHERE entity_type = 'lead' AND entity_id = $1",
        lead_id,
    )

    stale = (
        await client.get(
            "/analytics/stale-leads?days=7", headers=auth_headers(founder_token)
        )
    ).json()
    assert any(r["id"] == lead_id for r in stale)

    not_stale = (
        await client.get(
            "/analytics/stale-leads?days=30", headers=auth_headers(founder_token)
        )
    ).json()
    assert not any(r["id"] == lead_id for r in not_stale)
