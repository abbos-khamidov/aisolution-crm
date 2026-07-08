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
async def test_new_finance_analytics_endpoints_are_founder_only(client, db):
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    for path in (
        "/finance/cash-flow",
        "/finance/expenses-by-category",
        "/analytics/manager-performance",
        "/analytics/leads-by-channel-over-time",
    ):
        resp = await client.get(path, headers=auth_headers(manager_token))
        assert resp.status_code == 403, path


@pytest.mark.asyncio
async def test_expenses_by_category_groups_and_buckets_uncategorized(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    _, project_id = await _project(client, manager_token)

    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "expense", "amount": "100.00", "currency": "USD", "category": "hosting"},
        headers=auth_headers(manager_token),
    )
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "expense", "amount": "50.00", "currency": "USD", "category": "hosting"},
        headers=auth_headers(manager_token),
    )
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "expense", "amount": "20.00", "currency": "USD"},
        headers=auth_headers(manager_token),
    )
    # a non-expense entry must never leak into the expense breakdown
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "999.00", "currency": "USD"},
        headers=auth_headers(manager_token),
    )

    rows = (
        await client.get("/finance/expenses-by-category", headers=auth_headers(founder_token))
    ).json()
    by_category = {r["category"]: r for r in rows}
    assert float(by_category["hosting"]["total"]) == 150.0
    assert by_category["hosting"]["entry_count"] == 2
    assert float(by_category["без категории"]["total"]) == 20.0


@pytest.mark.asyncio
async def test_cash_flow_computes_net_and_overdue_aging(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")
    _, project_id = await _project(client, manager_token)

    paid_invoice = await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "1000.00", "currency": "USD"},
        headers=auth_headers(manager_token),
    )
    await client.patch(
        f"/finance-entries/{paid_invoice.json()['id']}",
        json={"status": "paid", "paid_at": dt.datetime.now(dt.UTC).isoformat()},
        headers=auth_headers(manager_token),
    )
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "expense", "amount": "300.00", "currency": "USD"},
        headers=auth_headers(manager_token),
    )

    overdue_15d = (dt.date.today() - dt.timedelta(days=15)).isoformat()
    await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "400.00", "currency": "USD", "due_date": overdue_15d},
        headers=auth_headers(manager_token),
    )

    data = (await client.get("/finance/cash-flow", headers=auth_headers(founder_token))).json()

    this_month = dt.date.today().strftime("%Y-%m")
    month_row = next(r for r in data["by_month"] if r["month"] == this_month)
    assert float(month_row["invoiced"]) == 1400.0
    assert float(month_row["paid"]) == 1000.0
    assert float(month_row["expenses"]) == 300.0
    assert float(month_row["net"]) == 700.0

    assert float(data["overdue_aging"]["days_8_30"]) == 400.0
    assert float(data["overdue_aging"]["days_0_7"]) == 0.0


@pytest.mark.asyncio
async def test_manager_performance_leaderboard(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")
    manager_id, manager_token = await make_user(db, "Manager", "m@example.com", "manager")

    won_lead = await client.post("/leads/webhook/website", json={"name": "Won"})
    lost_lead = await client.post("/leads/webhook/website", json={"name": "Lost"})

    await client.patch(
        f"/leads/{won_lead.json()['id']}",
        json={"status": "won"},
        headers=auth_headers(manager_token),
    )
    await client.patch(
        f"/leads/{lost_lead.json()['id']}",
        json={"status": "lost", "loss_reason": "budget"},
        headers=auth_headers(manager_token),
    )

    _, project_id = await _project(client, manager_token)
    invoice = await client.post(
        f"/projects/{project_id}/finance-entries",
        json={"type": "invoice", "amount": "500.00", "currency": "USD"},
        headers=auth_headers(manager_token),
    )
    await client.patch(
        f"/finance-entries/{invoice.json()['id']}",
        json={"status": "paid", "paid_at": dt.datetime.now(dt.UTC).isoformat()},
        headers=auth_headers(manager_token),
    )

    leaderboard = (
        await client.get("/analytics/manager-performance", headers=auth_headers(founder_token))
    ).json()
    row = next(r for r in leaderboard if r["user_id"] == manager_id)
    assert row["leads_owned"] == 2
    assert row["leads_won"] == 1
    assert float(row["conversion_pct"]) == 50.0
    assert float(row["avg_first_response_hours"]) >= 0
    assert float(row["revenue_paid"]) == 500.0


@pytest.mark.asyncio
async def test_leads_by_channel_over_time_groups_by_month_and_source(client, db):
    _, founder_token = await make_user(db, "Founder", "f@example.com", "founder")

    await client.post("/leads/webhook/website", json={"name": "A"})
    await client.post("/leads/webhook/website", json={"name": "B"})
    await client.post(
        "/leads",
        json={"source": "referral", "name": "C"},
        headers=auth_headers(founder_token),
    )

    rows = (
        await client.get(
            "/analytics/leads-by-channel-over-time", headers=auth_headers(founder_token)
        )
    ).json()
    this_month = dt.date.today().strftime("%Y-%m")
    by_source = {(r["month"], r["source"]): r["count"] for r in rows}
    assert by_source[(this_month, "website")] == 2
    assert by_source[(this_month, "referral")] == 1
