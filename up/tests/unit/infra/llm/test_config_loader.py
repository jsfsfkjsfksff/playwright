"""LLM provider 配置加载测试。"""

import pytest

from app.core.exceptions import ConfigException
from app.infra.llm import config_loader
from app.infra.llm.config_loader import ProviderConfig, load_providers

PROVIDER = {
    "base_url": "https://example.invalid/v1",
    "api_key_env": "TEST_LLM_KEY",
    "timeout": 12,
}


def test_loads_configured_provider(monkeypatch, write_providers):
    monkeypatch.setenv("TEST_LLM_KEY", "secret")
    providers = load_providers(write_providers({"dashscope": PROVIDER}))

    assert set(providers) == {"dashscope"}
    cfg = providers["dashscope"]
    assert isinstance(cfg, ProviderConfig)
    assert cfg.name == "dashscope"
    assert cfg.base_url == "https://example.invalid/v1"
    assert cfg.api_key == "secret"
    assert cfg.timeout == 12.0


def test_timeout_falls_back_to_settings(monkeypatch, write_providers):
    """provider 未写 timeout 时用 settings.llm_timeout。"""
    monkeypatch.setenv("TEST_LLM_KEY", "secret")
    monkeypatch.setattr(config_loader.settings, "llm_timeout", 42.5)
    path = write_providers(
        {"dashscope": {"base_url": "https://x.invalid/v1", "api_key_env": "TEST_LLM_KEY"}}
    )
    assert load_providers(path)["dashscope"].timeout == 42.5


def test_provider_without_key_is_skipped(monkeypatch, write_providers):
    """缺密钥的 provider 跳过，不阻塞其它 provider。"""
    monkeypatch.setenv("TEST_LLM_KEY", "secret")
    monkeypatch.delenv("MISSING_KEY", raising=False)
    path = write_providers(
        {
            "dashscope": PROVIDER,
            "deepseek": {"base_url": "https://x.invalid", "api_key_env": "MISSING_KEY"},
        }
    )
    assert set(load_providers(path)) == {"dashscope"}


def test_provider_without_api_key_env_is_skipped(monkeypatch, write_providers):
    path = write_providers({"dashscope": {"base_url": "https://x.invalid"}})
    with pytest.raises(ConfigException) as info:
        load_providers(path)
    assert "没有任何可用的 LLM provider" in info.value.message


def test_missing_file_raises(tmp_path):
    with pytest.raises(ConfigException) as info:
        load_providers(tmp_path / "nope.yaml")
    assert "不存在" in info.value.message


def test_provider_without_base_url_raises(monkeypatch, write_providers):
    monkeypatch.setenv("TEST_LLM_KEY", "secret")
    path = write_providers({"dashscope": {"api_key_env": "TEST_LLM_KEY"}})
    with pytest.raises(ConfigException) as info:
        load_providers(path)
    assert "base_url" in info.value.message
    assert "dashscope" in info.value.message


def test_bad_provider_shape_raises(monkeypatch, write_providers):
    monkeypatch.setenv("TEST_LLM_KEY", "secret")
    path = write_providers({"dashscope": "oops"})
    with pytest.raises(ConfigException) as info:
        load_providers(path)
    assert "格式错误" in info.value.message


def test_real_providers_file_loads_with_keys(monkeypatch, repo_root):
    """仓库里的真实 providers.yaml 配好密钥后必须可用。"""
    monkeypatch.setattr(
        config_loader.settings,
        "providers_file",
        str(repo_root / "configs" / "providers.yaml"),
    )
    for env_name in ("DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.setenv(env_name, "dummy")
    providers = load_providers()
    assert {"dashscope", "deepseek", "openai"} <= set(providers)
    assert all(p.api_key == "dummy" for p in providers.values())
