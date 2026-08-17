from fastapi import APIRouter

router = APIRouter(tags=["core"])


@router.api_route("/healthz", methods=["GET", "HEAD"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
