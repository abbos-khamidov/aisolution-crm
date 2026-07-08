from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

import main
from config import settings


@pytest.fixture
async def api_client(monkeypatch):
    send_message = AsyncMock()
    monkeypatch.setattr(main.bot, "send_message", send_message)
    app = main.build_web_app()
    async with TestClient(TestServer(app)) as client:
        yield client, send_message


@pytest.mark.asyncio
async def test_push_task_rejects_bad_secret(api_client):
    client, _ = api_client
    resp = await client.post(
        "/internal/push-task",
        json={"telegram_id": 1, "task_id": 1, "title": "x"},
        headers={"X-Internal-Secret": "wrong"},
    )
    assert resp.status == 401


@pytest.mark.asyncio
async def test_push_task_sends_message_with_keyboard(api_client):
    client, send_message = api_client
    resp = await client.post(
        "/internal/push-task",
        json={
            "telegram_id": 555,
            "task_id": 42,
            "title": "Read chapter 1",
            "due_date": "2026-08-01",
        },
        headers={"X-Internal-Secret": settings.internal_secret},
    )
    assert resp.status == 200

    send_message.assert_awaited_once()
    args, kwargs = send_message.await_args
    assert args[0] == 555
    assert "Read chapter 1" in args[1]
    assert "2026-08-01" in args[1]
    keyboard = kwargs["reply_markup"]
    assert keyboard.inline_keyboard[0][0].callback_data == "task_done:42"
