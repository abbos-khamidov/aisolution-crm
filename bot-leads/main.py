"""aiogram3 bot process for @aidatacollector_bot — a public-facing lead
collection bot for aisolution.uz (CRM_SPEC.md phase 8 telegram channel).

Single responsibility: every incoming text message from a new contact is
forwarded, unmodified in shape, to the CRM's existing
`POST /leads/webhook/telegram` endpoint (already built in
`backend/app/api/leads.py` for exactly this Bot API update format), which
creates a lead and round-robin-assigns it to a manager. This process never
talks to the CRM database directly — same hard constraint as `/bot`.
"""

import asyncio
import logging
import re

import httpx
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message

from config import settings

logger = logging.getLogger("aisolutioncrm-bot-leads")

bot = Bot(token=settings.bot_token)
dp = Dispatcher()

WELCOME_TEXT = (
    "Здравствуйте! Это AI Solution. Опишите в двух словах, что вас интересует, "
    "и наш менеджер свяжется с вами в ближайшее время."
)
ACK_TEXT = "Спасибо! Заявка принята, менеджер скоро с вами свяжется."


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value in ("", "-", "—"):
        return None
    return value


def _field(text: str, label: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(label)}\s*(.+)$", text)
    return _clean(match.group(1) if match else None)


def _line_field(text: str, label: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(label)}:\s*(.+)$", text)
    return _clean(match.group(1) if match else None)


def _message_after(text: str, label: str) -> str | None:
    marker = f"{label}\n"
    if marker not in text:
        return None
    tail = text.split(marker, 1)[1].strip()
    lines = []
    for line in tail.splitlines():
        if re.match(r"^[^\w\s]?\s*(?:🕐|👤|📬|🏢|📱|📍)", line):
            break
        lines.append(line)
    return _clean("\n".join(lines))


def build_website_lead_payload(text: str) -> dict | None:
    if not any(marker in text for marker in ("Новая заявка", "Новый лид", "New Lead")):
        return None

    if "New Lead" in text:
        form = _line_field(text, "Form")
        service = _line_field(text, "Service")
        return {
            "name": _line_field(text, "Name") or "Без имени",
            "phone": _line_field(text, "Phone"),
            "email": _line_field(text, "Email"),
            "message": _line_field(text, "Message"),
            "utm": {
                "origin": "website_form",
                "origin_label": "форма сайта",
                "form": form,
                "service": service,
                "raw": text,
            },
        }

    source_note = _field(text, "📍 Источник:")
    is_popup = bool(source_note and "попап" in source_note.lower())
    is_callback = "форма обратного звонка" in text.lower()
    origin = "website_popup" if is_popup else "website_callback" if is_callback else "website_form"
    origin_label = (
        "скролл-попап"
        if is_popup
        else "форма обратного звонка"
        if is_callback
        else "контактная форма"
    )
    company = _field(text, "🏢 Компания:")
    message = _message_after(text, "💬 Сообщение:")
    if company:
        message = f"Компания: {company}\n{message or ''}".strip()

    return {
        "name": _field(text, "👤 Имя:") or "Без имени",
        "phone": _field(text, "📬 Контакт:") or _field(text, "📱 Телефон:"),
        "email": None,
        "message": message,
        "utm": {
            "origin": origin,
            "origin_label": origin_label,
            "source_note": source_note,
            "raw": text,
        },
    }


def build_lead_webhook_payload(message: Message) -> dict:
    return {
        "message": {
            "from": {
                "id": message.from_user.id,
                "first_name": message.from_user.first_name,
                "username": message.from_user.username,
            },
            "text": message.text,
        }
    }


async def forward_to_crm(message: Message) -> bool:
    payload = build_lead_webhook_payload(message)
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{settings.crm_api_url}/leads/webhook/telegram", json=payload
        )
    return resp.status_code == 201


async def forward_website_notification_to_crm(text: str) -> bool:
    payload = build_website_lead_payload(text)
    if payload is None:
        return False
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{settings.crm_api_url}/leads/webhook/website", json=payload)
    return resp.status_code == 201


@dp.message(CommandStart(), F.chat.type == "private")
async def on_start(message: Message) -> None:
    await message.answer(WELCOME_TEXT)


WEBSITE_NOTIFICATION_FILTER = (
    F.text.contains("Новая заявка")
    | F.text.contains("Новый лид")
    | F.text.contains("New Lead")
)


@dp.message(WEBSITE_NOTIFICATION_FILTER)
async def on_website_notification(message: Message) -> None:
    if not message.text:
        return
    ok = await forward_website_notification_to_crm(message.text)
    if ok:
        logger.info("Forwarded website lead notification from chat_id=%s", message.chat.id)


@dp.channel_post(WEBSITE_NOTIFICATION_FILTER)
async def on_website_channel_post(message: Message) -> None:
    if not message.text:
        return
    ok = await forward_website_notification_to_crm(message.text)
    if ok:
        logger.info("Forwarded website lead notification from channel_id=%s", message.chat.id)


@dp.message(F.chat.type == "private")
async def on_message(message: Message) -> None:
    # Group/supergroup/channel messages must never reach here — this bot is
    # also a member of an unrelated group chat, and the F.chat.type filter
    # above is the dispatcher-level guard. This inner check is a second,
    # independent line of defense against ingesting ordinary group
    # conversation as "leads" (that happened once — see PROGRESS.md).
    if message.chat.type != "private" or not message.from_user or not message.text:
        return
    ok = await forward_to_crm(message)
    if ok:
        await message.answer(ACK_TEXT)
    else:
        logger.error("Failed to forward lead to CRM for telegram_user_id=%s", message.from_user.id)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
