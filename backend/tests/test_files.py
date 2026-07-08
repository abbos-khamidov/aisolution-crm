import pytest

from tests.conftest import auth_headers, make_user


async def _project(client, token) -> int:
    client_row = await client.post("/clients", json={"name": "Acme"}, headers=auth_headers(token))
    project_row = await client.post(
        "/projects",
        json={"client_id": client_row.json()["id"], "name": "Proj"},
        headers=auth_headers(token),
    )
    return project_row.json()["id"]


@pytest.mark.asyncio
async def test_upload_requires_exactly_one_parent(client, db, s3):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    resp = await client.post(
        "/files",
        files={"file": ("doc.pdf", b"hello world", "application/pdf")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_and_non_founder_cannot_approve(client, db, s3):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    project_id = await _project(client, token)

    upload = await client.post(
        "/files",
        data={"project_id": str(project_id)},
        files={"file": ("doc.pdf", b"hello world", "application/pdf")},
        headers=auth_headers(token),
    )
    assert upload.status_code == 201
    body = upload.json()
    assert body["status"] == "pending_review"
    assert body["url"]

    resp = await client.post(
        f"/files/{body['id']}/approve", json={}, headers=auth_headers(token)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_founder_can_approve_and_events_recorded(client, db, s3):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    project_id = await _project(client, token)

    upload = await client.post(
        "/files",
        data={"project_id": str(project_id)},
        files={"file": ("doc.pdf", b"hello world", "application/pdf")},
        headers=auth_headers(token),
    )
    file_id = upload.json()["id"]

    resp = await client.post(
        f"/files/{file_id}/approve",
        json={"comment": "looks good"},
        headers=auth_headers(founder_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"
    assert resp.json()["reviewed_by"] is not None

    events = await db.fetch(
        "SELECT event_type FROM events WHERE entity_type = 'file' AND entity_id = $1 "
        "ORDER BY created_at",
        file_id,
    )
    assert [e["event_type"] for e in events] == ["created", "approved"]


@pytest.mark.asyncio
async def test_founder_can_reject(client, db, s3):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    project_id = await _project(client, token)

    upload = await client.post(
        "/files",
        data={"project_id": str(project_id)},
        files={"file": ("doc.pdf", b"hello world", "application/pdf")},
        headers=auth_headers(token),
    )
    file_id = upload.json()["id"]

    resp = await client.post(
        f"/files/{file_id}/reject",
        json={"comment": "wrong format"},
        headers=auth_headers(founder_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
