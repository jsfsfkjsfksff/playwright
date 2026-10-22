import os
from dataclasses import dataclass
from pathlib import Path

import yaml

from app.core.config import settings
from app.core.exceptions import ConfigException


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    api_key: str
    timeout: float


def load_providers(path: Path | None = None) -> dict[str, ProviderConfig]:
    """从 providers.yaml 读取 provider 连接信息。

    api_key 只从环境变量读，不进 YAML。
    缺少 key 的 provider 会被跳过，允许只配置部分 provider。
    """
    file = path or settings.providers_path
    if not file.exists():
        raise ConfigException(f"providers 配置文件不存在: {file}")

    raw = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
    providers_raw = raw.get("providers") or {}

    result: dict[str, ProviderConfig] = {}
    for name, cfg in providers_raw.items():
        if not isinstance(cfg, dict):
            raise ConfigException(f"provider 配置格式错误: {name}")

        base_url = cfg.get("base_url")
        if not base_url:
            raise ConfigException(f"provider 缺少 base_url: {name}")

        env_name = cfg.get("api_key_env")
        api_key = os.getenv(env_name) if env_name else None
        if not api_key and env_name:
            # .env 只会被 pydantic 读进 Settings，**不会写进 os.environ**。
            # 因此环境变量里没有时，回落到 Settings 的同名小写字段
            # （例如 ALIYUN_MAAS_API_KEY -> settings.aliyun_maas_api_key），
            # 这样只靠 .env 就能启动，不必在终端里再 export 一遍。
            api_key = getattr(settings, env_name.lower(), None) or None
        if not api_key:
            # 缺 key 直接跳过，不阻塞其它 provider
            continue

        result[name] = ProviderConfig(
            name=name,
            base_url=base_url,
            api_key=api_key,
            timeout=float(cfg.get("timeout", settings.llm_timeout)),
        )

    if not result:
        raise ConfigException("没有任何可用的 LLM provider，请检查 .env 中的密钥")

    return result