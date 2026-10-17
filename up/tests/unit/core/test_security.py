"""内部 Token 鉴权测试。"""

import inspect

import pytest

from app.core.config import settings
from app.core.exceptions import UnauthorizedException
from app.core.security import verify_internal_token


def test_header_alias_contract():
    """对外约定的请求头是 X-Internal-Token，且默认可缺省。"""
    param = inspect.signature(verify_internal_token).parameters["x_internal_token"]
    assert param.default.alias == "X-Internal-Token"
    assert param.default.default is None


@pytest.mark.anyio
async def test_valid_token_passes(monkeypatch):
    monkeypatch.setattr(settings, "internal_token", "s3cret")
    assert await verify_internal_token("s3cret") is None


@pytest.mark.anyio
async def test_wrong_token_raises_unauthorized(monkeypatch):
    monkeypatch.setattr(settings, "internal_token", "s3cret")
    with pytest.raises(UnauthorizedException) as info:
        await verify_internal_token("wrong")
    assert info.value.http_status == 401
    assert info.value.message == "Token 无效"


@pytest.mark.anyio
async def test_missing_token_raises_unauthorized():
    with pytest.raises(UnauthorizedException):
        await verify_internal_token(None)
