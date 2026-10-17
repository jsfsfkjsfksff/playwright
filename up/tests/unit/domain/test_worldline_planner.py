"""世界线规划器（图约束 + 硬校验 + 状态空间 DP）行为测试。"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.worldline.constraints import build_constraints
from app.domain.worldline.models import InterpolateRequest, MandatoryNodeInput, PropertyInput
from app.domain.worldline.planner import WorldlinePlanner, _build_prompt, _build_waypoints
from app.infra.llm.base import LLMResult

REQUEST = InterpolateRequest(
    startText="夏日祭的夜晚，你在神社后山迷路了。",
    endText="少女的长剑架在了你的脖子上。",
    outline="男主试图搭讪，但说错了话激怒了对方",
    layers=1,
    maxActions=2,
)


def _node(**overrides) -> dict:
    node = {
        "action": "搭讪",
        "closingAction": "揭晓结局",
        "speaker": "旁白",
        "text": "你鼓起勇气开口，风铃声打断了下文。",
        "qualityScore": 8.0,
        "tension": 5,
        "preconditions": {"locations": {}, "holds": {}, "flags": {}},
        "structuredActions": [],
    }
    node.update(overrides)
    return node


def _payload(segments: list[dict], mandatory_states: dict | None = None) -> str:
    return json.dumps(
        {
            "targetPreconditions": {},
            "mandatoryNodeStates": mandatory_states or {},
            "segments": segments,
        },
        ensure_ascii=False,
    )


def _llm(content: str) -> MagicMock:
    llm = MagicMock()
    llm.chat = AsyncMock(
        return_value=LLMResult(content=content, model="qwen3.8-flash", provider="aliyun_maas")
    )
    return llm


HTN_JSON = _payload([{"from": "START", "to": "END", "layers": [[_node()]]}])

MANDATORY_REQUEST = InterpolateRequest(
    startText="夏日祭的夜晚，你在神社后山迷路了。",
    endText="少女的长剑架在了你的脖子上。",
    outline="先闯进禁地，再与她摊牌",
    layers=1,
    maxActions=1,
    mandatoryNodes=[
        MandatoryNodeInput(
            sceneId="KEY_1",
            text="血月升起，石门缓缓打开。",
            speaker="旁白",
            goal="进入禁地",
        )
    ],
)

MANDATORY_JSON = _payload(
    segments=[
        {
            "from": "START",
            "to": "KEY_1",
            "layers": [[_node(action="探查石阶", text="石阶上落着新鲜的尘土。")]],
        },
        {
            "from": "KEY_1",
            "to": "END",
            "layers": [[_node(action="握紧刀柄", text="她缓缓抬起眼。")]],
        },
    ],
    mandatory_states={
        "KEY_1": {
            "entryAction": "推开石门",
            "preconditions": {"locations": {}, "holds": {}, "flags": {}},
            "structuredActions": [],
            "tension": 6,
        }
    },
)

GUARD_REQUEST = InterpolateRequest(
    startText="夏日祭的夜晚，你在神社后山迷路了。",
    endText="少女的长剑架在了你的脖子上。",
    outline="她把蛋糕递了出去",
    layers=1,
    maxActions=1,
    properties=[PropertyInput(type="ITEM", name="特制草莓小蛋糕")],
)

ILLEGAL_ACTION_JSON = _payload(
    [
        {
            "from": "START",
            "to": "END",
            "layers": [
                [
                    _node(
                        structuredActions=[
                            {
                                "actionType": "TRANSFER_ITEM",
                                "actor": "主角",
                                "target": "miku",
                                "itemId": "特制草莓小蛋糕",
                            }
                        ]
                    )
                ]
            ],
        }
    ]
)


def test_prompt_carries_all_inputs():
    prompt = _build_prompt(REQUEST, build_constraints([], []), _build_waypoints(REQUEST))

    assert REQUEST.startText in prompt
    assert REQUEST.endText in prompt
    assert REQUEST.outline in prompt
    assert "START → END" in prompt
    assert "每段 1 层，每层 2 个分支" in prompt


@pytest.mark.anyio
async def test_plan_returns_trellis_graph_and_forwards_params():
    llm = _llm(HTN_JSON)
    graph = await WorldlinePlanner(llm=llm).plan(REQUEST)

    assert len(graph.nodes) == 1
    node = graph.nodes[0]
    assert node.sceneId.startswith("SCENE_S1_L1_1_")
    assert node.speaker == "旁白"
    assert node.isMandatory is False
    assert {(e.fromSceneId, e.toSceneId) for e in graph.edges} == {
        ("START", node.sceneId),
        (node.sceneId, "END"),
    }

    kwargs = llm.chat.call_args.kwargs
    assert kwargs["model_alias"] == "worldline"
    assert kwargs["temperature"] == 0.6
    assert kwargs["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in kwargs["messages"]] == ["system", "user"]


@pytest.mark.anyio
async def test_plan_strips_markdown_fence():
    llm = _llm(f"```json\n{HTN_JSON}\n```")
    graph = await WorldlinePlanner(llm=llm).plan(REQUEST)
    assert len(graph.edges) == 2


@pytest.mark.anyio
async def test_mandatory_node_is_reused_and_marked():
    graph = await WorldlinePlanner(llm=_llm(MANDATORY_JSON)).plan(MANDATORY_REQUEST)

    mandatory = [n for n in graph.nodes if n.sceneId == "KEY_1"]
    assert len(mandatory) == 1
    assert mandatory[0].isMandatory is True
    assert mandatory[0].text == "血月升起，石门缓缓打开。"

    generated = [n.sceneId for n in graph.nodes if n.sceneId.startswith("SCENE_")]
    assert len(generated) == 2
    assert {(e.fromSceneId, e.toSceneId) for e in graph.edges} == {
        ("START", generated[0]),
        (generated[0], "KEY_1"),
        ("KEY_1", generated[1]),
        (generated[1], "END"),
    }


@pytest.mark.anyio
async def test_strict_dead_end_degrades_to_soft_mode():
    llm = _llm(ILLEGAL_ACTION_JSON)
    graph = await WorldlinePlanner(llm=llm).plan(GUARD_REQUEST)

    assert llm.chat.await_count == 1  # 降级重算只发生在 DP 层，不再多打一次模型
    assert len(graph.nodes) == 1
    assert len(graph.edges) == 2  # 软约束下仍能给出可用连线


@pytest.mark.anyio
async def test_plan_degrades_to_fallback_graph_on_llm_failure():
    llm = MagicMock()
    llm.chat = AsyncMock(side_effect=RuntimeError("boom"))
    graph = await WorldlinePlanner(llm=llm).plan(REQUEST)

    assert len(graph.nodes) == 1
    assert graph.nodes[0].sceneId.startswith("SCENE_ERR_")
    assert [e.fromSceneId for e in graph.edges] == ["START", graph.nodes[0].sceneId]
    assert graph.edges[1].toSceneId == "END"


@pytest.mark.anyio
async def test_custom_model_alias_is_forwarded():
    llm = _llm(HTN_JSON)
    await WorldlinePlanner(llm=llm, model_alias="fast_cheap").plan(REQUEST)
    assert llm.chat.call_args.kwargs["model_alias"] == "fast_cheap"