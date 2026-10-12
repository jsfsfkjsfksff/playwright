"""模型路由测试。"""

import pytest

from app.core.exceptions import ConfigException, ModelAliasNotFoundException
from app.infra.llm.registry import AdapterRegistry
from app.infra.llm.router import LLMRouter

ALIASES = {
    "podcaster": {
        "provider": "dashscope",
        "model": "qwen-plus",
        "temperature": 0.7,
        "fallbacks": [{"provider": "openai", "model": "gpt-4o-mini"}],
    },
    "judge": {"provider": "deepseek", "model": "deepseek-chat", "temperature": 0.0},
}


def _registry(make_adapter, names=("dashscope", "openai", "deepseek")) -> AdapterRegistry:
    registry = AdapterRegistry()
    for name in names:
        registry.register(name, make_adapter(name))
    return registry


def test_resolve_returns_adapter_model_temperature(make_adapter, write_routing):
    registry = _registry(make_adapter)
    router = LLMRouter(registry, routing_file=write_routing(ALIASES))

    target = router.resolve("podcaster")
    assert target.adapter is registry.get("dashscope")
    assert target.model == "qwen-plus"
    assert target.temperature == 0.7


def test_temperature_defaults_to_07(make_adapter, write_routing):
    path = write_routing({"x": {"provider": "dashscope", "model": "m"}})
    router = LLMRouter(_registry(make_adapter), routing_file=path)
    assert router.resolve("x").temperature == 0.7


def test_unknown_alias_raises_with_available_list(make_adapter, write_routing):
    router = LLMRouter(_registry(make_adapter), routing_file=write_routing(ALIASES))
    with pytest.raises(ModelAliasNotFoundException) as info:
        router.resolve("nope")
    assert set(info.value.details["available"]) == set(ALIASES)


def test_resolve_fallbacks_keeps_order_and_alias_temperature(
    make_adapter, write_routing
):
    router = LLMRouter(_registry(make_adapter), routing_file=write_routing(ALIASES))

    targets = router.resolve_fallbacks("podcaster")
    assert [t.adapter.provider for t in targets] == ["openai"]
    assert targets[0].model == "gpt-4o-mini"
    assert targets[0].temperature == 0.7

    assert router.resolve_fallbacks("judge") == []


def test_unknown_alias_has_no_fallbacks(make_adapter, write_routing):
    router = LLMRouter(_registry(make_adapter), routing_file=write_routing(ALIASES))
    assert router.resolve_fallbacks("nope") == []


def test_unregistered_fallback_provider_is_skipped(make_adapter, write_routing):
    """fallback provider 没注册时跳过，不让整个 alias 崩掉。"""
    registry = _registry(make_adapter, names=("dashscope",))
    router = LLMRouter(registry, routing_file=write_routing(ALIASES))
    assert router.resolve_fallbacks("podcaster") == []


def test_missing_routing_file_raises(make_adapter, tmp_path):
    with pytest.raises(ConfigException):
        LLMRouter(_registry(make_adapter), routing_file=tmp_path / "nope.yaml")


def test_empty_aliases_raises(make_adapter, write_routing):
    with pytest.raises(ConfigException) as info:
        LLMRouter(_registry(make_adapter), routing_file=write_routing({}))
    assert "alias" in info.value.message


def test_list_aliases(make_adapter, write_routing):
    router = LLMRouter(_registry(make_adapter), routing_file=write_routing(ALIASES))
    assert set(router.list_aliases()) == set(ALIASES)
