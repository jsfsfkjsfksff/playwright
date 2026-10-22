import json
import uuid
from typing import Any, Protocol

from app.core.constants import ModelAlias
from app.core.logging import get_logger
from app.domain.worldline.constraints import WorldGraphConstraints, build_constraints
from app.domain.worldline.fixed_route import (
    DEFAULT_QUALITY_SCORE,
    FixedRoutePlan,
    identify_fixed_segments,
)
from app.domain.worldline.models import (
    InterpolateRequest,
    TrellisGraphResponse,
    WorldlineEdge,
    WorldlineNode,
)
from app.domain.worldline.trellis import solve_story_trellis
from app.infra.llm.base import LLMResult

logger = get_logger(__name__)

SYSTEM_PROMPT = "你是一个严格遵守图关系约束与物品转移法则的 HTN 叙事引擎，只输出合法 JSON 对象。"


class LLMChatProtocol(Protocol):
    """domain 只认这个协议，不认具体 SDK。"""

    async def chat(
        self,
        *,
        model_alias: str,
        messages: list[dict],
        temperature: float | None = None,
        **kwargs,
    ) -> LLMResult: ...


def _build_waypoints(req: InterpolateRequest) -> list[dict[str, str]]:
    """构建有序必达任务段 (START -> KEY_1 -> ... -> END)。"""
    waypoints: list[dict[str, str]] = [
        {"id": "START", "text": req.startText, "speaker": "旁白", "goal": "初始起点"}
    ]
    for m in req.mandatoryNodes:
        waypoints.append(
            {
                "id": m.sceneId,
                "text": m.text,
                "speaker": m.speaker,
                "goal": m.goal or m.text,
            }
        )
    waypoints.append({"id": "END", "text": req.endText, "speaker": "旁白", "goal": "最终结局"})
    return waypoints


def _build_prompt(
    req: InterpolateRequest,
    constraints: WorldGraphConstraints,
    waypoints: list[dict[str, str]],
    fixed_plan: FixedRoutePlan | None = None,
) -> str:
    """【核心】：要求大模型运用 HTN 思想，按任务段一次性深度优先生成候选剧情。

    第六代：用户已经固定的直连段（`[[USER_FIXED]]`）不进入生成清单，
    AI 只补齐 needAi = True 的缺失连接段。
    """
    segments_desc = []
    for i in range(len(waypoints) - 1):
        u, v = waypoints[i], waypoints[i + 1]
        if fixed_plan is not None and not fixed_plan.needs_ai(u["id"], v["id"]):
            continue
        segments_desc.append(
            f"任务段 {len(segments_desc) + 1}: 从【{u['id']}】({u['text']}) 推进到【{v['id']}】({v['text']})"
        )

    chain_str = " → ".join([w["id"] for w in waypoints])
    segments_prompt_str = "\n    ".join(segments_desc)

    # 把用户固定剧情原文交给模型：它必须理解上下文，但一个字都不能改写
    fixed_section = ""
    if fixed_plan is not None and fixed_plan.main_segments:
        fixed_lines = [
            f"    {seg.fromSceneId} --[{seg.marked_action}]--> {seg.toSceneId}"
            for seg in fixed_plan.main_segments
        ]
        fixed_section = f"""
    【用户固定剧情（无条件保留，禁止改写/删除，禁止在两端之间插入过渡节点）】：
{chr(10).join(fixed_lines)}
    这些固定段已经在画布上连通，你**不要**为它们生成任何中间剧情；
    只需要补齐上面列出的缺失任务段，并让 AI 剧情自然承接固定剧情的台词。
    """

    return f"""
    你是一个受知识图谱与硬约束校验器严格监管的 Galgame 叙事规划引擎。
    请规划从 START 到 END 的分支剧情，必须严格按顺序经过：{chain_str}
    【全局大纲】：{req.outline}

    【第一层：知识图谱注册实体】：
    - 合法角色集合：{list(constraints.characters)}
    - 合法物品集合：{list(constraints.items)}
    - 不可篡改的固定事实：{json.dumps(constraints.fixed_facts, ensure_ascii=False)}
    - 全局违禁词：{json.dumps(constraints.forbidden_words, ensure_ascii=False)}

    【初始关系图状态 (HOLDS / LOCATED_AT / ENEMY_OF)】：
    {json.dumps(constraints.initial_state, ensure_ascii=False)}

    {fixed_section}

    请为下面这些**缺失连接段**生成候选过渡剧情（每段 {req.layers} 层，每层 {req.maxActions} 个分支）：
    {segments_prompt_str}

    ⚠️【关系图状态演进与结构化动作铁律】：
    1. 严禁复读每个任务段首尾锚点的原句！单幕 text 控制在 30~55 字，符合 Galgame 自然演出风格。
    2. 角色不能无缘无故获得物品！任何关系或状态改变，必须在 structuredActions 中输出标准动作对象，由后端校验器依次验证：
       - 合法交接物品: {{"actionType": "TRANSFER_ITEM", "actor": "原持有人", "target": "接收人", "itemId": "物品名"}}
         (硬性前提：actor 当前必须持有 itemId，双方在同一地点，且不处于 ENEMY_OF 敌对关系)
       - 拾取无主物品: {{"actionType": "PICK_UP", "actor": "角色名", "itemId": "物品名"}}
       - 移动位置: {{"actionType": "MOVE", "actor": "角色名", "target": "新地点"}}
       - 解除敌对关系: {{"actionType": "RESOLVE_HOSTILITY", "actor": "角色A", "target": "角色B"}}
       - 修改状态属性: {{"actionType": "SET_FLAG", "key": "角色名.属性名", "value": false}}

    请严格输出纯 JSON 对象：
    {{
      "targetPreconditions": {{
        "locations": {{}},
        "holds": {{}},
        "flags": {{}}
      }},
      "mandatoryNodeStates": {{
        "KEY_1的ID": {{
          "entryAction": "进入该必要节点的选项名",
          "preconditions": {{"locations": {{}}, "holds": {{}}, "flags": {{}}}},
          "structuredActions": [],
          "tension": 6
        }}
      }},
      "segments": [
        {{
          "from": "起点ID",
          "to": "终点ID",
          "layers": [
            [
              {{
                "action": "玩家点击的分支选项",
                "closingAction": "若连向END，进入END的选项名",
                "speaker": "旁白或角色名",
                "text": "Galgame演出台词...",
                "qualityScore": 8.5,
                "tension": 5,
                "preconditions": {{"locations": {{}}, "holds": {{}}, "flags": {{}}}},
                "structuredActions": [
                  {{"actionType": "TRANSFER_ITEM", "actor": "主角", "target": "miku", "itemId": "特制草莓小蛋糕"}}
                ]
              }}
            ]
          ]
        }}
      ]
    }}
    """


