import asyncio

from app.core.exceptions import TTSProviderNotFoundException
from app.core.logging import get_logger
from app.domain.tts.models import AudioResult, TTSInput
from app.infra.tts.registry import TTSRegistry, build_default_registry
from app.infra.tts.voice_map import VoiceMap, load_voice_map

logger = get_logger(__name__)


class TTSService:
    """TTS 服务：封装 provider，供上层编排调用。"""

    def __init__(
        self,
        registry: TTSRegistry | None = None,
        provider_name: str = "dashscope",
        voice_map: VoiceMap | None = None,
    ):
        self._registry = registry or build_default_registry()
        self._provider_name = provider_name
        self._voice_map = voice_map or load_voice_map()

    @property
    def provider(self):
        return self._registry.get(self._provider_name)

    def build_input(self, text: str, speaker: str | None = None, **overrides) -> TTSInput:
        """按说话人挑音色，拼出一次合成的输入。

        音色映射见 configs/voices.yaml；overrides 里显式传入的字段优先
        （None 视为"不覆盖"）。
        """
        spec = self._voice_map.resolve(speaker)
        params = {
            "text": text,
            "voice": spec.voice,
            "rate": spec.rate,
            "pitch": spec.pitch,
        }
        params.update({key: value for key, value in overrides.items() if value is not None})
        return TTSInput(**params)

    async def synthesize(self, req: TTSInput) -> AudioResult:
        return await self.provider.synthesize(req)

    async def synthesize_batch(self, inputs: list[TTSInput]) -> list[AudioResult]:
        return await asyncio.gather(*(self.synthesize(i) for i in inputs))

    async def synthesize_many(self, inputs: list[TTSInput]) -> list[AudioResult | None]:
        """并发合成多条；单条失败记 None 并继续，不连累其它片段。"""
        results = await asyncio.gather(
            *(self.synthesize(i) for i in inputs),
            return_exceptions=True,
        )

        failed = 0
        for index, item in enumerate(results):
            if isinstance(item, BaseException):
                logger.error(
                    "tts_synthesize_failed",
                    index=index,
                    text_length=len(inputs[index].text),
                    error=str(item),
                )
                results[index] = None
                failed += 1

        if failed:
            logger.warning("tts_synthesize_partial_failure", failed=failed, total=len(inputs))
        return results

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
