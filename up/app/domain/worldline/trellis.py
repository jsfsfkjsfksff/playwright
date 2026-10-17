"""第三层：分支状态隔离 + 全局动态规划。

每个分支维护独立的 state_after，按 (sceneId, state_sig) 展开状态空间，
再用逆向动态规划 (Backward Induction) 剪掉死胡同、选出高分路径。
"""

import json
import math
from typing import Any

from app.domain.worldline.constraints import WorldGraphConstraints
from app.domain.worldline.models import TrellisGraphResponse, WorldlineEdge, WorldlineNode
from app.domain.worldline.validator import make_branch_state_signature, validate_node


def solve_story_trellis(
    constraints: WorldGraphConstraints,
    target_pre: dict[str, Any],
    unified_layers: list[list[dict]],
    strict_mode: bool = True,
) -> TrellisGraphResponse:
    """按 (sceneId, state_sig) 展开状态空间，执行正向校验与逆向 DP 剪枝。"""
    node_map: dict[str, dict] = {}
    init_state = constraints.initial_state
    start_key = ("START", make_branch_state_signature(init_state))

    # state_after: 每个 (场景ID, 状态签名) 演进后的独立分支状态，绝不污染全局图数据库！
    state_after: dict[tuple[str, tuple], dict[str, Any]] = {start_key: init_state}
    adj_plan_edges: dict[tuple[str, tuple], list[tuple]] = {start_key: []}

    prev_plan_keys = [start_key]
    all_layer_plan_keys = [[start_key]]

    # --- 阶段 A：正向逐层校验动作并派生分支状态 ---
    for layer in unified_layers:
        curr_plan_keys_dict: dict[tuple[str, tuple], float] = {}

        for raw_node in layer:
            nid = raw_node["sceneId"]
            node_map[nid] = raw_node

            for p_key in prev_plan_keys:
                branch_curr_state = state_after[p_key]
                is_valid, branch_next_state, penalty = validate_node(
                    raw_node, branch_curr_state, constraints, strict_mode
                )

                if is_valid and penalty < math.inf:
                    next_sig = make_branch_state_signature(branch_next_state)
                    c_key = (nid, next_sig)

                    if c_key not in adj_plan_edges:
                        adj_plan_edges[c_key] = []

                    # 同一 (场景, 关系签名) 保留张力过渡最平滑的状态副本
                    if c_key not in curr_plan_keys_dict or penalty < curr_plan_keys_dict[c_key]:
                        curr_plan_keys_dict[c_key] = penalty
                        state_after[c_key] = branch_next_state

                    cond_str = json.dumps(raw_node.get("preconditions", {}), ensure_ascii=False)
                    adj_plan_edges[p_key].append(
                        (c_key, raw_node.get("action", "继续"), cond_str, penalty)
                    )

        curr_keys_list = list(curr_plan_keys_dict.keys())
        prev_plan_keys = curr_keys_list
        all_layer_plan_keys.append(curr_keys_list)

    # 校验最后一层能否合法进入必达终点 END
    end_key = ("END", ("END_SIG",))
    end_check_node = {
        "text": "",
        "action": "推进至结局",
        "preconditions": target_pre,
        "structuredActions": [],
    }
    for l_key in prev_plan_keys:
        branch_state = state_after[l_key]
        is_valid, _, penalty = validate_node(end_check_node, branch_state, constraints, strict_mode)
        if is_valid and penalty < math.inf:
            lid = l_key[0]
            closing_act = node_map[lid].get("closingAction", "揭晓结局")
            cond_str = json.dumps(target_pre, ensure_ascii=False) if target_pre else "NONE"
            adj_plan_edges[l_key].append((end_key, closing_act, cond_str, penalty))

    # --- 阶段 B：逆向动态规划 (Backward Induction) 剔除死胡同并选出高分路径 ---
    V: dict[tuple[str, tuple], float] = {end_key: 0.0}
    best_physical_edges: dict[tuple[str, str], tuple[float, WorldlineEdge]] = {}
    alive_scene_ids: set[str] = set()

    for layer_keys in reversed(all_layer_plan_keys):
        for u_key in layer_keys:
            if u_key not in adj_plan_edges:
                continue
            best_val = -math.inf
            uid = u_key[0]

            for (v_key, act, cond_str, penalty) in adj_plan_edges[u_key]:
                if V.get(v_key, -math.inf) > -math.inf:
                    edge_score = V[v_key] - penalty
                    if edge_score > best_val:
                        best_val = edge_score

                    vid = v_key[0]
                    phys_pair = (uid, vid)
                    edge_obj = WorldlineEdge(
                        fromSceneId=uid, toSceneId=vid, action=act, condition=cond_str
                    )
                    if (
                        phys_pair not in best_physical_edges
                        or edge_score > best_physical_edges[phys_pair][0]
                    ):
                        best_physical_edges[phys_pair] = (edge_score, edge_obj)

            if best_val > -math.inf:
                node_q = float(node_map[uid].get("qualityScore", 8.0)) if uid in node_map else 0.0
                V[u_key] = node_q + best_val
                if uid != "START":
                    alive_scene_ids.add(uid)
            else:
                V[u_key] = -math.inf

    sorted_edges = [
        item[1] for item in sorted(best_physical_edges.values(), key=lambda x: x[0], reverse=True)
    ]
    alive_nodes = [
        WorldlineNode(
            sceneId=uid,
            action=node_map[uid].get("action", "继续"),
            text=node_map[uid].get("text", ""),
            speaker=node_map[uid].get("speaker", "旁白"),
            audioUrl="",
            isMandatory=node_map[uid].get("isMandatory", False),
        )
        for uid in node_map
        if uid in alive_scene_ids
    ]

    return TrellisGraphResponse(nodes=alive_nodes, edges=sorted_edges)