def _parse_llm_json(raw_text: str) -> dict:
    """清洗可能存在的 Markdown 代码块标记后解析 JSON 对象。"""
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    return json.loads(text)


def _assemble_layers(
    req: InterpolateRequest,
    htn_data: dict,
    waypoints: list[dict[str, str]],
    expected_pairs: list[tuple[str, str]],
    fixed_plan: FixedRoutePlan | None = None,
) -> list[list[dict]]:
    """把 LLM 返回的分段剧情摊平成逐层候选，并在段间插入必经锚点。

    第六代：
      - `needAi = False` 的固定段**不生成任何中间层**，直接由锚点层相邻锁定；
      - 固定段进入的锚点标 `userFixed`，并把 `[[USER_FIXED]]` 动作原样带上，
        供校验器跳过硬约束、供 Java 落库时识别；
      - 锚点与 AI 节点统一使用基准质量分 8.0（固定不等于最优）。
    """
    mandatory_states = htn_data.get("mandatoryNodeStates", {})
    segments = htn_data.get("segments", [])
    mandatory_lookup = {m.sceneId: m for m in req.mandatoryNodes}
    unified_layers: list[list[dict]] = []

    # LLM 只按「缺失段」返回 segments，所以取用时用独立游标，不能用段号直取
    ai_cursor = 0

    for seg_idx, (exp_from, exp_to) in enumerate(expected_pairs):
        need_ai = fixed_plan is None or fixed_plan.needs_ai(exp_from, exp_to)
        from_text = waypoints[seg_idx]["text"].strip()
        to_text = waypoints[seg_idx + 1]["text"].strip()

        if need_ai:
            seg_obj = (
                segments[ai_cursor]
                if ai_cursor < len(segments)
                else {"from": exp_from, "to": exp_to, "layers": []}
            )
            ai_cursor += 1

            for l_idx, layer in enumerate(seg_obj.get("layers", [])):
                for n_idx, node in enumerate(layer):
                    node["sceneId"] = (
                        f"SCENE_S{seg_idx + 1}_L{l_idx + 1}_{n_idx + 1}_{uuid.uuid4().hex[:4]}"
                    )
                    node["isMandatory"] = False
                    t = node.get("text", "").strip()
                    # 严禁复读任务段首尾锚点原句
                    if from_text and len(from_text) > 4 and from_text in t:
                        t = t.replace(from_text, "").strip()
                    if to_text and len(to_text) > 4 and to_text in t:
                        t = t.replace(to_text, "").strip()
                    node["text"] = t if t else "……四周静得只能听见呼吸声。"
                if layer:
                    unified_layers.append(layer)

        # 锚点层：无论这一段是 AI 补的还是用户固定的，终点锚点都要进图层
        if exp_to != "END" and exp_to in mandatory_lookup:
            m_info = mandatory_lookup[exp_to]
            m_cfg = mandatory_states.get(exp_to, {})
            fixed_action = fixed_plan.fixed_action_for(exp_to) if fixed_plan else None
            anchor_node: dict[str, Any] = {
                "sceneId": m_info.sceneId,
                "action": fixed_action
                or m_cfg.get("entryAction", f"推进：{m_info.goal or '继续'}"),
                "closingAction": "揭晓结局",
                "speaker": m_info.speaker,
                "text": m_info.text,
                "qualityScore": DEFAULT_QUALITY_SCORE,
                "tension": m_cfg.get("tension", 6),
                "preconditions": m_cfg.get("preconditions", {}),
                "structuredActions": m_cfg.get("structuredActions", []),
                "isMandatory": True,
            }
            if fixed_action is not None:
                # 用户固定进入该锚点：校验器直接信任用户，不做硬约束检查
                anchor_node["userFixed"] = True
            unified_layers.append([anchor_node])

    return unified_layers


