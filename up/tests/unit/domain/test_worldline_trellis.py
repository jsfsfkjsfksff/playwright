"""图约束编译器、硬校验器与状态空间 DP 的纯逻辑测试。"""

import math

from app.domain.worldline.constraints import build_constraints
from app.domain.worldline.models import PropertyInput, RelationInput
from app.domain.worldline.trellis import solve_story_trellis
from app.domain.worldline.validator import make_branch_state_signature, validate_node

KEY = "储物柜钥匙"


def _transfer_constraints():
    """alice 与 bob 同处医院，钥匙在 alice 手上，二人无敌对关系。"""
    return build_constraints(
        properties=[
            PropertyInput(
                type="CHARACTER",
                name="alice",
                attributes={"holds": [KEY], "location": "医院"},
            ),
            PropertyInput(type="CHARACTER", name="bob", attributes={"location": "医院"}),
            PropertyInput(type="ITEM", name=KEY),
        ],
        relations=[],
    )


def _transfer_node(actor: str = "bob", target: str = "alice") -> dict:
    return {
        "action": "交接钥匙",
        "text": "有人把钥匙递了过去。",
        "structuredActions": [
            {"actionType": "TRANSFER_ITEM", "actor": actor, "target": target, "itemId": KEY}
        ],
    }


def _layer_node(scene_id: str, actions: list[dict] | None = None) -> dict:
    return {
        "sceneId": scene_id,
        "action": "继续",
        "closingAction": "揭晓结局",
        "speaker": "旁白",
        "text": "……",
        "qualityScore": 8.0,
        "tension": 5,
        "preconditions": {},
        "structuredActions": actions or [],
    }


def test_build_constraints_compiles_entities_state_and_rules():
    constraints = build_constraints(
        properties=[
            PropertyInput(
                type="CHARACTER",
                name="alice",
                attributes={"role": "医生", "holds": [KEY], "location": "医院"},
            ),
            PropertyInput(type="ITEM", name=KEY),
            PropertyInput(
                type="RULE",
                name="夜间巡逻",
                attributes={"forbiddenWords": ["血腥"], "requireCoLocation": False},
            ),
        ],
        relations=[
            RelationInput(type="ENEMY_OF", subject="bob", object="alice"),
            RelationInput(type="HOLDS", subject="bob", object="手电筒"),
        ],
    )

    assert {"主角", "alice", "bob"} <= constraints.characters
    assert {KEY, "手电筒"} <= constraints.items
    assert constraints.fixed_facts["alice.role"] == "医生"
    assert constraints.initial_state["locations"]["alice"] == "医院"
    assert ("bob", "alice") in constraints.initial_state["enemies"]
    assert "手电筒" in constraints.initial_state["holds"]["bob"]
    assert constraints.forbidden_words == ["血腥"]
    assert constraints.require_co_location is False
    assert constraints.strict_entity_existence is True


def test_forbidden_words_reject_node():
    constraints = build_constraints(
        properties=[
            PropertyInput(type="RULE", name="分级", attributes={"forbiddenWords": ["血腥"]})
        ],
        relations=[],
    )
    ok, _, penalty = validate_node(
        {"text": "血腥的场面扑面而来", "action": "推门"}, constraints.initial_state, constraints
    )
    assert ok is False
    assert penalty == math.inf


def test_transfer_requires_real_holder():
    constraints = _transfer_constraints()
    ok, _, penalty = validate_node(_transfer_node(), constraints.initial_state, constraints)
    assert ok is False  # bob 手上没有钥匙，拒绝“无中生有”
    assert penalty == math.inf


def test_transfer_blocked_between_enemies():
    constraints = build_constraints(
        properties=[
            PropertyInput(
                type="CHARACTER",
                name="alice",
                attributes={"holds": [KEY], "location": "医院"},
            ),
            PropertyInput(
                type="CHARACTER",
                name="bob",
                attributes={"location": "医院", "enemy_of": ["alice"]},
            ),
            PropertyInput(type="ITEM", name=KEY),
        ],
        relations=[],
    )
    ok, _, penalty = validate_node(
        _transfer_node(actor="alice", target="bob"), constraints.initial_state, constraints
    )
    assert ok is False  # 互为 ENEMY_OF，禁止直接交接
    assert penalty == math.inf


def test_transfer_blocked_across_locations():
    constraints = build_constraints(
        properties=[
            PropertyInput(
                type="CHARACTER",
                name="alice",
                attributes={"holds": [KEY], "location": "医院"},
            ),
            PropertyInput(type="CHARACTER", name="bob", attributes={"location": "走廊"}),
            PropertyInput(type="ITEM", name=KEY),
        ],
        relations=[],
    )
    ok, _, penalty = validate_node(
        _transfer_node(actor="alice", target="bob"), constraints.initial_state, constraints
    )
    assert ok is False  # 二人不在同一地点
    assert penalty == math.inf


def test_legal_transfer_evolves_branch_state_but_not_initial_snapshot():
    constraints = _transfer_constraints()
    ok, next_state, _ = validate_node(
        _transfer_node(actor="alice", target="bob"), constraints.initial_state, constraints
    )

    assert ok is True
    assert next_state["holds"]["alice"] == []
    assert next_state["holds"]["bob"] == [KEY]
    # 初始快照 G_0 绝不被污染
    assert constraints.initial_state["holds"]["alice"] == [KEY]
    assert make_branch_state_signature(constraints.initial_state) != make_branch_state_signature(
        next_state
    )


def test_trellis_prunes_illegal_branch_but_keeps_legal_one():
    constraints = _transfer_constraints()
    layers = [
        [
            _layer_node("SCENE_OK"),
            _layer_node("SCENE_BAD", actions=_transfer_node()["structuredActions"]),
        ]
    ]
    graph = solve_story_trellis(constraints, {}, layers, strict_mode=True)

    assert [n.sceneId for n in graph.nodes] == ["SCENE_OK"]
    assert {(e.fromSceneId, e.toSceneId) for e in graph.edges} == {
        ("START", "SCENE_OK"),
        ("SCENE_OK", "END"),
    }


def test_trellis_returns_empty_graph_when_all_branches_illegal():
    constraints = _transfer_constraints()
    layers = [[_layer_node("SCENE_BAD", actions=_transfer_node()["structuredActions"])]]
    graph = solve_story_trellis(constraints, {}, layers, strict_mode=True)

    assert graph.nodes == []
    assert graph.edges == []


def test_soft_mode_keeps_illegal_branch_with_penalty():
    constraints = _transfer_constraints()
    layers = [[_layer_node("SCENE_BAD", actions=_transfer_node()["structuredActions"])]]
    graph = solve_story_trellis(constraints, {}, layers, strict_mode=False)

    assert [n.sceneId for n in graph.nodes] == ["SCENE_BAD"]
    assert len(graph.edges) == 2