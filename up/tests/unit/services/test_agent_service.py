"""Agent 服务测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import LLMOutputInvalidException
from app.domain.agent.models import NarrateInput
from app.domain.agent.podcaster import _NarrateDraft
from app.services.agent_service import AgentService

REQUEST = NarrateInput(plotEvent="主角在雨夜发现旧信", podcasterPersona="深夜电台")


def _llm(script: str = "各位听众", emotion: str | None = "calm"):
    llm = MagicMock()
    llm.structured = AsyncMock(
        return_value=_NarrateDraft(script=script, emotion=emotion)
    )
    return llm


@pytest.mark.anyio
async def test_narrate_returns_result_and_uses_default_alias():
    llm = _llm()
    result = await AgentService(llm=llm).narrate(REQUEST)

    assert result.script == "各位听众"
    assert result.emotion == "calm"
    assert llm.structured.call_args.kwargs["model_alias"] == "podcaster"


@pytest.mark.anyio
async def test_custom_model_alias_is_forwarded():
    llm = _llm()
    await AgentService(llm=llm, model_alias="fast_cheap").narrate(REQUEST)
    assert llm.structured.call_args.kwargs["model_alias"] == "fast_cheap"


@pytest.mark.anyio
async def test_llm_failure_is_wrapped():
    llm = MagicMock()
    llm.structured = AsyncMock(side_effect=RuntimeError("boom"))

    with pytest.raises(LLMOutputInvalidException):
        await AgentService(llm=llm).narrate(REQUEST)
