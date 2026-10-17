from app.core.exceptions import LLMProviderNotFoundException
from app.infra.llm.adapters.openai_compat import OpenAICompatAdapter
from app.infra.llm.base import BaseLLMAdapter
from app.infra.llm.config_loader import ProviderConfig


class AdapterRegistry:
    """provider 名 -> 适配器实例。"""

    def __init__(self) -> None:
        self._adapters: dict[str, BaseLLMAdapter] = {}

    def register(self, provider: str, adapter: BaseLLMAdapter) -> None:
        self._adapters[provider] = adapter

    def get(self, provider: str) -> BaseLLMAdapter:
        if provider not in self._adapters:
            raise LLMProviderNotFoundException(
                f"未注册的 LLM provider: {provider}",
                details={"registered": list(self._adapters.keys())},
            )
        return self._adapters[provider]

    def list_providers(self) -> list[str]:
        return list(self._adapters.keys())

    def all(self) -> list[BaseLLMAdapter]:
        """返回所有已注册适配器实例，供停机时统一释放。"""
        return list(self._adapters.values())


def build_registry(providers: dict[str, ProviderConfig]) -> AdapterRegistry:
    """根据 providers.yaml 加载结果构造注册表。

    当前所有 provider 都走 OpenAI 兼容适配器。
    未来若有原生协议 provider，在此按 name 分派到不同适配器。
    """
    registry = AdapterRegistry()
    for name, cfg in providers.items():
        registry.register(
            name,
            OpenAICompatAdapter(
                provider=name,
                base_url=cfg.base_url,
                api_key=cfg.api_key,
                timeout=cfg.timeout,
            ),
        )
    return registry
