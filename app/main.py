from fastapi import FastAPI

from app.core.router import router as core_router

app = FastAPI(title="D&D Campaign Platform API")
app.include_router(core_router)
