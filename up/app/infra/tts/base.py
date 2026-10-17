from typing import Protocol

from app.domain.tts.models import AudioResult, TTSInput


class TTSProvider(Protocol):
    """TTS 适配器统一接口。

    业务层只依赖本协议，不感知 DashScope、Genie-TTS 等具体实现。
    """

    name: str

    async def synthesize(self, req: TTSInput) -> AudioResult: ...

    async def aclose(self) -> None:
        """释放 provider 持有的连接资源，供停机时调用。"""
        ...
