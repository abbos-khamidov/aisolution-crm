import asyncio

import pytest

from tests.conftest import auth_headers, make_user


async def _create_lead(db) -> int:
    return await db.fetchval(
        "INSERT INTO leads (source, name) VALUES ('website', 'Test Lead') RETURNING id"
    )


@pytest.mark.asyncio
async def test_concurrent_claim_only_one_wins(client, db):
    lead_id = await _create_lead(db)
    _, token_a = await make_user(db, "Manager A", "a@example.com", "manager")
    _, token_b = await make_user(db, "Manager B", "b@example.com", "manager")

    results = await asyncio.gather(
        client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token_a)),
        client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token_b)),
    )
    statuses = sorted(r.status_code for r in results)
    assert statuses == [200, 409]


@pytest.mark.asyncio
async def test_claimed_lead_visible_to_queue(client, db):
    lead_id = await _create_lead(db)
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    leads = (await client.get("/leads", headers=auth_headers(token))).json()
    unowned = [lead for lead in leads if lead["id"] == lead_id]
    assert len(unowned) == 1
    assert unowned[0]["owner_id"] is None


@pytest.mark.asyncio
async def test_non_owner_cannot_patch_403(client, db):
    lead_id = await _create_lead(db)
    _, owner_token = await make_user(db, "Owner", "owner@example.com", "manager")
    _, other_token = await make_user(db, "Other", "other@example.com", "manager")

    claim = await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(owner_token))
    assert claim.status_code == 200

    resp = await client.patch(
        f"/leads/{lead_id}",
        json={"status": "contacted"},
        headers=auth_headers(other_token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_founder_can_reassign_and_patch_any_lead(client, db):
    lead_id = await _create_lead(db)
    _, owner_token = await make_user(db, "Owner", "owner@example.com", "manager")
    _, founder_token = await make_user(db, "Founder", "founder@example.com", "founder")

    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(owner_token))

    resp = await client.patch(
        f"/leads/{lead_id}",
        json={"status": "contacted"},
        headers=auth_headers(founder_token),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_lost_without_reason_is_400(client, db):
    lead_id = await _create_lead(db)
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token))

    resp = await client.patch(
        f"/leads/{lead_id}", json={"status": "lost"}, headers=auth_headers(token)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_lost_with_reason_succeeds_and_events_recorded(client, db):
    created = await client.post(
        "/leads/webhook/website", json={"name": "Website Lead"}
    )
    lead_id = created.json()["id"]
    _, token = await make_user(db, "Manager", "m@example.com", "manager")

    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token))
    resp = await client.patch(
        f"/leads/{lead_id}",
        json={"status": "lost", "loss_reason": "budget"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "lost"

    events = await db.fetch(
        "SELECT event_type FROM events WHERE entity_type = 'lead' AND entity_id = $1 "
        "ORDER BY created_at",
        lead_id,
    )
    event_types = [e["event_type"] for e in events]
    assert event_types == ["created", "assigned", "status_changed"]
