from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx

import main
from config import settings


@pytest.mark.asyncio
async def test_confirm_telegram_login_success():
    with respx.mock(base_url=settings.crm_api_url) as router:
        route = router.post("/internal/bot/telegram-login/confirm").mock(
            return_value=httpx.Response(200, json={"confirmed": True})
        )
        result = await main.confirm_telegram_login("tok123", telegram_id=555)

    assert result is True
    assert route.calls.last.request.headers["X-Internal-Secret"] == settings.internal_secret


@pytest.mark.asyncio
async def test_confirm_telegram_login_not_registered():
    with respx.mock(base_url=settings.crm_api_url) as router:
        router.post("/internal/bot/telegram-login/confirm").mock(
            return_value=httpx.Response(200, json={"confirmed": False, "reason": "not_registered"})
        )
        result = await main.confirm_telegram_login("tok123", telegram_id=555)

    assert result is False


@pytest.mark.asyncio
async def test_on_start_with_login_token_success(monkeypatch):
    monkeypatch.setattr(main, "confirm_telegram_login", AsyncMock(return_value=True))

    message = MagicMock()
    message.from_user.id = 555
    message.answer = AsyncMock()
    command = MagicMock()
    command.args = "tok123"

    await main.on_start_with_login_token(message, command)

    main.confirm_telegram_login.assert_awaited_once_with("tok123", 555)
    message.answer.assert_awaited_once()
    assert "подтверждён" in message.answer.await_args[0][0]


@pytest.mark.asyncio
async def test_on_start_with_login_token_missing_args():
    message = MagicMock()
    message.answer = AsyncMock()
    command = MagicMock()
    command.args = None

    await main.on_start_with_login_token(message, command)

    message.answer.assert_awaited_once()
    assert "недействительна" in message.answer.await_args[0][0]
