"""LLM 适配器注册表测试。"""

import pytest

from app.core.exceptions import LLMProviderNotFoundException
from app.infra.llm.adapters.openai_compat import OpenAICompatAdapter
from app.infra.llm.config_loader import ProviderConfig
from app.infra.llm.registry import AdapterRegistry, build_registry


def test_register_get_and_list(make_adapter):
    registry = AdapterRegistry()
    adapter = make_adapter("dashscope")

    registry.register("dashscope", adapter)
    assert registry.get("dashscope") is adapter
    assert registry.list_providers() == ["dashscope"]
    assert registry.all() == [adapter]


def test_get_unknown_provider_raises(make_adapter):
    registry = AdapterRegistry()
    registry.register("dashscope", make_adapter("dashscope"))

    with pytest.raises(LLMProviderNotFoundException) as info:
        registry.get("openai")
    assert info.value.details["registered"] == ["dashscope"]


@pytest.mark.anyio
async def test_build_registry_creates_openai_compat_adapters():
    providers = {
        "dashscope": ProviderConfig(
            name="dashscope",
            base_url="https://a.invalid/v1",
            api_key="k1",
            timeout=5.0,
        ),
        "deepseek": ProviderConfig(
            name="deepseek",
            base_url="https://b.invalid",
            api_key="k2",
            timeout=7.0,
        ),
    }
    registry = build_registry(providers)

    assert set(registry.list_providers()) == {"dashscope", "deepseek"}
    assert [a.provider for a in registry.all()] == ["dashscope", "deepseek"]
    assert all(isinstance(a, OpenAICompatAdapter) for a in registry.all())

    for adapter in registry.all():
        await adapter.aclose()
