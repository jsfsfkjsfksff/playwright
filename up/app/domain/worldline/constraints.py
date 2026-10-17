"""第一层 -> 第二层：图数据约束编译器。

把 Neo4j / 前端传来的资源节点与关系边，编译成一次剧情推演所需的硬约束上下文，
供硬校验器（validator）与状态空间 DP（trellis）使用。
"""

from typing import Any

from app.domain.worldline.models import PropertyInput, RelationInput


class WorldGraphConstraints:
    """一次剧情推演所依赖的图约束上下文。"""

    def __init__(self) -> None:
        # 1. 知识图谱实体注册表（用于校验角色、物品是否真实存在于设定图中）
        self.characters: set[str] = {"主角"}
        self.items: set[str] = set()
        self.locations: set[str] = set()

        # 2. 不可篡改的固定事实（如 {"alice.role": "医生"}）
        self.fixed_facts: dict[str, Any] = {}

        # 3. 初始分支状态快照 G_0（搜索时每个分支克隆此对象，绝不直接修改原始图）
        self.initial_state: dict[str, Any] = {
            "holds": {},  # HOLDS 关系: {"alice": ["储物柜钥匙"]}
            "locations": {},  # LOCATED_AT 关系: {"alice": "医院", "bob": "医院"}
            "enemies": [],  # ENEMY_OF 关系: [("alice", "bob")]
            "flags": {},  # 节点动态属性: {"miku.isAngry": True}
            "tension": 3,
        }

        # 4. 可配置硬约束规则开关
        self.strict_entity_existence: bool = False  # 若是注册了物品，则只允许操作图中存在的物品
        self.strict_item_transfer: bool = True  # 物品必须由当前持有人通过合法动作转移
        self.block_enemy_transfer: bool = True  # 严禁向处于 ENEMY_OF 关系的目标转交物品
        self.require_co_location: bool = True  # 交接物品双方必须处于同一地点
        self.forbidden_words: list[str] = []
        self.item_write_locks: dict[str, str] = {}  # 动作守卫: {"打开储物柜": "储物柜钥匙"}


def build_constraints(
    properties: list[PropertyInput],
    relations: list[RelationInput],
) -> WorldGraphConstraints:
    """解析图数据库中的实体、关系和规则，构建当前剧情的硬约束上下文。"""
    c = WorldGraphConstraints()

    # A. 解析实体节点与内嵌关系属性
    for prop in properties:
        p_type = prop.type.upper()
        name = prop.name.strip()
        attrs = prop.attributes or {}

        if p_type == "CHARACTER":
            c.characters.add(name)
            c.initial_state["holds"].setdefault(name, [])

            for k, v in attrs.items():
                # (1) 固定事实（fixed_ 前缀或 role/job/title）
                if k.startswith("fixed_") or k in ("role", "job", "title", "song"):
                    clean_k = k.removeprefix("fixed_")
                    c.fixed_facts[f"{name}.{clean_k}"] = v
                # (2) 持有关系 HOLDS
                elif k == "holds" and isinstance(v, list):
                    for item in v:
                        item_str = str(item).strip()
                        c.items.add(item_str)
                        if item_str not in c.initial_state["holds"][name]:
                            c.initial_state["holds"][name].append(item_str)
                # (3) 位置关系 LOCATED_AT
                elif k in ("location", "located_at"):
                    loc_str = str(v).strip()
                    c.locations.add(loc_str)
                    c.initial_state["locations"][name] = loc_str
                # (4) 敌对关系 ENEMY_OF
                elif k == "enemy_of":
                    enemies = v if isinstance(v, list) else [v]
                    for e_name in enemies:
                        pair = (name, str(e_name).strip())
                        if pair not in c.initial_state["enemies"]:
                            c.initial_state["enemies"].append(pair)
                # (5) 其它可变化状态标志
                else:
                    c.initial_state["flags"][f"{name}.{k}"] = v

        elif p_type in ("ITEM", "ENTITY"):
            c.items.add(name)
            if "location" in attrs:
                loc_str = str(attrs["location"]).strip()
                c.locations.add(loc_str)
                c.initial_state["locations"][name] = loc_str
            if "holder" in attrs:
                holder = str(attrs["holder"]).strip()
                c.characters.add(holder)
                c.initial_state["holds"].setdefault(holder, [])
                if name not in c.initial_state["holds"][holder]:
                    c.initial_state["holds"][holder].append(name)
            if "requiresItem" in attrs:
                kw = str(attrs.get("actionKeyword", f"打开{name}"))
                c.item_write_locks[kw] = str(attrs["requiresItem"])

        elif p_type == "LOCATION":
            c.locations.add(name)

        elif p_type == "RULE":
            words = attrs.get("forbiddenWords", [])
            if isinstance(words, list):
                c.forbidden_words.extend([str(w) for w in words])
            if "strictItemTransfer" in attrs:
                c.strict_item_transfer = bool(attrs["strictItemTransfer"])
            if "blockEnemyTransfer" in attrs:
                c.block_enemy_transfer = bool(attrs["blockEnemyTransfer"])
            if "requireCoLocation" in attrs:
                c.require_co_location = bool(attrs["requireCoLocation"])
            if "strictEntityCheck" in attrs:
                c.strict_entity_existence = bool(attrs["strictEntityCheck"])

    # B. 解析显式传入的图关系边（CREATE (a)-[:HOLDS]->(k), (a)-[:ENEMY_OF]->(b)）
    for rel in relations:
        r_type = rel.type.upper()
        subj, obj = rel.subject.strip(), rel.object.strip()
        if r_type == "HOLDS":
            c.characters.add(subj)
            c.items.add(obj)
            c.initial_state["holds"].setdefault(subj, [])
            if obj not in c.initial_state["holds"][subj]:
                c.initial_state["holds"][subj].append(obj)
        elif r_type == "LOCATED_AT":
            c.locations.add(obj)
            c.initial_state["locations"][subj] = obj
        elif r_type == "ENEMY_OF":
            c.characters.update([subj, obj])
            if (subj, obj) not in c.initial_state["enemies"]:
                c.initial_state["enemies"].append((subj, obj))

    # 只要图里登记过物品，就开启实体存在性校验
    if c.items:
        c.strict_entity_existence = True

    return c