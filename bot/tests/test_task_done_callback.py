from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx

import main
from config import settings


@pytest.mark.asyncio
async def test_complete_task_in_crm_success():
    with respx.mock(base_url=settings.crm_api_url) as router:
        route = router.post("/internal/bot/tasks/42/complete").mock(
            return_value=httpx.Response(200, json={"id": 42, "status": "done"})
        )
        result = await main.complete_task_in_crm(telegram_id=555, task_id=42)

    assert result is True
    assert route.called
    sent = route.calls.last.request
    assert sent.headers["X-Internal-Secret"] == settings.internal_secret


@pytest.mark.asyncio
async def test_complete_task_in_crm_failure():
    with respx.mock(base_url=settings.crm_api_url) as router:
        router.post("/internal/bot/tasks/42/complete").mock(
            return_value=httpx.Response(404, json={"detail": "not found"})
        )
        result = await main.complete_task_in_crm(telegram_id=555, task_id=42)

    assert result is False


@pytest.mark.asyncio
async def test_on_task_done_edits_message_and_answers(monkeypatch):
    monkeypatch.setattr(main, "complete_task_in_crm", AsyncMock(return_value=True))

    callback = MagicMock()
    callback.data = "task_done:42"
    callback.from_user.id = 555
    callback.answer = AsyncMock()
    callback.message.text = "Новая задача: Read chapter 1"
    callback.message.edit_text = AsyncMock()

    await main.on_task_done(callback)

    main.complete_task_in_crm.assert_awaited_once_with(555, 42)
    callback.answer.assert_awaited_once_with("Готово!")
    callback.message.edit_text.assert_awaited_once()
    assert "Выполнено" in callback.message.edit_text.await_args[0][0]


@pytest.mark.asyncio
async def test_on_task_done_shows_alert_on_failure(monkeypatch):
    monkeypatch.setattr(main, "complete_task_in_crm", AsyncMock(return_value=False))

    callback = MagicMock()
    callback.data = "task_done:42"
    callback.from_user.id = 555
    callback.answer = AsyncMock()

    await main.on_task_done(callback)

    callback.answer.assert_awaited_once()
    assert callback.answer.await_args.kwargs.get("show_alert") is True
