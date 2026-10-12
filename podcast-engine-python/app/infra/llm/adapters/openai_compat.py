from typing import Any

from openai import AsyncOpenAI
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.exceptions import LLMTimeoutException, LLMOutputInvalidException
from app.infra.llm.base import BaseLLMAdapter, LLMResult


class OpenAICompatAdapter(BaseLLMAdapter):
    def __init__(
        self,
        provider: str,
        base_url: str,
        api_key: str,
        timeout: float = 60.0,
        max_retries: int | None = None,
    ):
        self.provider = provider
        self._timeout = timeout
        self._max_retries = max_retries or settings.llm_max_retries
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )

    async def chat(
        self,
        *,
        model: str,
        messages: list[dict],
        temperature: float = 0.7,
        response_format: dict | None = None,
        **kwargs: Any,
    ) -> LLMResult:
        return await self._chat_with_retry(
            model=model,
            messages=messages,
            temperature=temperature,
            response_format=response_format,
            **kwargs,
        )

    async def aclose(self) -> None:
        """关闭底层 AsyncOpenAI 的连接池。"""
        try:
            await self._client.close()
        except Exception:
            pass

    async def _chat_with_retry(self, **kwargs: Any) -> LLMResult:
        @retry(
            stop=stop_after_attempt(self._max_retries),
            wait=wait_exponential(min=1, max=8),
            retry=retry_if_exception_type(Exception),
            reraise=True,
        )
        async def _inner() -> LLMResult:
            return await self._chat_once(**kwargs)

        return await _inner()

    async def _chat_once(
        self,
        *,
        model: str,
        messages: list[dict],
        temperature: float,
        response_format: dict | None,
        **kwargs: Any,
    ) -> LLMResult:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if response_format is not None:
            payload["response_format"] = response_format
        payload.update(kwargs)

        try:
            resp = await self._client.chat.completions.create(**payload)
        except Exception as e:
            if "timeout" in str(e).lower():
                raise LLMTimeoutException(
                    f"{self.provider} 超时",
                    details={"model": model, "error": str(e)},
                ) from e
            raise

        if not resp.choices:
            raise LLMOutputInvalidException(
                "模型返回空 choices",
                details={"model": model},
            )

        choice = resp.choices[0]
        content = choice.message.content or ""
        if not content:
            raise LLMOutputInvalidException(
                "模型返回内容为空",
                details={"model": model},
            )

        return LLMResult(
            content=content,
            model=resp.model,
            provider=self.provider,
            usage=resp.usage.model_dump() if resp.usage else None,
        )