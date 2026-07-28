from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.campaigns.router import router as campaigns_router
from app.characters.router import router as characters_router
from app.content.router import router as content_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.router import router as core_router
from app.merchants.router import router as merchants_router

app = FastAPI(title="D&D Campaign Platform API")
register_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(core_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(content_router, prefix="/api/v1")
app.include_router(characters_router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(merchants_router, prefix="/api/v1")
