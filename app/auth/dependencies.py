from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.errors import EmailNotVerifiedError, NotAuthenticatedError
from app.auth.models import User
from app.auth.security import TokenError, decode_token
from app.core.db import get_db


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise NotAuthenticatedError()

    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except TokenError as exc:
        raise NotAuthenticatedError() from exc

    if payload.get("type") != "access":
        raise NotAuthenticatedError()

    user = await db.get(User, int(payload["sub"]))
    if user is None:
        raise NotAuthenticatedError()

    return user


async def get_verified_user(user: User = Depends(get_current_user)) -> User:
    """For endpoints outside auth/*: access is closed until the email is verified."""
    if not user.email_verified:
        raise EmailNotVerifiedError()
    return user
