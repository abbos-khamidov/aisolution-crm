from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.clients import router as clients_router
from app.api.files import router as files_router
from app.api.finance import router as finance_router
from app.api.leads import router as leads_router
from app.api.projects import router as projects_router
from app.db.pool import close_pool, init_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="aisolutioncrm", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(clients_router)
app.include_router(projects_router)
app.include_router(finance_router)
app.include_router(files_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
