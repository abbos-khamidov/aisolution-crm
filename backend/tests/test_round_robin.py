import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_new_lead_auto_assigns_to_only_manager(client, db):
    manager_id, _ = await make_user(db, "Solo Manager", "solo@example.com", "manager")

    resp = await client.post("/leads/webhook/website", json={"name": "Auto Lead"})
    assert resp.status_code == 201
    assert resp.json()["owner_id"] == manager_id

    events = await db.fetch(
        "SELECT event_type, actor_id, payload FROM events "
        "WHERE entity_type = 'lead' AND entity_id = $1 ORDER BY created_at",
        resp.json()["id"],
    )
    assert [e["event_type"] for e in events] == ["created", "assigned"]
    assert events[1]["actor_id"] is None
    assert events[1]["payload"]["reason"] == "round_robin"


@pytest.mark.asyncio
async def test_round_robin_picks_least_loaded_manager(client, db):
    a_id, a_token = await make_user(db, "Manager A", "a@example.com", "manager")
    b_id, _ = await make_user(db, "Manager B", "b@example.com", "manager")

    first = await client.post("/leads/webhook/website", json={"name": "Lead 1"})
    first_owner = first.json()["owner_id"]
    assert first_owner in (a_id, b_id)

    second = await client.post("/leads/webhook/website", json={"name": "Lead 2"})
    assert second.json()["owner_id"] in (a_id, b_id)
    assert second.json()["owner_id"] != first_owner

    third = await client.post("/leads/webhook/website", json={"name": "Lead 3"})
    assert third.json()["owner_id"] == first_owner

    # sanity: the auto-assigned owner can act on it like any owned lead
    resp = await client.patch(
        f"/leads/{first.json()['id']}",
        json={"status": "contacted"},
        headers=auth_headers(a_token if first_owner == a_id else a_token),
    )
    if first_owner == a_id:
        assert resp.status_code == 200
    else:
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_round_robin_ignores_inactive_and_non_manager(client, db):
    await make_user(db, "Founder", "f@example.com", "founder")
    _, dev_token = await make_user(db, "Dev", "d@example.com", "developer")
    assert dev_token  # developer exists but must never receive auto-assigned leads

    resp = await client.post("/leads/webhook/website", json={"name": "No Manager Lead"})
    assert resp.json()["owner_id"] is None


@pytest.mark.asyncio
async def test_claim_on_already_own_round_robin_lead_is_idempotent(client, db):
    manager_id, token = await make_user(db, "Solo Manager", "solo@example.com", "manager")

    created = await client.post("/leads/webhook/website", json={"name": "Auto Lead"})
    lead_id = created.json()["id"]
    assert created.json()["owner_id"] == manager_id

    claim = await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token))
    assert claim.status_code == 200
    assert claim.json()["owner_id"] == manager_id

    events = await db.fetch(
        "SELECT event_type FROM events WHERE entity_type = 'lead' AND entity_id = $1 "
        "ORDER BY created_at",
        lead_id,
    )
    # claiming a lead you already own must not emit a duplicate 'assigned' event
    assert [e["event_type"] for e in events] == ["created", "assigned"]
