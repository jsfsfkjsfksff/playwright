import asyncio

from app.core.exceptions import TTSProviderNotFoundException
from app.core.logging import get_logger
from app.domain.tts.models import AudioResult, TTSInput
from app.infra.tts.registry import TTSRegistry, build_default_registry

logger = get_logger(__name__)


class TTSService:
    """TTS 服务：封装 provider，供上层编排调用。"""

    def __init__(
        self,
        registry: TTSRegistry | None = None,
        provider_name: str = "dashscope",
    ):
        self._registry = registry or build_default_registry()
        self._provider_name = provider_name

    @property
    def provider(self):
        return self._registry.get(self._provider_name)

    async def synthesize(self, req: TTSInput) -> AudioResult:
        return await self.provider.synthesize(req)

    async def synthesize_batch(self, inputs: list[TTSInput]) -> list[AudioResult]:
        return await asyncio.gather(*(self.synthesize(i) for i in inputs))

    def use_provider(self, name: str) -> None:
        # 提前校验 provider 存在
        self._registry.get(name)
        self._provider_name = name

    async def aclose(self) -> None:
        """释放所有 provider 的连接资源；单个失败不影响其它 provider。"""
        for provider in self._registry.all():
            try:
                await provider.aclose()
            except Exception as e:
                logger.error(
                    "tts_provider_close_failed",
                    provider=getattr(provider, "name", "unknown"),
                    error=str(e),
                    exc_info=True,
                )
