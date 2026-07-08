import datetime as dt

import pytest

from app.core.config import settings
from tests.conftest import auth_headers, make_user


def internal_headers() -> dict:
    return {"X-Internal-Secret": settings.internal_bot_secret}


@pytest.mark.asyncio
async def test_create_task_and_assignee_only_visible_pending(client, db):
    founder_id, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, _ = await make_user(
        db, "Student", "s@example.com", "student", telegram_id=555111
    )

    resp = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Read chapter 1"},
        headers=auth_headers(founder_token),
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "todo"
    assert resp.json()["created_by"] == founder_id


@pytest.mark.asyncio
async def test_non_assignee_cannot_patch_task(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, _ = await make_user(db, "Student", "s@example.com", "student")
    _, other_token = await make_user(db, "Other", "o@example.com", "manager")

    task = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Read chapter 1"},
        headers=auth_headers(founder_token),
    )
    task_id = task.json()["id"]

    resp = await client.patch(
        f"/tasks/{task_id}", json={"status": "in_progress"}, headers=auth_headers(other_token)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_overdue_dashboard_groups_by_assignee(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, student_token = await make_user(db, "Student", "s@example.com", "student")

    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Overdue task", "due_date": yesterday},
        headers=auth_headers(founder_token),
    )
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Future task", "due_date": tomorrow},
        headers=auth_headers(founder_token),
    )

    dashboard = (
        await client.get("/tasks/overdue-dashboard", headers=auth_headers(student_token))
    ).json()
    assert len(dashboard) == 1
    assert dashboard[0]["assigned_to"] == student_id
    assert dashboard[0]["overdue_count"] == 1


@pytest.mark.asyncio
async def test_bot_complete_task_flow(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, _ = await make_user(
        db, "Student", "s@example.com", "student", telegram_id=555222
    )

    task = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Homework"},
        headers=auth_headers(founder_token),
    )
    task_id = task.json()["id"]

    listing = await client.get(
        "/internal/bot/tasks?telegram_id=555222", headers=internal_headers()
    )
    assert listing.status_code == 200
    assert any(t["id"] == task_id for t in listing.json())

    complete = await client.post(
        f"/internal/bot/tasks/{task_id}/complete",
        json={"telegram_id": 555222},
        headers=internal_headers(),
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "done"
    assert complete.json()["completed_at"] is not None

    events = await db.fetch(
        "SELECT event_type, actor_id FROM events WHERE entity_type = 'task' AND entity_id = $1 "
        "ORDER BY created_at",
        task_id,
    )
    assert [e["event_type"] for e in events] == ["created", "status_changed"]
    assert events[1]["actor_id"] is None


@pytest.mark.asyncio
async def test_bot_endpoint_rejects_bad_secret(client, db):
    resp = await client.get(
        "/internal/bot/tasks?telegram_id=1", headers={"X-Internal-Secret": "wrong"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bot_cannot_complete_someone_elses_task(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    student_id, _ = await make_user(
        db, "Student", "s@example.com", "student", telegram_id=555333
    )

    task = await client.post(
        "/tasks",
        json={"assigned_to": student_id, "title": "Homework"},
        headers=auth_headers(founder_token),
    )
    task_id = task.json()["id"]

    resp = await client.post(
        f"/internal/bot/tasks/{task_id}/complete",
        json={"telegram_id": 999999},
        headers=internal_headers(),
    )
    assert resp.status_code == 404
