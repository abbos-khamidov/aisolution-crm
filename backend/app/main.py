from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.clients import router as clients_router
from app.api.files import router as files_router
from app.api.finance import router as finance_router
from app.api.leads import router as leads_router
from app.api.projects import router as projects_router
from app.api.settings import router as settings_router
from app.api.tasks import internal_router as bot_internal_router
from app.api.tasks import router as tasks_router
from app.api.users import router as users_router
from app.core.config import settings
from app.db.pool import close_pool, init_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="aisolutioncrm", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_allowed_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(clients_router)
app.include_router(projects_router)
app.include_router(finance_router)
app.include_router(files_router)
app.include_router(tasks_router)
app.include_router(bot_internal_router)
app.include_router(analytics_router)
app.include_router(users_router)
app.include_router(settings_router)
Path(settings.local_upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.local_upload_dir), name="uploads")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
