import datetime as dt

import pytest

from tests.conftest import auth_headers, make_user


async def _project(client, token) -> tuple[int, int]:
    client_row = await client.post("/clients", json={"name": "Acme"}, headers=auth_headers(token))
    client_id = client_row.json()["id"]
    project_row = await client.post(
        "/projects", json={"client_id": client_id, "name": "Proj"}, headers=auth_headers(token)
    )
    return client_id, project_row.json()["id"]


@pytest.mark.asyncio
async def test_paid_without_paid_at_is_400(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    _, project_id = await _project(client, token)

    entry = await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "1000.00", "currency": "USD"},
        headers=auth_headers(token),
    )
    entry_id = entry.json()["id"]

    resp = await client.patch(
        f"/finance-entries/{entry_id}", json={"status": "paid"}, headers=auth_headers(token)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_paid_with_paid_at_succeeds(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    _, project_id = await _project(client, token)

    entry = await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "1000.00", "currency": "USD"},
        headers=auth_headers(token),
    )
    entry_id = entry.json()["id"]

    resp = await client.patch(
        f"/finance-entries/{entry_id}",
        json={"status": "paid", "paid_at": dt.datetime.now(dt.UTC).isoformat()},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "paid"


@pytest.mark.asyncio
async def test_summary_computes_invoiced_paid_overdue(client, db):
    _, token = await make_user(db, "Manager", "m@example.com", "manager")
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    client_id, project_id = await _project(client, token)

    paid_entry = await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "500.00", "currency": "USD"},
        headers=auth_headers(token),
    )
    await client.patch(
        f"/finance-entries/{paid_entry.json()['id']}",
        json={"status": "paid", "paid_at": dt.datetime.now(dt.UTC).isoformat()},
        headers=auth_headers(token),
    )

    overdue_due = (dt.date.today() - dt.timedelta(days=5)).isoformat()
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={
            "type": "invoice",
            "amount": "300.00",
            "currency": "USD",
            "due_date": overdue_due,
        },
        headers=auth_headers(token),
    )

    forbidden = await client.get("/finance/summary", headers=auth_headers(token))
    assert forbidden.status_code == 403

    summary = (await client.get("/finance/summary", headers=auth_headers(founder_token))).json()
    row = next(r for r in summary["by_client"] if r["client_id"] == client_id)
    assert float(row["invoiced"]) == 800.0
    assert float(row["paid"]) == 500.0
    assert float(row["overdue"]) == 300.0
