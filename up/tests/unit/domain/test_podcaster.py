"""播客主 Agent 行为测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import AgentPersonaBrokenException, LLMOutputInvalidException
from app.domain.agent.models import NarrateInput
from app.domain.agent.podcaster import (
    _BANNED_PATTERNS,
    Podcaster,
    _NarrateDraft,
    _system_prompt,
)

REQUEST = NarrateInput(
    plotEvent="主角在雨夜发现一封旧信",
    podcasterPersona="深夜电台，有磁性、有悬念",
)


@pytest.fixture(autouse=True)
def _clear_prompt_cache():
    """system prompt 有 lru_cache，用例之间要清干净。"""
    _system_prompt.cache_clear()
    yield
    _system_prompt.cache_clear()


def _llm(script: str = "各位听众，雨夜的故事开始了。", emotion="mysterious"):
    llm = MagicMock()
    llm.structured = AsyncMock(
        return_value=_NarrateDraft(script=script, emotion=emotion)
    )
    return llm


@pytest.mark.anyio
async def test_narrate_returns_script_and_emotion():
    result = await Podcaster(llm=_llm()).narrate(REQUEST)
    assert result.script == "各位听众，雨夜的故事开始了。"
    assert result.emotion == "mysterious"


@pytest.mark.anyio
async def test_narrate_builds_messages_and_llm_params():
    llm = _llm()
    await Podcaster(llm=llm).narrate(REQUEST)

    kwargs = llm.structured.call_args.kwargs
    assert kwargs["model_alias"] == "podcaster"
    assert kwargs["schema"] is _NarrateDraft
    assert kwargs["temperature"] == 0.7

    messages = kwargs["messages"]
    assert [m["role"] for m in messages] == ["system", "user"]
    assert messages[0]["content"] == _system_prompt()
    assert REQUEST.plotEvent in messages[1]["content"]
    assert REQUEST.podcasterPersona in messages[1]["content"]
    assert "用户额外指令" not in messages[1]["content"]


@pytest.mark.anyio
async def test_narrate_appends_user_directive():
    llm = _llm()
    request = REQUEST.model_copy(update={"userDirective": "结尾留悬念"})
    await Podcaster(llm=llm).narrate(request)
    assert "结尾留悬念" in llm.structured.call_args.kwargs["messages"][1]["content"]


@pytest.mark.anyio
async def test_custom_model_alias_is_forwarded():
    llm = _llm()
    await Podcaster(llm=llm, model_alias="fast_cheap").narrate(REQUEST)
    assert llm.structured.call_args.kwargs["model_alias"] == "fast_cheap"


@pytest.mark.anyio
async def test_llm_failure_becomes_output_invalid():
    llm = MagicMock()
    llm.structured = AsyncMock(side_effect=RuntimeError("boom"))
    with pytest.raises(LLMOutputInvalidException) as info:
        await Podcaster(llm=llm).narrate(REQUEST)
    assert info.value.details["model_alias"] == "podcaster"
    assert "boom" in info.value.details["error"]
    assert isinstance(info.value.__cause__, RuntimeError)


@pytest.mark.parametrize("token", _BANNED_PATTERNS)
@pytest.mark.anyio
async def test_persona_guard_blocks_banned_patterns(token):
    """LLM 输出里出现第一人称句子时直接判为人设崩坏。"""
    script = f"开场白。{token}，然后故事开始了。"
    with pytest.raises(AgentPersonaBrokenException) as info:
        await Podcaster(llm=_llm(script=script)).narrate(REQUEST)
    assert info.value.details["matched_token"] == token


@pytest.mark.anyio
async def test_persona_guard_allows_third_person_script():
    script = "各位听众，主角推开门，走进了那间屋子。"
    result = await Podcaster(llm=_llm(script=script)).narrate(REQUEST)
    assert result.script == script


def test_system_prompt_is_cached():
    assert _system_prompt() is _system_prompt()
    assert _system_prompt.cache_info().currsize == 1
