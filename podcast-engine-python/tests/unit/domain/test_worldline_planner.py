"""世界线规划器行为测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.worldline.models import InterpolateRequest
from app.domain.worldline.planner import WorldlinePlanner, _build_prompt
from app.infra.llm.base import LLMResult

REQUEST = InterpolateRequest(
    startText="夏日祭的夜晚，你在神社后山迷路了。",
    endText="少女的长剑架在了你的脖子上。",
    outline="男主试图搭讪，但说错了话激怒了对方",
    layers=2,
)

WORLDLINE_JSON = (
    '[{"action": "搭讪", "text": "你鼓起勇气开口。", "speaker": "旁白", "audioUrl": ""},'
    ' {"action": "说错话", "text": "少女的眼神冷了下来。", "speaker": "少女", "audioUrl": ""}]'
)


def _llm(content: str = WORLDLINE_JSON):
    llm = MagicMock()
    llm.chat = AsyncMock(
        return_value=LLMResult(content=content, model="qwen3.8-flash", provider="aliyun_maas")
    )
    return llm


def test_prompt_carries_all_inputs():
    prompt = _build_prompt(REQUEST)
    assert REQUEST.startText in prompt
    assert REQUEST.endText in prompt
    assert REQUEST.outline in prompt
    assert f"{REQUEST.layers}层" in prompt


@pytest.mark.anyio
async def test_plan_returns_nodes_and_forwards_params():
    llm = _llm()
    worldline = await WorldlinePlanner(llm=llm).plan(REQUEST)

    assert [n.action for n in worldline] == ["搭讪", "说错话"]
    assert worldline[1].speaker == "少女"

    kwargs = llm.chat.call_args.kwargs
    assert kwargs["model_alias"] == "worldline"
    assert kwargs["temperature"] == 0.7
    assert [m["role"] for m in kwargs["messages"]] == ["system", "user"]


@pytest.mark.anyio
async def test_plan_strips_markdown_fence():
    llm = _llm(content=f"```json\n{WORLDLINE_JSON}\n```")
    worldline = await WorldlinePlanner(llm=llm).plan(REQUEST)
    assert len(worldline) == 2


@pytest.mark.anyio
async def test_plan_fills_missing_fields_with_defaults():
    llm = _llm(content='[{"text": "只有台词"}]')
    worldline = await WorldlinePlanner(llm=llm).plan(REQUEST)
    assert worldline[0].action == "继续"
    assert worldline[0].speaker == "旁白"
    assert worldline[0].audioUrl == ""


@pytest.mark.anyio
async def test_plan_degrades_on_llm_failure():
    llm = MagicMock()
    llm.chat = AsyncMock(side_effect=RuntimeError("boom"))
    worldline = await WorldlinePlanner(llm=llm).plan(REQUEST)

    assert len(worldline) == 1
    assert worldline[0].action == "系统错误"
    assert worldline[0].speaker == "System"


@pytest.mark.anyio
async def test_custom_model_alias_is_forwarded():
    llm = _llm()
    await WorldlinePlanner(llm=llm, model_alias="fast_cheap").plan(REQUEST)
    assert llm.chat.call_args.kwargs["model_alias"] == "fast_cheap"