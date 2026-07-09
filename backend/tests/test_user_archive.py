import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_archive_hides_user_from_default_list_and_shows_in_archived(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    manager_id, _ = await make_user(db, "Manager", "m@example.com", "manager")

    resp = await client.post(f"/users/{manager_id}/archive", headers=auth_headers(founder_token))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is not None
    assert resp.json()["is_active"] is False

    active = await client.get("/users", headers=auth_headers(founder_token))
    assert manager_id not in [u["id"] for u in active.json()]

    archived = await client.get("/users?archived=true", headers=auth_headers(founder_token))
    assert manager_id in [u["id"] for u in archived.json()]


@pytest.mark.asyncio
async def test_unarchive_restores_to_default_list(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    manager_id, _ = await make_user(db, "Manager", "m@example.com", "manager")

    await client.post(f"/users/{manager_id}/archive", headers=auth_headers(founder_token))
    resp = await client.post(f"/users/{manager_id}/unarchive", headers=auth_headers(founder_token))
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is None

    active = await client.get("/users", headers=auth_headers(founder_token))
    assert manager_id in [u["id"] for u in active.json()]


@pytest.mark.asyncio
async def test_archive_is_founder_only(client, db):
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    other_id, _ = await make_user(db, "Other", "o@example.com", "manager")

    resp = await client.post(f"/users/{other_id}/archive", headers=auth_headers(manager_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_archive_founder_account(client, db):
    founder_id, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    other_founder_id, _ = await make_user(db, "Founder 2", "f2@example.com", "founder")

    resp = await client.post(
        f"/users/{other_founder_id}/archive", headers=auth_headers(founder_token)
    )
    assert resp.status_code == 400

    resp = await client.post(f"/users/{founder_id}/archive", headers=auth_headers(founder_token))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_archive_records_event(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    manager_id, _ = await make_user(db, "Manager", "m@example.com", "manager")

    await client.post(f"/users/{manager_id}/archive", headers=auth_headers(founder_token))

    event = await db.fetchrow(
        "SELECT event_type, entity_type, entity_id, actor_id FROM events "
        "WHERE entity_type = 'user' AND entity_id = $1",
        manager_id,
    )
    assert event["event_type"] == "archived"
    assert event["entity_id"] == manager_id
