import asyncio
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.exceptions import ConfigException, TTSFailedException, TTSTimeoutException
from app.core.logging import get_logger
from app.domain.tts.models import AudioResult, TTSInput

logger = get_logger(__name__)

# 契约：Python 只回相对路径（如 static/audio/x.mp3），对外 URL 由 Java 拼。
_STATIC_URL_PREFIX = "static"
# 认得出来的音频容器，用于把落盘文件的后缀写对
_KNOWN_FORMATS = {"mp3", "wav", "pcm", "ogg", "m4a", "aac", "flac"}


def _is_retryable(exc: BaseException) -> bool:
    """是否值得重试。

    4xx（429 限流除外）说明请求本身有问题——音色名不存在、模型名不对、鉴权失败、
    参数越界——重试只会白花钱，还拖慢排查。
    """
    if isinstance(exc, httpx.HTTPError):
        return True
    if isinstance(exc, TTSFailedException):
        status = exc.details.get("status")
        return not (isinstance(status, int) and 400 <= status < 500 and status != 429)
    return False


class DashScopeTTSProvider:
    """千问原生 TTS。

    与 LLM 走 OpenAI 兼容模式不同，TTS 走 DashScope 原生接口。
    """

    name = "dashscope"

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        output_dir: Path | None = None,
        timeout: float | None = None,
    ):
        self._api_key = api_key
        self._base_url = base_url
        self._model = model
        self._timeout = timeout or settings.tts_timeout
        self._output_dir = output_dir or settings.audio_path
        self._output_dir.mkdir(parents=True, exist_ok=True)
        # 共享连接池：延迟到首次请求时创建，避免在无事件循环的时机构造
        self._client: httpx.AsyncClient | None = None
        self._client_lock = asyncio.Lock()

    async def aclose(self) -> None:
        """关闭共享连接池。"""
        client, self._client = self._client, None
        if client is not None:
            await client.aclose()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            async with self._client_lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    def _require_api_key(self) -> str:
        key = self._api_key
        if not key:
            raise ConfigException(
                "DashScope TTS API Key 未配置",
                details={"env": "DASHSCOPE_TTS_API_KEY"},
            )
        return key

    def _require_base_url(self) -> str:
        url = self._base_url
        if not url:
            raise ConfigException("DashScope TTS base_url 未配置")
        return url

    def _require_model(self) -> str:
        model = self._model
        if not model:
            raise ConfigException("DashScope TTS model 未配置")
        return model

    def _media_url(self, filename: str) -> str:
        """返回相对媒体路径（契约要求，绝对 URL 交给 Java 的 MediaUrlResolver）。"""
        return f"{_STATIC_URL_PREFIX}/{settings.audio_subdir}/{filename}"

    @staticmethod
    def _detect_format(audio_url: str, content: bytes, fallback: str) -> str:
        """确定音频容器：先看字节魔数，再看下载地址后缀，最后用请求里的 format。

        请求里的 format 只是"想要什么格式"，服务端不一定照做；
        后缀写错会让播放器和拼接逻辑都判断失误。
        """
        if content[:3] == b"ID3" or content[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
            return "mp3"
        if content[:4] == b"RIFF" and content[8:12] == b"WAVE":
            return "wav"

        suffix = Path(urlparse(audio_url).path).suffix.lstrip(".").lower()
        if suffix in _KNOWN_FORMATS:
            return suffix
        return fallback

    async def synthesize(self, req: TTSInput) -> AudioResult:
        return await self._synthesize_with_retry(req)

    async def _synthesize_with_retry(self, req: TTSInput) -> AudioResult:
        @retry(
            stop=stop_after_attempt(settings.llm_max_retries),
            wait=wait_exponential(min=1, max=8),
            retry=retry_if_exception(_is_retryable),
            reraise=True,
        )
        async def _inner() -> AudioResult:
            return await self._synthesize_once(req)

        return await _inner()

    async def _synthesize_once(self, req: TTSInput) -> AudioResult:
        api_key = self._require_api_key()
        base_url = self._require_base_url()
        model = self._require_model()

        url = f"{base_url.rstrip('/')}/services/audio/tts/SpeechSynthesizer"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        # 音色 / 语速 / 音调 / 格式都放在 input 里（不是 parameters）——见 Qwen-Audio-TTS 文档
        tts_input: dict[str, Any] = {
            "text": req.text,
            "voice": req.voice,
            "format": req.format,
            "rate": req.rate,
            "pitch": req.pitch,
        }
        if req.instruction:
            tts_input["instruction"] = req.instruction
        payload: dict[str, Any] = {"model": model, "input": tts_input}

        client = await self._get_client()
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as e:
            raise TTSTimeoutException(
                "DashScope TTS 超时",
                details={"voice": req.voice},
            ) from e

        if resp.status_code != 200:
            details = {"status": resp.status_code, "body": resp.text[:500]}
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                raise TTSFailedException(
                    f"Qwen-Audio-TTS 拒绝本次请求（{resp.status_code}），"
                    "请检查音色名、模型名与 API Key",
                    details=details,
                )
            raise TTSFailedException(
                f"Qwen-Audio-TTS 返回 {resp.status_code}",
                details=details,
            )

        data = resp.json()
        audio_url = self._extract_audio_url(data)

        if not audio_url:
            raise TTSFailedException(
                "Qwen-Audio-TTS 未返回音频 URL",
                details={"raw": str(data)[:500]},
            )

        audio_bytes = await self._download_audio(audio_url)
        audio_format = self._detect_format(audio_url, audio_bytes, req.format)
        filename = f"{uuid.uuid4().hex}.{audio_format}"
        local_path = self._output_dir / filename
        local_path.write_bytes(audio_bytes)

        return AudioResult(
            audioUrl=self._media_url(filename),
            durationMs=self._estimate_duration_ms(req.text),
            localPath=str(local_path),
            format=audio_format,
        )

    def _extract_audio_url(self, data: dict) -> str | None:
        """非流式响应的音频在 output.audio.url。

        该 URL 只有 24 小时有效期 —— 必须立刻下载落盘，绝不能把它直接存进业务表。
        """
        output = data.get("output") or {}
        audio = output.get("audio") or {}
        url = audio.get("url")
        return url or None

    def _estimate_duration_ms(self, text: str) -> int:
        """官方非流式响应不返回音频时长，这里按中文约 4 字/秒粗略估算。

        精确时长由播放端以 audio.currentTime / loadedmetadata 为准（契约要求）。
        """
        return max(1, len(text)) * 250

    async def _download_audio(self, audio_url: str) -> bytes:
        client = await self._get_client()
        try:
            resp = await client.get(audio_url)
        except httpx.TimeoutException as e:
            raise TTSTimeoutException("下载音频超时") from e

        if resp.status_code != 200:
            raise TTSFailedException(
                f"下载音频失败: {resp.status_code}",
                details={"audioUrl": audio_url},
            )
        return resp.content
