from functools import lru_cache
from typing import Protocol

from pydantic import BaseModel

from app.core.constants import ModelAlias
from app.core.exceptions import AgentPersonaBrokenException, LLMOutputInvalidException
from app.core.logging import get_logger
from app.domain.agent.models import NarrateInput, NarrateResult
from app.domain.agent.prompt import load_podcaster_system_prompt

logger = get_logger(__name__)


class LLMClientProtocol(Protocol):
    """domain 只认这个协议，不认 openai SDK。"""

    async def structured(
        self,
        *,
        model_alias: str,
        messages: list[dict],
        schema: type[BaseModel],
        temperature: float | None = None,
    ) -> BaseModel: ...


# LLM 期望输出的中间结构，与对外 NarrateResult 解耦
class _NarrateDraft(BaseModel):
    script: str
    emotion: str | None = None


# 禁止出现的“主角第一人称”模式
_BANNED_PATTERNS = (
    "我推开门",
    "我走进",
    "我拿起",
    "我看到了自己",
    "我听见自己",
    "我抬起头",
    "我低下头",
)


@lru_cache(maxsize=1)
def _system_prompt() -> str:
    return load_podcaster_system_prompt()


class Podcaster:
    """播客主：把逻辑事件翻译为电台口吻文稿。"""

    def __init__(
        self,
        llm: LLMClientProtocol,
        model_alias: str = ModelAlias.PODCASTER,
    ):
        self._llm = llm
        self._model_alias = model_alias

    async def narrate(self, req: NarrateInput) -> NarrateResult:
        messages = self._build_messages(req)

        try:
            draft: _NarrateDraft = await self._llm.structured(
                model_alias=self._model_alias,
                messages=messages,
                schema=_NarrateDraft,
                temperature=0.7,
            )
        except Exception as e:
            logger.warning("podcaster_llm_failed", error=str(e))
            raise LLMOutputInvalidException(
                "播客文稿生成失败",
                details={"model_alias": self._model_alias, "error": str(e)},
            ) from e

        self._guard_persona(draft.script)

        return NarrateResult(script=draft.script, emotion=draft.emotion)

    def _build_messages(self, req: NarrateInput) -> list[dict]:
        user_lines = [
            f"逻辑事件：{req.plotEvent}",
            f"播客主人设：{req.podcasterPersona}",
        ]
        if req.userDirective:
            user_lines.append(f"用户额外指令：{req.userDirective}")

        return [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": "\n".join(user_lines)},
        ]

    def _guard_persona(self, script: str) -> None:
        """硬性检查 Agent 是否偏离播客主身份。"""
        for token in _BANNED_PATTERNS:
            if token in script:
                logger.warning("agent_persona_broken", token=token, script=script[:120])
                raise AgentPersonaBrokenException(
                    "Agent 输出偏离播客主身份",
                    details={"matched_token": token},
                )