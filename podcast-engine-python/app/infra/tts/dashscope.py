import asyncio
import uuid
from pathlib import Path
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.exceptions import ConfigException, TTSFailedException, TTSTimeoutException
from app.core.logging import get_logger
from app.domain.tts.models import AudioResult, TTSInput

logger = get_logger(__name__)


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

    async def synthesize(self, req: TTSInput) -> AudioResult:
        return await self._synthesize_with_retry(req)

    async def _synthesize_with_retry(self, req: TTSInput) -> AudioResult:
        @retry(
            stop=stop_after_attempt(settings.llm_max_retries),
            wait=wait_exponential(min=1, max=8),
            retry=retry_if_exception_type((TTSFailedException, httpx.HTTPError)),
            reraise=True,
        )
        async def _inner() -> AudioResult:
            return await self._synthesize_once(req)

        return await _inner()

    async def _synthesize_once(self, req: TTSInput) -> AudioResult:
        api_key = self._require_api_key()
        base_url = self._require_base_url()
        model = self._require_model()

        url = f"{base_url.rstrip('/')}/services/aigc/multimodal-generation/generation"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": model,
            "input": {"text": req.text},
            "parameters": {"voice": req.voice, "rate": req.rate},
        }

        client = await self._get_client()
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as e:
            raise TTSTimeoutException(
                "DashScope TTS 超时",
                details={"voice": req.voice},
            ) from e

        if resp.status_code != 200:
            raise TTSFailedException(
                f"DashScope TTS 返回 {resp.status_code}",
                details={"body": resp.text[:500]},
            )

        data = resp.json()
        audio_url = self._extract_audio_url(data)
        duration_ms = self._extract_duration_ms(data)

        if not audio_url:
            raise TTSFailedException(
                "DashScope TTS 未返回音频 URL",
                details={"raw": str(data)[:500]},
            )

        audio_bytes = await self._download_audio(audio_url)
        filename = f"{uuid.uuid4().hex}.{req.format}"
        local_path = self._output_dir / filename
        local_path.write_bytes(audio_bytes)

        return AudioResult(
            audioUrl=f"/static/{settings.audio_subdir}/{filename}",
            durationMs=duration_ms or self._estimate_duration_ms(req.text),
            localPath=str(local_path),
            format=req.format,
        )

    def _extract_audio_url(self, data: dict) -> str | None:
        output = data.get("output") or {}
        # DashScope 实际字段以官方文档为准，这里做兼容式提取
        for key in ("audio_url", "audioUrl", "url"):
            if output.get(key):
                return output[key]
        return None

    def _extract_duration_ms(self, data: dict) -> int:
        output = data.get("output") or {}
        for key in ("duration_ms", "durationMs"):
            if output.get(key):
                return int(output[key])
        return 0

    def _estimate_duration_ms(self, text: str) -> int:
        """粗略估算：中文约 4 字/秒。"""
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