def _fallback_graph() -> TrellisGraphResponse:
    """LLM 链路断裂时的保底连线，保证 Java 端不会拿到空图。"""
    fallback_id = f"SCENE_ERR_{uuid.uuid4().hex[:4]}"
    return TrellisGraphResponse(
        nodes=[
            WorldlineNode(
                sceneId=fallback_id,
                action="继续",
                text="空气微微震颤，眼前的景象逐渐清晰。",
                speaker="旁白",
            )
        ],
        edges=[
            WorldlineEdge(
                fromSceneId="START", toSceneId=fallback_id, action="继续", condition="NONE"
            ),
            WorldlineEdge(
                fromSceneId=fallback_id, toSceneId="END", action="推进至结局", condition="NONE"
            ),
        ],
    )


class WorldlinePlanner:
    """世界线规划器：图约束编译 -> LLM 候选生成 -> 硬校验 + 状态空间 DP。"""

    def __init__(
        self,
        llm: LLMChatProtocol,
        model_alias: str = ModelAlias.WORLDLINE,
    ):
        self._llm = llm
        self._model_alias = model_alias

    async def plan(self, req: InterpolateRequest) -> TrellisGraphResponse:
        # 1. 构建基于图数据的硬约束上下文
        constraints = build_constraints(req.properties, req.relations)
        waypoints = _build_waypoints(req)
        expected_pairs = [
            (waypoints[i]["id"], waypoints[i + 1]["id"]) for i in range(len(waypoints) - 1)
        ]
        chain_str = " → ".join(w["id"] for w in waypoints)

        # 2. 识别用户固定剧情：主干直连段不进 AI 生成清单，其余保留为可选分支
        fixed_plan = identify_fixed_segments(req.transitions, [w["id"] for w in waypoints])

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_prompt(req, constraints, waypoints, fixed_plan)},
        ]

        try:
            logger.info(
                "worldline_planning",
                chain=chain_str,
                characters=len(constraints.characters),
                items=len(constraints.items),
                fixed_segments=len(fixed_plan.main_segments),
                optional_fixed=len(fixed_plan.optional_segments),
            )
            # 3. 生成候选剧情（走项目统一 LLM 网关，含 provider 降级）
            result = await self._llm.chat(
                model_alias=self._model_alias,
                messages=messages,
                temperature=0.6,
                response_format={"type": "json_object"},
                extra_body={"enable_thinking": False},
            )
            htn_data = _parse_llm_json(result.content)
            target_pre: dict[str, Any] = htn_data.get("targetPreconditions", {})
            unified_layers = _assemble_layers(
                req, htn_data, waypoints, expected_pairs, fixed_plan
            )

            # 4. 硬约束校验 + 全局 DP；严格模式下断路则降级为软约束寻优
            logger.info("worldline_validating", layers=len(unified_layers))
            graph = solve_story_trellis(
                constraints,
                target_pre,
                unified_layers,
                strict_mode=True,
                fixed_segments=fixed_plan.main_segments,
                optional_fixed_segments=fixed_plan.optional_segments,
            )
            if not graph.edges:
                logger.warning("worldline_strict_dead_end")
                graph = solve_story_trellis(
                    constraints,
                    target_pre,
                    unified_layers,
                    strict_mode=False,
                    fixed_segments=fixed_plan.main_segments,
                    optional_fixed_segments=fixed_plan.optional_segments,
                )

            logger.info("worldline_planned", nodes=len(graph.nodes), edges=len(graph.edges))
            return graph
        except Exception as e:
            logger.error("worldline_planning_failed", error=str(e))
            # 如果大模型抽风，返回保底连线防止 Java 崩溃
            return _fallback_graph()