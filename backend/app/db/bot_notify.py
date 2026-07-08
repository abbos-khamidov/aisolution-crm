import httpx

from app.core.config import settings


async def push_task_to_bot(
    telegram_id: int, task_id: int, title: str, due_date: str | None
) -> None:
    """Notifies the aiogram bot process to message the student, per
    CRM_SPEC.md's "CRM пушит в бота (внутренний endpoint)" flow. Best-effort:
    if the bot is unreachable, the task still exists in CRM and can be viewed
    on the web — a failed push is not a reason to fail task creation.
    """
    if not settings.bot_push_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{settings.bot_push_url.rstrip('/')}/internal/push-task",
                json={
                    "telegram_id": telegram_id,
                    "task_id": task_id,
                    "title": title,
                    "due_date": due_date,
                },
                headers={"X-Internal-Secret": settings.internal_bot_secret},
            )
    except httpx.HTTPError:
        pass
