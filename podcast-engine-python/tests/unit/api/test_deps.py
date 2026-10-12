"""依赖装配与停机释放测试。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api import deps


@pytest.fixture(autouse=True)
def _clear_service_caches():
    """lru_cache 是进程级的，用例之间必须清干净。"""
    for cached in (deps.get_llm_gateway, deps.get_agent_service, deps.get_tts_service):
        cached.cache_clear()
    yield
    for cached in (deps.get_llm_gateway, deps.get_agent_service, deps.get_tts_service):
        cached.cache_clear()


@pytest.fixture
def wiring(monkeypatch):
    """把装配依赖换成假对象，避免真的读配置、建连接。"""
    tts = MagicMock()
    tts.aclose = AsyncMock(return_value=None)
    gateway = MagicMock()
    gateway.aclose = AsyncMock(return_value=None)
    agent_service = MagicMock()

    monkeypatch.setattr(deps, "TTSService", MagicMock(return_value=tts))
    monkeypatch.setattr(deps, "build_gateway", MagicMock(return_value=gateway))
    monkeypatch.setattr(deps, "AgentService", MagicMock(return_value=agent_service))
    return SimpleNamespace(tts=tts, gateway=gateway, agent_service=agent_service)


def test_gateway_is_cached(wiring):
    first = deps.get_llm_gateway()
    assert first is wiring.gateway
    assert deps.get_llm_gateway() is first
    assert deps.build_gateway.call_count == 1


def test_tts_and_agent_service_are_cached(wiring):
    assert deps.get_tts_service() is wiring.tts
    assert deps.get_tts_service() is deps.get_tts_service()
    assert deps.TTSService.call_count == 1

    assert deps.get_agent_service() is wiring.agent_service
    assert deps.AgentService.call_args.kwargs["llm"] is wiring.gateway


@pytest.mark.anyio
async def test_shutdown_closes_created_services_and_clears_caches(wiring):
    deps.get_tts_service()
    deps.get_llm_gateway()

    await deps.shutdown_services()

    wiring.tts.aclose.assert_awaited_once()
    wiring.gateway.aclose.assert_awaited_once()
    assert deps.get_tts_service.cache_info().currsize == 0
    assert deps.get_llm_gateway.cache_info().currsize == 0
    assert deps.get_agent_service.cache_info().currsize == 0


@pytest.mark.anyio
async def test_shutdown_skips_services_never_created(wiring):
    await deps.shutdown_services()

    wiring.tts.aclose.assert_not_awaited()
    wiring.gateway.aclose.assert_not_awaited()


@pytest.mark.anyio
async def test_shutdown_still_closes_gateway_when_tts_close_fails(wiring):
    """回归：TTS 关闭失败不能连累 LLM 网关。"""
    wiring.tts.aclose = AsyncMock(side_effect=RuntimeError("tts close boom"))
    deps.get_tts_service()
    deps.get_llm_gateway()

    await deps.shutdown_services()

    wiring.gateway.aclose.assert_awaited_once()


@pytest.mark.anyio
async def test_shutdown_does_not_raise_when_gateway_close_fails(wiring):
    wiring.gateway.aclose = AsyncMock(side_effect=RuntimeError("gateway close boom"))
    deps.get_llm_gateway()

    await deps.shutdown_services()


@pytest.mark.anyio
async def test_shutdown_is_idempotent(wiring):
    """第二次调用不会重复关闭（缓存已清空，跳过）。"""
    deps.get_tts_service()
    deps.get_llm_gateway()

    await deps.shutdown_services()
    await deps.shutdown_services()

    wiring.tts.aclose.assert_awaited_once()
    wiring.gateway.aclose.assert_awaited_once()
