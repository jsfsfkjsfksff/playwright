"""应用装配、健康检查、traceId 与异常处理测试。"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exceptions import TTSFailedException
from app.core.logging import get_trace_id
from app.main import (
    app,
    app_exception_handler,
    unhandled_exception_handler,
)


@pytest.fixture(autouse=True)
def lifespan_spies(monkeypatch):
    """跑真实 lifespan，但把预热与停机释放换成可断言的假对象。"""
    getter = MagicMock(return_value=MagicMock())
    shutdown = AsyncMock(return_value=None)
    monkeypatch.setattr("app.main.get_llm_gateway", getter)
    monkeypatch.setattr("app.main.shutdown_services", shutdown)
    return SimpleNamespace(getter=getter, shutdown=shutdown)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }


def test_static_mount_and_health_route_registered():
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/health" in paths
    assert "/static" in paths


def test_trace_id_header_is_echoed(client):
    response = client.get("/health", headers={"X-Trace-Id": "trace-abc"})
    assert response.headers["X-Trace-Id"] == "trace-abc"


def test_trace_id_is_generated_when_absent(client):
    trace_id = client.get("/health").headers["X-Trace-Id"]
    assert len(trace_id) == 32
    assert int(trace_id, 16) >= 0


def test_lifespan_prewarms_gateway_and_runs_shutdown(lifespan_spies):
    with TestClient(app) as test_client:
        assert test_client.get("/health").status_code == 200
        assert lifespan_spies.getter.call_count == 1
        lifespan_spies.shutdown.assert_not_awaited()

    lifespan_spies.shutdown.assert_awaited_once()


def test_lifespan_swallows_shutdown_failure(monkeypatch, lifespan_spies):
    monkeypatch.setattr(
        "app.main.shutdown_services",
        AsyncMock(side_effect=RuntimeError("shutdown boom")),
    )
    with TestClient(app) as test_client:
        assert test_client.get("/health").status_code == 200


@pytest.mark.anyio
async def test_app_exception_handler_returns_structured_body():
    response = await app_exception_handler(
        None, TTSFailedException("合成坏了", details={"voice": "x"})
    )
    assert response.status_code == 500
    assert json.loads(response.body) == {
        "code": "TTS_FAILED",
        "message": "合成坏了",
        "traceId": get_trace_id(),
        "details": {"voice": "x"},
    }


@pytest.mark.anyio
async def test_unhandled_exception_handler_hides_details():
    response = await unhandled_exception_handler(None, RuntimeError("boom"))
    assert response.status_code == 500
    body = json.loads(response.body)
    assert body["code"] == "INTERNAL_ERROR"
    assert body["message"] == "服务内部错误"
    assert body["details"] == {}
    assert "boom" not in json.dumps(body)
