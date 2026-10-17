from app.core.config import settings
from app.core.exceptions import TTSProviderNotFoundException
from app.infra.tts.base import TTSProvider
from app.infra.tts.dashscope import DashScopeTTSProvider


class TTSRegistry:
    """TTS provider 注册与获取。"""

    def __init__(self) -> None:
        self._providers: dict[str, TTSProvider] = {}

    def register(self, provider: TTSProvider) -> None:
        self._providers[provider.name] = provider

    def get(self, name: str) -> TTSProvider:
        if name not in self._providers:
            raise TTSProviderNotFoundException(
                f"未注册的 TTS provider: {name}",
                details={"registered": list(self._providers.keys())},
            )
        return self._providers[name]

    def list_providers(self) -> list[str]:
        return list(self._providers.keys())

    def all(self) -> list[TTSProvider]:
        """返回所有已注册 provider 实例，供停机时统一释放。"""
        return list(self._providers.values())


def build_default_registry() -> TTSRegistry:
    """默认注册 DashScope TTS。

    未来接入 Genie-TTS 时，在此加一行注册即可。
    """
    registry = TTSRegistry()
    registry.register(
        DashScopeTTSProvider(
            api_key=settings.dashscope_tts_api_key,
            base_url=settings.dashscope_tts_base_url,
            model=settings.dashscope_tts_model,
            output_dir=settings.audio_path,
            timeout=settings.tts_timeout,
        )
    )
    return registry
