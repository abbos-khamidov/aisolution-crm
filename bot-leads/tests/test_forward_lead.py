from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx

import main
from config import settings


def make_message(
    user_id=555,
    first_name="Ivan",
    username="ivan_tg",
    text="Хочу автоматизацию",
    chat_type="private",
):
    message = MagicMock()
    message.from_user.id = user_id
    message.from_user.first_name = first_name
    message.from_user.username = username
    message.text = text
    message.chat.type = chat_type
    message.answer = AsyncMock()
    return message


def test_build_lead_webhook_payload_matches_telegram_bot_api_shape():
    message = make_message()
    payload = main.build_lead_webhook_payload(message)
    assert payload == {
        "message": {
            "from": {"id": 555, "first_name": "Ivan", "username": "ivan_tg"},
            "text": "Хочу автоматизацию",
        }
    }


@pytest.mark.asyncio
async def test_forward_to_crm_success():
    message = make_message()
    with respx.mock(base_url=settings.crm_api_url) as router:
        route = router.post("/leads/webhook/telegram").mock(
            return_value=httpx.Response(201, json={"id": 1, "owner_id": 3})
        )
        result = await main.forward_to_crm(message)

    assert result is True
    sent = route.calls.last.request
    assert httpx.Request("POST", sent.url).method == "POST"


@pytest.mark.asyncio
async def test_forward_to_crm_failure():
    message = make_message()
    with respx.mock(base_url=settings.crm_api_url) as router:
        router.post("/leads/webhook/telegram").mock(
            return_value=httpx.Response(400, json={"detail": "No message.from"})
        )
        result = await main.forward_to_crm(message)

    assert result is False


@pytest.mark.asyncio
async def test_on_message_acks_when_forward_succeeds(monkeypatch):
    monkeypatch.setattr(main, "forward_to_crm", AsyncMock(return_value=True))
    message = make_message()

    await main.on_message(message)

    message.answer.assert_awaited_once_with(main.ACK_TEXT)


@pytest.mark.asyncio
async def test_on_message_stays_silent_when_forward_fails(monkeypatch):
    monkeypatch.setattr(main, "forward_to_crm", AsyncMock(return_value=False))
    message = make_message()

    await main.on_message(message)

    message.answer.assert_not_awaited()


@pytest.mark.asyncio
async def test_on_message_ignores_non_text_messages(monkeypatch):
    forward = AsyncMock()
    monkeypatch.setattr(main, "forward_to_crm", forward)
    message = make_message(text=None)

    await main.on_message(message)

    forward.assert_not_awaited()
    message.answer.assert_not_awaited()


@pytest.mark.asyncio
async def test_on_start_sends_welcome():
    message = make_message()

    await main.on_start(message)

    message.answer.assert_awaited_once_with(main.WELCOME_TEXT)


@pytest.mark.asyncio
async def test_on_message_ignores_group_chats(monkeypatch):
    forward = AsyncMock()
    monkeypatch.setattr(main, "forward_to_crm", forward)
    message = make_message(chat_type="supergroup")

    await main.on_message(message)

    forward.assert_not_awaited()
    message.answer.assert_not_awaited()
