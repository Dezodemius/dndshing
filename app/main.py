from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.core.errors import register_exception_handlers
from app.core.router import router as core_router

app = FastAPI(title="D&D Campaign Platform API")
register_exception_handlers(app)
app.include_router(core_router)
app.include_router(auth_router, prefix="/api/v1")
