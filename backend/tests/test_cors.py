import pytest


@pytest.mark.asyncio
async def test_cors_preflight_allows_frontend_origin(client):
    resp = await client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.asyncio
async def test_cors_header_present_on_actual_response(client):
    resp = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "wrong"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
