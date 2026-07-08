import pytest

from app.core.config import settings
from tests.conftest import auth_headers, make_user


@pytest.mark.asyncio
async def test_meta_webhook_verification_handshake(client):
    resp = await client.get(
        "/leads/webhook/instagram",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": settings.meta_webhook_verify_token,
            "hub.challenge": "12345",
        },
    )
    assert resp.status_code == 200
    assert resp.text == "12345"


@pytest.mark.asyncio
async def test_meta_webhook_verification_rejects_bad_token(client):
    resp = await client.get(
        "/leads/webhook/facebook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong",
            "hub.challenge": "12345",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_instagram_dm_creates_lead(client, db):
    resp = await client.post(
        "/leads/webhook/instagram",
        json={
            "entry": [
                {
                    "messaging": [
                        {"sender": {"id": "ig_999"}, "message": {"text": "Hi, interested!"}}
                    ]
                }
            ]
        },
    )
    assert resp.status_code == 201
    lead = resp.json()[0]
    assert lead["source"] == "instagram"
    assert lead["message"] == "Hi, interested!"
    assert lead["utm"]["sender_id"] == "ig_999"
    assert lead["status"] == "new"
    assert lead["owner_id"] is None


@pytest.mark.asyncio
async def test_facebook_leadgen_creates_lead(client, db):
    resp = await client.post(
        "/leads/webhook/facebook",
        json={
            "entry": [
                {
                    "changes": [
                        {
                            "field": "leadgen",
                            "value": {
                                "leadgen_id": "lg_1",
                                "form_id": "form_1",
                                "field_data": [
                                    {"name": "full_name", "values": ["Ivan Petrov"]},
                                    {"name": "email", "values": ["ivan@example.com"]},
                                    {"name": "phone_number", "values": ["+998901234567"]},
                                ],
                            },
                        }
                    ]
                }
            ]
        },
    )
    assert resp.status_code == 201
    lead = resp.json()[0]
    assert lead["source"] == "facebook"
    assert lead["name"] == "Ivan Petrov"
    assert lead["email"] == "ivan@example.com"
    assert lead["phone"] == "+998901234567"
    assert lead["utm"]["leadgen_id"] == "lg_1"


@pytest.mark.asyncio
async def test_telegram_sales_bot_creates_lead(client, db):
    resp = await client.post(
        "/leads/webhook/telegram",
        json={
            "message": {
                "from": {"id": 123456, "first_name": "Dilnoza", "username": "dilnoza_uz"},
                "text": "Сколько стоит автоматизация?",
            }
        },
    )
    assert resp.status_code == 201
    lead = resp.json()
    assert lead["source"] == "telegram"
    assert lead["name"] == "Dilnoza"
    assert lead["message"] == "Сколько стоит автоматизация?"
    assert lead["utm"]["telegram_user_id"] == 123456


@pytest.mark.asyncio
async def test_channel_lead_goes_through_same_claim_flow_as_website(client, db):
    _, manager_token = await make_user(db, "Manager", "m@example.com", "manager")

    resp = await client.post(
        "/leads/webhook/telegram",
        json={"message": {"from": {"id": 42, "first_name": "Test"}, "text": "hi"}},
    )
    lead_id = resp.json()["id"]

    visible = (
        await client.get("/leads", headers=auth_headers(manager_token))
    ).json()
    assert any(lead_row["id"] == lead_id for lead_row in visible)

    claim = await client.post(
        f"/leads/{lead_id}/claim", headers=auth_headers(manager_token)
    )
    assert claim.status_code == 200

    patched = await client.patch(
        f"/leads/{lead_id}",
        json={"status": "won"},
        headers=auth_headers(manager_token),
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "won"


@pytest.mark.asyncio
async def test_malformed_channel_payloads_return_400(client):
    resp = await client.post("/leads/webhook/instagram", json={"entry": []})
    assert resp.status_code == 400

    resp = await client.post("/leads/webhook/telegram", json={"message": {}})
    assert resp.status_code == 400
