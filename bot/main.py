"""aiogram3 bot process for aisolutioncrm student tasks (CRM_SPEC.md phase 5).

Two responsibilities, run concurrently in one process:
1. An aiohttp server exposing POST /internal/push-task — the CRM backend calls
   this when a task is created, and this process sends the student a Telegram
   message with an inline "Готово" button.
2. An aiogram polling loop that listens for that button's callback and calls
   back into the CRM's internal REST endpoint to mark the task done — never
   writes to the CRM database directly (CRM_SPEC.md hard constraint: bot only
   talks to CRM via internal REST API).
"""

import asyncio
import logging

import httpx
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from aiohttp import web

from config import settings

logger = logging.getLogger("aisolutioncrm-bot")

bot = Bot(token=settings.bot_token)
dp = Dispatcher()


def build_task_message(title: str, due_date: str | None) -> tuple[str, str | None]:
    text = f"Новая задача: {title}"
    if due_date:
        text += f"\nСрок: {due_date}"
    return text, due_date


def build_done_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Готово", callback_data=f"task_done:{task_id}")]
        ]
    )


async def complete_task_in_crm(telegram_id: int, task_id: int) -> bool:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{settings.crm_api_url}/internal/bot/tasks/{task_id}/complete",
            json={"telegram_id": telegram_id},
            headers={"X-Internal-Secret": settings.internal_secret},
        )
    return resp.status_code == 200


async def confirm_telegram_login(token: str, telegram_id: int) -> bool:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{settings.crm_api_url}/internal/bot/telegram-login/confirm",
            json={"token": token, "telegram_id": telegram_id},
            headers={"X-Internal-Secret": settings.internal_secret},
        )
    return resp.status_code == 200 and resp.json().get("confirmed") is True


@dp.message(CommandStart(deep_link=True))
async def on_start_with_login_token(message: Message, command: CommandObject) -> None:
    token = command.args
    if not token or not message.from_user:
        await message.answer("Ссылка для входа недействительна.")
        return

    ok = await confirm_telegram_login(token, message.from_user.id)
    if ok:
        await message.answer("Вход подтверждён! Вернитесь на сайт aisolutioncrm.")
    else:
        await message.answer(
            "Не удалось войти — ссылка устарела или вы не зарегистрированы в CRM. "
            "Обратитесь к founder'у."
        )


@dp.message(Command("start"))
async def on_start(message: Message) -> None:
    await message.answer(
        "Привет! Здесь будут приходить задачи от aisolutioncrm с кнопкой «Готово»."
    )


@dp.callback_query(F.data.startswith("task_done:"))
async def on_task_done(callback: CallbackQuery) -> None:
    task_id = int(callback.data.split(":", 1)[1])
    telegram_id = callback.from_user.id

    ok = await complete_task_in_crm(telegram_id, task_id)
    if not ok:
        await callback.answer("Не удалось отметить задачу, попробуйте ещё раз", show_alert=True)
        return

    await callback.answer("Готово!")
    if callback.message:
        await callback.message.edit_text(f"{callback.message.text}\n\n✅ Выполнено")


async def handle_push_task(request: web.Request) -> web.Response:
    if request.headers.get("X-Internal-Secret") != settings.internal_secret:
        return web.json_response({"detail": "unauthorized"}, status=401)

    body = await request.json()
    telegram_id = body["telegram_id"]
    task_id = body["task_id"]
    title = body["title"]
    due_date = body.get("due_date")

    text, _ = build_task_message(title, due_date)
    await bot.send_message(telegram_id, text, reply_markup=build_done_keyboard(task_id))
    return web.json_response({"ok": True})


def build_web_app() -> web.Application:
    app = web.Application()
    app.router.add_post("/internal/push-task", handle_push_task)
    return app


async def run_web_app() -> None:
    runner = web.AppRunner(build_web_app())
    await runner.setup()
    site = web.TCPSite(runner, settings.listen_host, settings.listen_port)
    await site.start()
    await asyncio.Event().wait()


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await asyncio.gather(dp.start_polling(bot), run_web_app())


if __name__ == "__main__":
    asyncio.run(main())
