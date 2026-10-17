"""第二层：硬约束校验器。

对照世界设定图、当前分支状态与规则，逐步检查候选节点是否合法，
并返回演进后的独立分支状态与转场惩罚代价。
"""

import copy
import math
from typing import Any

from app.domain.worldline.constraints import WorldGraphConstraints


def make_branch_state_signature(state: dict[str, Any]) -> tuple:
    """把分支当前的 (HOLDS, LOCATED_AT, ENEMY_OF, Flags) 编码为不可变签名。

    确保不同状态路径在经过同一必要节点时各自独立保留，绝不互相覆盖。
    """
    holds_sig = tuple(
        (char, tuple(sorted(items))) for char, items in sorted(state.get("holds", {}).items())
    )
    loc_sig = tuple(sorted(state.get("locations", {}).items()))
    enemy_sig = tuple(sorted(state.get("enemies", [])))
    flags_sig = tuple(sorted(state.get("flags", {}).items()))
    return (holds_sig, loc_sig, enemy_sig, flags_sig)


def validate_node(
    node: dict,
    current_state: dict[str, Any],
    constraints: WorldGraphConstraints,
    strict_mode: bool = True,
) -> tuple[bool, dict[str, Any], float]:
    """按 4 步检查候选节点是否合法，返回 (是否合法, 演进后的分支状态, 惩罚代价)。"""
    text_and_act = f"{node.get('text', '')} {node.get('action', '')}"
    penalty = 0.0

    # --- 0. 文本违禁词与物品使用权限守卫检查 ---
    for word in constraints.forbidden_words:
        if word and word in text_and_act:
            return False, {}, math.inf

    for kw, req_item in constraints.item_write_locks.items():
        if kw in text_and_act:
            anyone_holds = any(req_item in items for items in current_state["holds"].values())
            if not anyone_holds:
                if strict_mode:
                    return False, {}, math.inf
                penalty += 8.0

    # --- 1. 检查节点声明的前置条件 (preconditions) 是否与当前分支状态一致 ---
    pre = node.get("preconditions", {})

    # (a) 严禁违背固定事实（如 Alice 是医生）
    for fk, fv in pre.get("fixed", {}).items():
        if fk in constraints.fixed_facts and constraints.fixed_facts[fk] != fv:
            return False, {}, math.inf

    # (b) 检查前置位置关系 LOCATED_AT
    for entity, req_loc in pre.get("locations", {}).items():
        cur_loc = current_state["locations"].get(entity)
        if cur_loc is not None and cur_loc != req_loc:
            if strict_mode:
                return False, {}, math.inf
            penalty += 5.0

    # (c) 检查前置持有关系 HOLDS
    for holder, req_items in pre.get("holds", {}).items():
        cur_items = current_state["holds"].get(holder, [])
        for item in req_items:
            if item not in cur_items:
                if strict_mode:
                    return False, {}, math.inf
                penalty += 6.0

    # (d) 检查前置动态标志 flags
    for flag_k, req_v in pre.get("flags", {}).items():
        if flag_k in current_state["flags"] and current_state["flags"][flag_k] != req_v:
            if strict_mode:
                return False, {}, math.inf
            penalty += 4.0

    # --- 2. 克隆当前分支状态，逐条检验结构化动作 (structuredActions) ---
    next_state = copy.deepcopy(current_state)
    actions = node.get("structuredActions", [])

    for act in actions:
        # 兼容 actionType（新标准）与 op（旧字段）
        act_type = (act.get("actionType") or act.get("op") or "").upper()
        actor = (act.get("actor") or act.get("from") or "").strip()
        target = (act.get("target") or act.get("to") or "").strip()
        item_id = (act.get("itemId") or act.get("item") or "").strip()

        if act_type == "TRANSFER_ITEM":
            # 【四步硬校验法】：以 Alice(actor) 将 钥匙(itemId) 交给 Bob(target) 为例
            # 步骤 1: 检查 Alice、Bob 和钥匙是否真实存在于设定图中？
            if constraints.strict_entity_existence:
                if (
                    (actor not in constraints.characters)
                    or (target not in constraints.characters)
                    or (item_id not in constraints.items)
                ):
                    if strict_mode:
                        return False, {}, math.inf
                    penalty += 6.0

            # 步骤 2: 当前剧情分支状态里，钥匙是否仍由 Alice 持有？
            actor_items = next_state["holds"].get(actor, [])
            if item_id not in actor_items:
                if strict_mode and constraints.strict_item_transfer:
                    return False, {}, math.inf  # 拒绝“无中生有”或“隔空取物”！
                penalty += 8.0

            # 步骤 3: 动作是否符合世界转移规则？（同处一地检查 + 敌对关系检查）
            actor_loc = next_state["locations"].get(actor)
            target_loc = next_state["locations"].get(target)
            if (
                constraints.require_co_location
                and actor_loc
                and target_loc
                and actor_loc != target_loc
            ):
                if strict_mode:
                    return False, {}, math.inf  # 两人不在同一地点，不能当面交接物品！
                penalty += 6.0

            is_enemy = (actor, target) in next_state["enemies"] or (
                target,
                actor,
            ) in next_state["enemies"]
            if constraints.block_enemy_transfer and is_enemy:
                if strict_mode:
                    return False, {}, math.inf  # 双方处于 ENEMY_OF 敌对状态，禁止直接交接关键物品！
                penalty += 7.0

            # 步骤 4: 条件全部满足，在当前分支状态中将持有关系从 Alice 更新为 Bob
            if item_id in actor_items:
                actor_items.remove(item_id)
            next_state["holds"].setdefault(target, [])
            if item_id not in next_state["holds"][target]:
                next_state["holds"][target].append(item_id)

        elif act_type == "PICK_UP":
            # 拾取场景中的无主物品
            if constraints.strict_entity_existence and item_id not in constraints.items:
                if strict_mode:
                    return False, {}, math.inf
                penalty += 5.0

            # 检查物品是否正被其他角色持有（被别人拿着的物品不能直接 PICK_UP）
            held_by_other = any(
                item_id in items for h, items in next_state["holds"].items() if h != actor
            )
            if held_by_other and strict_mode and constraints.strict_item_transfer:
                return False, {}, math.inf

            next_state["holds"].setdefault(actor, [])
            if item_id not in next_state["holds"][actor]:
                next_state["holds"][actor].append(item_id)

        elif act_type == "MOVE":
            # 角色移动位置: 更新 LOCATED_AT 关系
            if actor and target:
                next_state["locations"][actor] = target

        elif act_type == "RESOLVE_HOSTILITY":
            # 解除敌对关系（如说服、和解后移除 ENEMY_OF 边，之后才允许 TRANSFER_ITEM）
            if (actor, target) in next_state["enemies"]:
                next_state["enemies"].remove((actor, target))
            if (target, actor) in next_state["enemies"]:
                next_state["enemies"].remove((target, actor))

        elif act_type in ("SET_FLAG", "SET_STATE"):
            k = act.get("key", "")
            v = act.get("value")
            # 严禁修改固定事实（如 Alice 是医生）
            if k in constraints.fixed_facts and constraints.fixed_facts[k] != v:
                return False, {}, math.inf
            if k:
                next_state["flags"][k] = v

    # --- 3. 额外防御：防止台词写“某人拿出了某物”，却故意不声明结构化动作 ---
    for item_name in constraints.items:
        for char_name in constraints.characters:
            if f"{char_name}拿出{item_name}" in text_and_act or f"{char_name}掏出{item_name}" in text_and_act:
                if item_name not in next_state["holds"].get(char_name, []):
                    if strict_mode:
                        return False, {}, math.inf
                    penalty += 8.0

    # --- 4. 软约束：计算剧情张力 (tension) 衔接代价 ---
    curr_tension = float(current_state.get("tension", 5))
    next_tension = float(node.get("tension", curr_tension))
    penalty += 0.5 * abs(curr_tension - next_tension)
    next_state["tension"] = next_tension

    return True, next_state, penalty