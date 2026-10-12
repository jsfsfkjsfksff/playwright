from fastapi import Header

from app.core.config import settings
from app.core.exceptions import UnauthorizedException


async def verify_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """校验内部服务调用 Token。

    所有 /api/* 接口都应通过 Depends(verify_internal_token) 挂载。
    """
    if not x_internal_token or x_internal_token != settings.internal_token:
        raise UnauthorizedException("Token 无效")
