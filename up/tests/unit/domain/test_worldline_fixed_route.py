"""第六代：用户固定剧情与 AI 剧情融合的行为测试。"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.worldline.constraints import build_constraints
from app.domain.worldline.fixed_route import (
    USER_FIXED_MARKER,
    identify_fixed_segments,
    is_user_fixed,
)
from app.domain.worldline.models import (
    InterpolateRequest,
    MandatoryNodeInput,
    TransitionInput,
)
from app.domain.worldline.planner import _assemble_layers, _build_waypoints, WorldlinePlanner
from app.domain.worldline.trellis import solve_story_trellis
from app.domain.worldline.validator import validate_node
from app.infra.llm.base import LLMResult

KEY = "储物柜钥匙"


def _ai_node(action: str = "继续", text: str = "……") -> dict:
    return {
        "action": action,
        "closingAction": "揭晓结局",
        "speaker": "旁白",
        "text": text,
        "qualityScore": 8.0,
        "tension": 5,
        "preconditions": {},
        "structuredActions": [],
    }


def _request(transitions: list[TransitionInput]) -> InterpolateRequest:
    return InterpolateRequest(
        startText="夏日祭的夜晚，你在神社后山迷路了。",
        endText="少女的长剑架在了你的脖子上。",
        outline="先闯入禁地，再与她摊牌",
        layers=1,
        maxActions=1,
        mandatoryNodes=[
            MandatoryNodeInput(sceneId="SCENE_1", text="血月升起，石门缓缓打开。"),
            MandatoryNodeInput(sceneId="SCENE_2", text="她站在石阶尽头。"),
        ],
        transitions=transitions,
    )


# ---------------------------------------------------------------
# ② 识别固定剧情
# ---------------------------------------------------------------


def test_identify_fixed_segments_splits_main_and_optional():
    req = _request(
        [
            TransitionInput(
                fromSceneId="START",
                toSceneId="SCENE_1",
                action=f"{USER_FIXED_MARKER} 推开石门",
            ),
            TransitionInput(
                fromSceneId="SCENE_2",
                toSceneId="END",
                action=f"{USER_FIXED_MARKER} 迎上去",
            ),
            # 主干之外的固定分支：保留为可选路线，但不改变必经链
            TransitionInput(
                fromSceneId="SCENE_1",
                toSceneId="SCENE_X",
                action=f"{USER_FIXED_MARKER} 绕路",
            ),
            # 没有标记的普通边：不参与固定识别
            TransitionInput(fromSceneId="SCENE_1", toSceneId="SCENE_2", action="继续"),
        ]
    )
    waypoints = _build_waypoints(req)
    plan = identify_fixed_segments(req.transitions, [w["id"] for w in waypoints])

    assert {(s.fromSceneId, s.toSceneId) for s in plan.main_segments} == {
        ("START", "SCENE_1"),
        ("SCENE_2", "END"),
    }
    assert [(s.fromSceneId, s.toSceneId) for s in plan.optional_segments] == [
        ("SCENE_1", "SCENE_X")
    ]

    # 固定不等于连通：没被固定覆盖的段仍然需要 AI 补齐
    assert plan.needs_ai("SCENE_1", "SCENE_2") is True
    assert plan.needs_ai("START", "SCENE_1") is False
    assert plan.fixed_action_for("SCENE_1").startswith(USER_FIXED_MARKER)
    assert plan.fixed_action_for("SCENE_2") is None


def test_marker_detection_is_exact():
    assert is_user_fixed(f"{USER_FIXED_MARKER} 推门") is True
    assert is_user_fixed("推门进去") is False
    assert is_user_fixed(None) is False


# ---------------------------------------------------------------
# ④ 正向约束检查
# ---------------------------------------------------------------


def test_validate_node_trusts_user_fixed_branch_unconditionally():
    constraints = build_constraints(
        properties=[],
        relations=[],
    )
    # bob 手上什么都没有，且图里根本没有这件物品 —— AI 分支会被判非法
    illegal = {
        "action": f"{USER_FIXED_MARKER} 把钥匙递给 bob",
        "userFixed": True,
        "text": "她把钥匙塞进你手里。",
        "structuredActions": [
            {"actionType": "TRANSFER_ITEM", "actor": "alice", "target": "bob", "itemId": KEY}
        ],
        "tension": 7,
    }
    ok, next_state, penalty = validate_node(illegal, constraints.initial_state, constraints)

    assert ok is True
    assert penalty == 0.0
    # 声明的状态变更照样生效，供后续 AI 剧情衔接
    assert KEY in next_state["holds"]["bob"]
    assert next_state["tension"] == 7

    # 同样的动作交给 AI 分支就必须被硬约束拦下
    ai_node = {**illegal, "userFixed": False, "action": "把钥匙递给 bob"}
    ok_ai, _, _ = validate_node(ai_node, constraints.initial_state, constraints)
    assert ok_ai is False


# ---------------------------------------------------------------
# ③ AI 只补齐缺失段 + 锚点固定动作
# ---------------------------------------------------------------


def test_assemble_layers_skips_fixed_segment_but_keeps_anchor():
    req = _request(
        [
            TransitionInput(
                fromSceneId="START",
                toSceneId="SCENE_1",
                action=f"{USER_FIXED_MARKER} 推开石门",
            )
        ]
    )
    waypoints = _build_waypoints(req)
    pairs = [(waypoints[i]["id"], waypoints[i + 1]["id"]) for i in range(len(waypoints) - 1)]
    plan = identify_fixed_segments(req.transitions, [w["id"] for w in waypoints])

    # 固定了 START -> SCENE_1，模型只会为剩下的两段返回内容
    htn = {
        "mandatoryNodeStates": {},
        "segments": [
            {"from": "SCENE_1", "to": "SCENE_2", "layers": [[_ai_node(text="石阶上落着尘土。")]]},
            {"from": "SCENE_2", "to": "END", "layers": [[_ai_node(text="她缓缓抬起眼。")]]},
        ],
    }
    layers = _assemble_layers(req, htn, waypoints, pairs, plan)

    # 第 1 层就是被固定的锚点：中间不生成任何过渡节点
    assert [node["sceneId"] for node in layers[0]] == ["SCENE_1"]
    anchor = layers[0][0]
    assert anchor["userFixed"] is True
    assert anchor["action"].startswith(USER_FIXED_MARKER)
    # 铁律一：固定锚点与 AI 节点使用同一基准分，不是满分
    assert anchor["qualityScore"] == 8.0

    # 后续 AI 段按「缺失段」顺序消费，没有错位
    assert len(layers) == 4
    assert layers[1][0]["sceneId"].startswith("SCENE_S2_")
    assert layers[2][0]["sceneId"] == "SCENE_2"
    assert layers[3][0]["sceneId"].startswith("SCENE_S3_")

    # 进入 SCENE_2 不是固定段，锚点不应该被标成 userFixed
    assert "userFixed" not in layers[2][0]


# ---------------------------------------------------------------
# ⑤ 反向动态规划：固定段强制保留
# ---------------------------------------------------------------


def test_trellis_keeps_fixed_edge_with_marker():
    constraints = build_constraints([], [])
    fixed_action = f"{USER_FIXED_MARKER} 推开石门"
    layers = [
        [
            {
                "sceneId": "SCENE_1",
                "action": fixed_action,
                "closingAction": "揭晓结局",
                "speaker": "旁白",
                "text": "血月升起。",
                "qualityScore": 8.0,
                "tension": 5,
                "preconditions": {},
                "structuredActions": [],
                "isMandatory": True,
                "userFixed": True,
            }
        ]
    ]
    plan = identify_fixed_segments(
        [TransitionInput(fromSceneId="START", toSceneId="SCENE_1", action=fixed_action)],
        ["START", "SCENE_1", "END"],
    )
    graph = solve_story_trellis(
        constraints,
        {},
        layers,
        strict_mode=True,
        fixed_segments=plan.main_segments,
    )

    edges = {(e.fromSceneId, e.toSceneId): e.action for e in graph.edges}
    assert edges[("START", "SCENE_1")] == fixed_action
    assert ("SCENE_1", "END") in edges


# ---------------------------------------------------------------
# 端到端：固定段不被生成，AI 只补齐其余段
# ---------------------------------------------------------------


def _llm(content: str) -> MagicMock:
    llm = MagicMock()
    llm.chat = AsyncMock(
        return_value=LLMResult(content=content, model="qwen3.8-flash", provider="aliyun_maas")
    )
    return llm


@pytest.mark.anyio
async def test_plan_does_not_generate_layers_for_fixed_segment():
    fixed_action = f"{USER_FIXED_MARKER} 推开石门"
    req = _request(
        [TransitionInput(fromSceneId="START", toSceneId="SCENE_1", action=fixed_action)]
    )
    payload = {
        "targetPreconditions": {},
        "mandatoryNodeStates": {},
        "segments": [
            {"from": "SCENE_1", "to": "SCENE_2", "layers": [[_ai_node(text="石阶上落着尘土。")]]},
            {"from": "SCENE_2", "to": "END", "layers": [[_ai_node(text="她缓缓抬起眼。")]]},
        ],
    }
    graph = await WorldlinePlanner(llm=_llm(json.dumps(payload, ensure_ascii=False))).plan(req)

    scene_ids = [node.sceneId for node in graph.nodes]
    # 固定段 START -> SCENE_1 中间不允许出现任何 AI 过渡节点
    assert not any(scene_id.startswith("SCENE_S1_") for scene_id in scene_ids)
    assert "SCENE_1" in scene_ids
    assert "SCENE_2" in scene_ids
    # 其余缺失段照常由 AI 补齐
    assert sum(1 for scene_id in scene_ids if scene_id.startswith("SCENE_S2_")) == 1
    assert sum(1 for scene_id in scene_ids if scene_id.startswith("SCENE_S3_")) == 1

    edges = {(edge.fromSceneId, edge.toSceneId): edge.action for edge in graph.edges}
    assert edges[("START", "SCENE_1")] == fixed_action