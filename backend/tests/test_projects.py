import datetime as dt

import pytest

from tests.conftest import auth_headers, make_user


async def _won_lead(client, db, token) -> int:
    created = await client.post("/leads/webhook/website", json={"name": "Won Lead"})
    lead_id = created.json()["id"]
    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token))
    resp = await client.patch(
        f"/leads/{lead_id}", json={"status": "won"}, headers=auth_headers(token)
    )
    assert resp.status_code == 200
    return lead_id


@pytest.mark.asyncio
async def test_convert_won_lead_creates_client_and_project(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    lead_id = await _won_lead(client, db, token)

    resp = await client.post(
        f"/leads/{lead_id}/convert",
        json={"project_name": "New CRM build"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["client"]["lead_id"] == lead_id
    assert body["project"]["client_id"] == body["client"]["id"]
    assert body["project"]["stage"] == "discovery"

    events = await db.fetch(
        "SELECT entity_type, event_type FROM events WHERE entity_id = $1 "
        "AND entity_type IN ('lead', 'project') ORDER BY created_at",
        body["project"]["id"],
    )
    # project's own 'created' event must exist
    assert ("project", "created") in [(e["entity_type"], e["event_type"]) for e in events]


@pytest.mark.asyncio
async def test_convert_requires_won_status(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    created = await client.post("/leads/webhook/website", json={"name": "Fresh Lead"})
    lead_id = created.json()["id"]
    await client.post(f"/leads/{lead_id}/claim", headers=auth_headers(token))

    resp = await client.post(
        f"/leads/{lead_id}/convert",
        json={"project_name": "Too Early"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_deadline_color_coding(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    client_row = await client.post(
        "/clients", json={"name": "Acme"}, headers=auth_headers(token)
    )
    client_id = client_row.json()["id"]

    today = dt.date.today()
    cases = {
        "overdue": today - dt.timedelta(days=1),
        "soon": today + dt.timedelta(days=3),
        "far": today + dt.timedelta(days=30),
    }
    ids = {}
    for label, deadline in cases.items():
        resp = await client.post(
            "/projects",
            json={
                "client_id": client_id,
                "name": label,
                "deadline": deadline.isoformat(),
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        ids[label] = resp.json()["id"]

    no_deadline = await client.post(
        "/projects",
        json={"client_id": client_id, "name": "no-deadline"},
        headers=auth_headers(token),
    )
    ids["none"] = no_deadline.json()["id"]

    projects = (await client.get("/projects", headers=auth_headers(token))).json()
    by_id = {p["id"]: p for p in projects}
    assert by_id[ids["overdue"]]["deadline_status"] == "red"
    assert by_id[ids["soon"]]["deadline_status"] == "yellow"
    assert by_id[ids["far"]]["deadline_status"] == "green"
    assert by_id[ids["none"]]["deadline_status"] == "none"


@pytest.mark.asyncio
async def test_non_owner_cannot_patch_project(client, db):
    owner_id, owner_token = await make_user(db, "Owner", "owner@example.com", "manager")
    _, other_token = await make_user(db, "Other", "other@example.com", "manager")

    client_row = await client.post(
        "/clients", json={"name": "Acme"}, headers=auth_headers(owner_token)
    )
    client_id = client_row.json()["id"]

    project = await client.post(
        "/projects",
        json={"client_id": client_id, "name": "Proj", "owner_id": owner_id},
        headers=auth_headers(owner_token),
    )
    project_id = project.json()["id"]
    assert project.json()["owner_id"] == owner_id

    resp = await client.patch(
        f"/projects/{project_id}",
        json={"stage": "in_progress"},
        headers=auth_headers(other_token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_milestone_status_change_recorded(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    client_row = await client.post(
        "/clients", json={"name": "Acme"}, headers=auth_headers(token)
    )
    client_id = client_row.json()["id"]

    _, founder_token = await make_user(db, "Founder", "f2@example.com", "founder")
    project = await client.post(
        "/projects",
        json={"client_id": client_id, "name": "Proj"},
        headers=auth_headers(founder_token),
    )
    project_id = project.json()["id"]

    milestone = await client.post(
        f"/projects/{project_id}/milestones",
        json={"title": "Design done"},
        headers=auth_headers(founder_token),
    )
    milestone_id = milestone.json()["id"]

    resp = await client.patch(
        f"/milestones/{milestone_id}",
        json={"status": "done"},
        headers=auth_headers(founder_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"

    events = await db.fetch(
        "SELECT event_type FROM events WHERE entity_type = 'milestone' AND entity_id = $1 "
        "ORDER BY created_at",
        milestone_id,
    )
    assert [e["event_type"] for e in events] == ["created", "status_changed"]
