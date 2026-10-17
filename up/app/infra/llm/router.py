from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.core.config import settings
from app.core.exceptions import ConfigException, ModelAliasNotFoundException
from app.infra.llm.base import BaseLLMAdapter
from app.infra.llm.registry import AdapterRegistry


@dataclass(frozen=True)
class FallbackTarget:
    provider: str
    model: str


@dataclass(frozen=True)
class AliasConfig:
    provider: str
    model: str
    temperature: float = 0.7
    fallbacks: list[FallbackTarget] = field(default_factory=list)


@dataclass(frozen=True)
class RouteTarget:
    adapter: BaseLLMAdapter
    model: str
    temperature: float


class LLMRouter:
    """model_alias → adapter + model + temperature。"""

    def __init__(
        self,
        registry: AdapterRegistry,
        routing_file: Path | None = None,
    ):
        self._registry = registry
        file = routing_file or settings.model_routing_path
        if not file.exists():
            raise ConfigException(f"模型路由配置文件不存在: {file}")

        raw = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
        aliases_raw = raw.get("aliases") or {}
        if not aliases_raw:
            raise ConfigException("model_routing.yaml 中未定义任何 alias")

        self._aliases: dict[str, AliasConfig] = {}
        for name, cfg in aliases_raw.items():
            fallbacks = [
                FallbackTarget(provider=fb["provider"], model=fb["model"])
                for fb in cfg.get("fallbacks") or []
            ]
            self._aliases[name] = AliasConfig(
                provider=cfg["provider"],
                model=cfg["model"],
                temperature=float(cfg.get("temperature", 0.7)),
                fallbacks=fallbacks,
            )

    def resolve(self, model_alias: str) -> RouteTarget:
        if model_alias not in self._aliases:
            raise ModelAliasNotFoundException(
                f"未定义的 model_alias: {model_alias}",
                details={"available": list(self._aliases.keys())},
            )
        cfg = self._aliases[model_alias]
        return RouteTarget(
            adapter=self._registry.get(cfg.provider),
            model=cfg.model,
            temperature=cfg.temperature,
        )

    def resolve_fallbacks(self, model_alias: str) -> list[RouteTarget]:
        cfg = self._aliases.get(model_alias)
        if not cfg:
            return []
        targets: list[RouteTarget] = []
        for fb in cfg.fallbacks:
            try:
                adapter = self._registry.get(fb.provider)
            except Exception:
                continue
            targets.append(
                RouteTarget(
                    adapter=adapter,
                    model=fb.model,
                    temperature=cfg.temperature,
                )
            )
        return targets

    def list_aliases(self) -> list[str]:
        return list(self._aliases.keys())