"""TTS provider 注册表测试。"""

from unittest.mock import MagicMock

import pytest

from app.core.exceptions import TTSProviderNotFoundException
from app.infra.tts.registry import TTSRegistry, build_default_registry


def _provider(name: str):
    provider = MagicMock()
    provider.name = name
    return provider


def test_register_get_list_and_all():
    registry = TTSRegistry()
    dashscope = _provider("dashscope")
    registry.register(dashscope)

    assert registry.get("dashscope") is dashscope
    assert registry.list_providers() == ["dashscope"]
    assert registry.all() == [dashscope]


def test_get_unknown_provider_raises():
    registry = TTSRegistry()
    registry.register(_provider("dashscope"))

    with pytest.raises(TTSProviderNotFoundException) as info:
        registry.get("genie")
    assert info.value.details["registered"] == ["dashscope"]


def test_re_register_overwrites():
    registry = TTSRegistry()
    registry.register(_provider("dashscope"))
    replacement = _provider("dashscope")
    registry.register(replacement)

    assert registry.get("dashscope") is replacement
    assert len(registry.all()) == 1


def test_build_default_registry_registers_dashscope():
    """默认注册表要能真正构造出 DashScope provider（此前 Settings 缺字段建不起来）。"""
    registry = build_default_registry()

    assert "dashscope" in registry.list_providers()
    provider = registry.get("dashscope")
    assert provider.name == "dashscope"
    assert provider._output_dir.is_dir()
