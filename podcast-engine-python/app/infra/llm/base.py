from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel

from app.core.exceptions import LLMOutputInvalidException


class LLMResult(BaseModel):
    """适配器统一返回结构。"""

    content: str
    model: str
    provider: str
    usage: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None


class BaseLLMAdapter(ABC):
    """所有 LLM 适配器的统一接口。

    业务层只依赖 LLMGateway，不直接依赖本类。
    """

    provider: str

    @abstractmethod
    async def chat(
        self,
        *,
        model: str,
        messages: list[dict],
        temperature: float = 0.7,
        response_format: dict | None = None,
        **kwargs: Any,
    ) -> LLMResult:
        """普通对话，返回文本。"""

    async def structured(
        self,
        *,
        model: str,
        messages: list[dict],
        schema: type[BaseModel],
        temperature: float = 0.2,
    ) -> BaseModel:
        """结构化输出。

        默认三级降级：
        1. json_schema
        2. json_object
        3. 纯 prompt + Pydantic 校验
        子类可覆盖以使用更优方式。
        """
        last_error: Exception | None = None

        # 一级：json_schema
        try:
            result = await self.chat(
                model=model,
                messages=messages,
                temperature=temperature,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema.__name__,
                        "schema": schema.model_json_schema(),
                    },
                },
            )
            return schema.model_validate_json(result.content)
        except Exception as e:
            last_error = e

        # 二级：json_object
        try:
            result = await self.chat(
                model=model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            return schema.model_validate_json(result.content)
        except Exception as e:
            last_error = e

        # 三级：纯 prompt
        try:
            result = await self.chat(
                model=model,
                messages=messages,
                temperature=temperature,
            )
            return schema.model_validate_json(result.content)
        except Exception as e:
            last_error = e

        raise LLMOutputInvalidException(
            "结构化输出解析失败",
            details={"schema": schema.__name__, "error": str(last_error)},
        )

    async def aclose(self) -> None:
        """释放适配器持有的连接资源，供停机时调用。默认无资源可释放。"""
        return None
