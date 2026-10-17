"""LLM 网关测试：主备切换、结构化输出、资源释放。"""

from unittest.mock import AsyncMock

import pytest
import yaml
from pydantic import BaseModel

from app.core.exceptions import LLMOutputInvalidException
from app.infra.llm.base import LLMResult
from app.infra.llm.config_loader import load_providers
from app.infra.llm.gateway import LLMGateway, build_gateway
from app.infra.llm.registry import AdapterRegistry, build_registry
from app.infra.llm.router import LLMRouter

ALIASES = {
    "podcaster": {
        "provider": "dashscope",
        "model": "qwen-plus",
        "temperature": 0.7,
        "fallbacks": [{"provider": "deepseek", "model": "deepseek-chat"}],
    }
}
MESSAGES = [{"role": "user", "content": "hi"}]


class _Draft(BaseModel):
    script: str


@pytest.fixture
def make_gateway(make_adapter, write_routing):
    """构造带一个 fallback 的网关，返回 (gateway, registry)。"""

    def _make(primary_result=None, fallback_result=None, primary_error=None):
        primary = make_adapter("dashscope", chat_result=primary_result)
        fallback = make_adapter("deepseek", chat_result=fallback_result)
        if primary_error is not None:
            primary.chat = AsyncMock(side_effect=primary_error)
        registry = AdapterRegistry()
        registry.register("dashscope", primary)
        registry.register("deepseek", fallback)
        router = LLMRouter(registry, routing_file=write_routing(ALIASES))
        return LLMGateway(router, registry), registry

    return _make


@pytest.mark.anyio
async def test_chat_uses_primary_target(make_gateway):
    result = LLMResult(content="你好", model="qwen-plus", provider="dashscope")
    gateway, registry = make_gateway(primary_result=result)

    assert await gateway.chat(model_alias="podcaster", messages=MESSAGES) is result

    primary = registry.get("dashscope")
    primary.chat.assert_awaited_once()
    assert primary.chat.call_args.kwargs["model"] == "qwen-plus"
    assert primary.chat.call_args.kwargs["temperature"] == 0.7
    registry.get("deepseek").chat.assert_not_awaited()


@pytest.mark.anyio
async def test_chat_temperature_override(make_gateway):
    gateway, registry = make_gateway()
    await gateway.chat(model_alias="podcaster", messages=MESSAGES, temperature=0.1)
    assert registry.get("dashscope").chat.call_args.kwargs["temperature"] == 0.1


@pytest.mark.anyio
async def test_chat_falls_back_on_primary_failure(make_gateway):
    fallback_result = LLMResult(content="备用", model="deepseek-chat", provider="deepseek")
    gateway, registry = make_gateway(
        fallback_result=fallback_result, primary_error=RuntimeError("primary down")
    )

    assert await gateway.chat(model_alias="podcaster", messages=MESSAGES) is fallback_result
    assert registry.get("deepseek").chat.call_args.kwargs["model"] == "deepseek-chat"


@pytest.mark.anyio
async def test_chat_all_targets_failed(make_gateway):
    gateway, registry = make_gateway(primary_error=RuntimeError("all down"))
    # fallback 也失败：让它的 chat 抛错
    registry.get("deepseek").chat = AsyncMock(side_effect=RuntimeError("fb down"))

    with pytest.raises(LLMOutputInvalidException) as info:
        await gateway.chat(model_alias="podcaster", messages=MESSAGES)
    assert info.value.details["error"] == "fb down"


@pytest.mark.anyio
async def test_structured_forwards_schema(make_gateway):
    draft = _Draft(script="稿子")
    gateway, registry = make_gateway()
    registry.get("dashscope").structured = AsyncMock(return_value=draft)

    result = await gateway.structured(
        model_alias="podcaster", messages=MESSAGES, schema=_Draft
    )
    assert result is draft
    kwargs = registry.get("dashscope").structured.call_args.kwargs
    assert kwargs["schema"] is _Draft
    assert kwargs["temperature"] == 0.7


@pytest.mark.anyio
async def test_structured_falls_back(make_gateway):
    fallback_draft = _Draft(script="备用稿")
    gateway, registry = make_gateway()
    registry.get("dashscope").structured = AsyncMock(side_effect=RuntimeError("bad json"))
    registry.get("deepseek").structured = AsyncMock(return_value=fallback_draft)

    result = await gateway.structured(
        model_alias="podcaster", messages=MESSAGES, schema=_Draft
    )
    assert result is fallback_draft


@pytest.mark.anyio
async def test_structured_all_failed_mentions_alias(make_gateway):
    gateway, registry = make_gateway()
    for provider in ("dashscope", "deepseek"):
        registry.get(provider).structured = AsyncMock(side_effect=RuntimeError("nope"))

    with pytest.raises(LLMOutputInvalidException) as info:
        await gateway.structured(model_alias="podcaster", messages=MESSAGES, schema=_Draft)
    assert "podcaster" in info.value.message
    assert info.value.details["error"] == "nope"


@pytest.mark.anyio
async def test_aclose_closes_every_adapter(make_gateway):
    gateway, registry = make_gateway()
    await gateway.aclose()
    for provider in ("dashscope", "deepseek"):
        registry.get(provider).aclose.assert_awaited_once()


@pytest.mark.anyio
async def test_aclose_continues_after_failure(make_gateway):
    """一个适配器关不掉，不能连累其它适配器。"""
    gateway, registry = make_gateway()
    registry.get("dashscope").aclose = AsyncMock(side_effect=RuntimeError("close boom"))

    await gateway.aclose()

    registry.get("deepseek").aclose.assert_awaited_once()


@pytest.mark.anyio
async def test_repo_configs_resolve_every_alias(monkeypatch, repo_root):
    """真实 configs 能构造出 router，且每个 alias（含 fallback）都能解析。"""
    for env_name in (
        "DASHSCOPE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENAI_API_KEY",
        "ALIYUN_MAAS_API_KEY",
    ):
        monkeypatch.setenv(env_name, "dummy")
    monkeypatch.setattr(
        "app.infra.llm.config_loader.settings.providers_file",
        str(repo_root / "configs" / "providers.yaml"),
    )
    monkeypatch.setattr(
        "app.infra.llm.router.settings.model_routing_file",
        str(repo_root / "configs" / "model_routing.yaml"),
    )

    registry = build_registry(load_providers())
    router = LLMRouter(registry)
    aliases = yaml.safe_load(
        (repo_root / "configs" / "model_routing.yaml").read_text(encoding="utf-8")
    )["aliases"]

    for name, cfg in aliases.items():
        target = router.resolve(name)
        assert target.adapter.provider == cfg["provider"]
        assert target.model == cfg["model"]
        assert target.temperature == float(cfg["temperature"])
        fallbacks = router.resolve_fallbacks(name)
        assert [f.adapter.provider for f in fallbacks] == [
            fb["provider"] for fb in cfg.get("fallbacks") or []
        ]

    for adapter in registry.all():
        await adapter.aclose()


@pytest.mark.anyio
async def test_build_gateway_wires_real_registry(monkeypatch, repo_root):
    for env_name in ("DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.setenv(env_name, "dummy")
    monkeypatch.setattr(
        "app.infra.llm.config_loader.settings.providers_file",
        str(repo_root / "configs" / "providers.yaml"),
    )
    monkeypatch.setattr(
        "app.infra.llm.router.settings.model_routing_file",
        str(repo_root / "configs" / "model_routing.yaml"),
    )

    gateway = build_gateway()
    assert isinstance(gateway, LLMGateway)
    await gateway.aclose()
