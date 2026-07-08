from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.db.pool import close_pool, init_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="aisolutioncrm", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
