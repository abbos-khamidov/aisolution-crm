import pytest

from app.core.config import settings
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_student_cannot_access_leads(client, db):
    _, student_token = await make_user(db, "Student", "s@example.com", "student")

    resp = await client.get("/leads", headers=auth_headers(student_token))
    assert resp.status_code == 403

    resp = await client.post(
        "/leads", json={"source": "referral", "name": "x"}, headers=auth_headers(student_token)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_access_projects(client, db):
    _, student_token = await make_user(db, "Student", "s@example.com", "student")
    resp = await client.get("/projects", headers=auth_headers(student_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_access_clients(client, db):
    _, student_token = await make_user(db, "Student", "s@example.com", "student")
    resp = await client.get("/clients", headers=auth_headers(student_token))
    assert resp.status_code == 403
    resp = await client.post(
        "/clients", json={"name": "x"}, headers=auth_headers(student_token)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_create_task_but_can_see_own(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, student_token = await make_user(db, "Student", "s@example.com", "student")
    other_student_id, _ = await make_user(db, "Other Student", "s2@example.com", "student")

    # student can't create tasks for themselves or others
    resp = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "self-assign"},
        headers=auth_headers(student_token),
    )
    assert resp.status_code == 403

    mine = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "mine"},
        headers=auth_headers(founder_token),
    )
    others = await client.post(
        "/tasks",
        json={"assigned_to": other_student_id, "title": "not mine"},
        headers=auth_headers(founder_token),
    )
    assert mine.status_code == 201
    assert others.status_code == 201

    # student's own list only ever shows their tasks, even if they try to
    # probe someone else's assigned_to via query param
    resp = await client.get(
        f"/tasks?assigned_to={other_student_id}", headers=auth_headers(student_token)
    )
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.json()]
    assert mine.json()["id"] in ids
    assert others.json()["id"] not in ids


@pytest.mark.asyncio
async def test_manager_does_not_see_other_managers_owned_lead(client, db):
    _, manager_a_token = await make_user(db, "Manager A", "a@example.com", "manager")
    _, manager_b_token = await make_user(db, "Manager B", "b@example.com", "manager")

    lead = await client.post("/leads/webhook/website", json={"name": "Lead X"})
    lead_id = lead.json()["id"]
    claim = await client.post(
        f"/leads/{lead_id}/claim", headers=auth_headers(manager_a_token)
    )
    assert claim.status_code == 200

    unclaimed = await client.post("/leads/webhook/website", json={"name": "Lead Y"})
    unclaimed_id = unclaimed.json()["id"]

    visible_to_b = (
        await client.get("/leads", headers=auth_headers(manager_b_token))
    ).json()
    ids = [lead_row["id"] for lead_row in visible_to_b]
    assert lead_id not in ids
    assert unclaimed_id in ids


@pytest.mark.asyncio
async def test_manager_does_not_see_other_managers_project(client, db):
    _, manager_a_token = await make_user(db, "Manager A", "a@example.com", "manager")
    _, manager_b_token = await make_user(db, "Manager B", "b@example.com", "manager")

    client_row = await client.post(
        "/clients", json={"name": "Acme"}, headers=auth_headers(manager_a_token)
    )
    project = await client.post(
        "/projects",
        json={"client_id": client_row.json()["id"], "name": "A's Project"},
        headers=auth_headers(manager_a_token),
    )
    project_id = project.json()["id"]

    visible_to_b = (
        await client.get("/projects", headers=auth_headers(manager_b_token))
    ).json()
    assert project_id not in [p["id"] for p in visible_to_b]

    detail = await client.get(f"/projects/{project_id}", headers=auth_headers(manager_b_token))
    assert detail.status_code == 403


@pytest.mark.asyncio
async def test_developer_sees_only_assigned_projects(client, db):
    dev_id, dev_token = await make_user(db, "Dev", "d@example.com", "developer")
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")

    client_row = await client.post(
        "/clients", json={"name": "Acme"}, headers=auth_headers(founder_token)
    )
    project = await client.post(
        "/projects",
        json={"client_id": client_row.json()["id"], "name": "Dev Project"},
        headers=auth_headers(founder_token),
    )
    project_id = project.json()["id"]

    not_visible = await client.get("/projects", headers=auth_headers(dev_token))
    assert project_id not in [p["id"] for p in not_visible.json()]

    add = await client.post(
        f"/projects/{project_id}/members",
        json={"user_id": dev_id, "role_on_project": "contributor"},
        headers=auth_headers(founder_token),
    )
    assert add.status_code == 201

    now_visible = await client.get("/projects", headers=auth_headers(dev_token))
    assert project_id in [p["id"] for p in now_visible.json()]


@pytest.mark.asyncio
async def test_telegram_login_flow(client, db):
    student_id, _ = await make_user(
        db, "Student", "s@example.com", "student", telegram_id=777888
    )

    start = await client.post("/auth/telegram/start")
    assert start.status_code == 200
    token = start.json()["token"]

    pending = await client.get(f"/auth/telegram/{token}/poll")
    assert pending.json()["status"] == "pending"

    confirm = await client.post(
        "/internal/bot/telegram-login/confirm",
        json={"token": token, "telegram_id": 777888},
        headers={"X-Internal-Secret": settings.internal_bot_secret},
    )
    assert confirm.status_code == 200
    assert confirm.json()["confirmed"] is True

    done = await client.get(f"/auth/telegram/{token}/poll")
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "confirmed"
    assert body["access_token"]

    # single-use: polling again after consumption is gone
    again = await client.get(f"/auth/telegram/{token}/poll")
    assert again.status_code == 410


@pytest.mark.asyncio
async def test_telegram_login_rejects_unregistered_telegram_id(client, db):
    start = await client.post("/auth/telegram/start")
    token = start.json()["token"]

    confirm = await client.post(
        "/internal/bot/telegram-login/confirm",
        json={"token": token, "telegram_id": 999999999},
        headers={"X-Internal-Secret": settings.internal_bot_secret},
    )
    assert confirm.status_code == 200
    assert confirm.json()["confirmed"] is False

    polled = await client.get(f"/auth/telegram/{token}/poll")
    assert polled.json()["status"] == "rejected"
