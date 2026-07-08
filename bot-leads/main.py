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


@dp.message(CommandStart(), F.chat.type == "private")
async def on_start(message: Message) -> None:
    await message.answer(WELCOME_TEXT)


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
