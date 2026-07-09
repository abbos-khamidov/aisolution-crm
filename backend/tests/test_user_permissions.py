import pytest

from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_manager_without_flags_denied_analytics_and_finance(client, db):
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    for path in ("/analytics/funnel", "/finance/summary"):
        resp = await client.get(path, headers=auth_headers(manager_token))
        assert resp.status_code == 403, path


@pytest.mark.asyncio
async def test_can_view_analytics_grants_analytics_but_not_finance(client, db):
    user_id, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    await db.execute("UPDATE users SET can_view_analytics = true WHERE id = $1", user_id)

    resp = await client.get("/analytics/funnel", headers=auth_headers(manager_token))
    assert resp.status_code == 200

    resp = await client.get("/finance/summary", headers=auth_headers(manager_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_can_view_finance_grants_finance_but_not_analytics(client, db):
    user_id, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    await db.execute("UPDATE users SET can_view_finance = true WHERE id = $1", user_id)

    resp = await client.get("/finance/summary", headers=auth_headers(manager_token))
    assert resp.status_code == 200

    resp = await client.get("/analytics/funnel", headers=auth_headers(manager_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_flags_are_ignored(client, db):
    """Analytics/finance are staff surfaces — a student row is never granted
    access even if can_view_analytics/finance were set directly in the DB
    (defense in depth; the UI never offers students these checkboxes)."""
    user_id, student_token = await make_user(db, "Student", "s@example.com", "student")
    await db.execute(
        "UPDATE users SET can_view_analytics = true, can_view_finance = true WHERE id = $1",
        user_id,
    )

    for path in ("/analytics/funnel", "/finance/summary"):
        resp = await client.get(path, headers=auth_headers(student_token))
        assert resp.status_code == 403, path


@pytest.mark.asyncio
async def test_can_view_all_leads_lifts_owner_filter(client, db):
    owner_id, owner_token = await make_user(db, "Owner", "owner@example.com", "manager")
    _, other_token = await make_user(db, "Other", "other@example.com", "manager")

    created = await client.post("/leads/webhook/website", json={"name": "Lead"})
    lead_id = created.json()["id"]
    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(owner_token))

    # Without the flag, another manager doesn't see it in the plain listing.
    resp = await client.get("/leads", headers=auth_headers(other_token))
    assert lead_id not in [row["id"] for row in resp.json()]

    other_id = await db.fetchval("SELECT id FROM users WHERE email = 'other@example.com'")
    await db.execute("UPDATE users SET can_view_all_leads = true WHERE id = $1", other_id)

    resp = await client.get("/leads", headers=auth_headers(other_token))
    assert lead_id in [row["id"] for row in resp.json()]
