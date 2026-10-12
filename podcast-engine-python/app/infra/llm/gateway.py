from pydantic import BaseModel

from app.core.exceptions import LLMOutputInvalidException
from app.core.logging import get_logger
from app.infra.llm.base import LLMResult
from app.infra.llm.config_loader import load_providers
from app.infra.llm.registry import AdapterRegistry, build_registry
from app.infra.llm.router import LLMRouter, RouteTarget

logger = get_logger(__name__)


class LLMGateway:
    """业务层唯一入口。"""

    def __init__(self, router: LLMRouter, registry: AdapterRegistry):
        self._router = router
        self._registry = registry

    async def aclose(self) -> None:
        """释放所有适配器的连接资源；单个失败不影响其它适配器。"""
        for adapter in self._registry.all():
            try:
                await adapter.aclose()
            except Exception as e:
                logger.error(
                    "llm_adapter_close_failed",
                    provider=adapter.provider,
                    error=str(e),
                    exc_info=True,
                )

    async def chat(
        self,
        *,
        model_alias: str,
        messages: list[dict],
        temperature: float | None = None,
        **kwargs,
    ) -> LLMResult:
        targets = self._collect_targets(model_alias)
        return await self._try_chat(targets, messages, temperature, **kwargs)

    async def structured(
        self,
        *,
        model_alias: str,
        messages: list[dict],
        schema: type[BaseModel],
        temperature: float | None = None,
    ) -> BaseModel:
        targets = self._collect_targets(model_alias)
        last_error: Exception | None = None

        for target in targets:
            try:
                return await target.adapter.structured(
                    model=target.model,
                    messages=messages,
                    schema=schema,
                    temperature=(
                        temperature if temperature is not None else target.temperature
                    ),
                )
            except Exception as e:
                last_error = e
                logger.warning(
                    "structured_failed",
                    provider=target.adapter.provider,
                    model=target.model,
                    error=str(e),
                )

        raise LLMOutputInvalidException(
            f"所有模型均失败: {model_alias}",
            details={"error": str(last_error)},
        )

    def _collect_targets(self, model_alias: str) -> list[RouteTarget]:
        primary = self._router.resolve(model_alias)
        fallbacks = self._router.resolve_fallbacks(model_alias)
        return [primary, *fallbacks]

    async def _try_chat(
        self,
        targets: list[RouteTarget],
        messages: list[dict],
        temperature: float | None,
        **kwargs,
    ) -> LLMResult:
        last_error: Exception | None = None
        for target in targets:
            try:
                return await target.adapter.chat(
                    model=target.model,
                    messages=messages,
                    temperature=(
                        temperature if temperature is not None else target.temperature
                    ),
                    **kwargs,
                )
            except Exception as e:
                last_error = e
                logger.warning(
                    "chat_failed",
                    provider=target.adapter.provider,
                    model=target.model,
                    error=str(e),
                )
        raise LLMOutputInvalidException(
            "所有模型均失败",
            details={"error": str(last_error)},
        )


def build_gateway() -> LLMGateway:
    """工厂：构造 LLMGateway。"""
    providers = load_providers()
    registry = build_registry(providers)
    router = LLMRouter(registry)
    return LLMGateway(router, registry)
