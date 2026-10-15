"""常量与配置文件一致性测试。"""

import pytest
import yaml

from app.core.constants import ErrorCode, ModelAlias, ProviderName, Status


def _string_constants(cls) -> dict[str, str]:
    return {
        name: value
        for name, value in vars(cls).items()
        if not name.startswith("_") and isinstance(value, str)
    }


def test_error_code_names_equal_values():
    """错误码常量名与值保持一致，避免两套命名。"""
    codes = _string_constants(ErrorCode)
    assert codes
    assert all(name == value for name, value in codes.items())
    assert len(set(codes.values())) == len(codes)


def test_status_and_provider_values():
    assert Status.SUCCESS == "success"
    assert Status.PENDING == "pending"
    assert Status.FAILED == "failed"
    assert ProviderName.DASHSCOPE == "dashscope"
    assert ProviderName.DEEPSEEK == "deepseek"
    assert ProviderName.OPENAI == "openai"


def test_model_alias_matches_routing_file(repo_root):
    """ModelAlias 与 model_routing.yaml 的 alias 必须一一对应。"""
    raw = yaml.safe_load(
        (repo_root / "configs" / "model_routing.yaml").read_text(encoding="utf-8")
    )
    declared = set(_string_constants(ModelAlias).values())
    assert declared == set(raw["aliases"])


def test_provider_name_covers_providers_file(repo_root):
    """providers.yaml 里的每个 provider 都要有对应的常量。"""
    raw = yaml.safe_load(
        (repo_root / "configs" / "providers.yaml").read_text(encoding="utf-8")
    )
    declared = set(_string_constants(ProviderName).values())
    assert set(raw["providers"]) <= declared


def test_routing_only_references_configured_providers(repo_root):
    """路由（含 fallback）里出现的 provider 都必须在 providers.yaml 中配置。"""
    providers = set(
        yaml.safe_load(
            (repo_root / "configs" / "providers.yaml").read_text(encoding="utf-8")
        )["providers"]
    )
    aliases = yaml.safe_load(
        (repo_root / "configs" / "model_routing.yaml").read_text(encoding="utf-8")
    )["aliases"]
    assert aliases
    for name, cfg in aliases.items():
        assert cfg["provider"] in providers, f"{name} 的主 provider 未配置"
        for fallback in cfg.get("fallbacks") or []:
            assert fallback["provider"] in providers, f"{name} 的 fallback 未配置"


@pytest.mark.parametrize("alias", ["plot_planner", "podcaster", "fast_cheap", "judge"])
def test_routing_aliases_have_model_and_temperature(alias, repo_root):
    """每个 alias 都要有 model 和 temperature，避免运行期才发现配置缺字段。"""
    aliases = yaml.safe_load(
        (repo_root / "configs" / "model_routing.yaml").read_text(encoding="utf-8")
    )["aliases"]
    cfg = aliases[alias]
    assert cfg["model"]
    assert isinstance(cfg["temperature"], (int, float))
