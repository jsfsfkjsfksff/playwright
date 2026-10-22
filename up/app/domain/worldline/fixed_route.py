"""第四层：用户固定剧情识别（第六代：用户剧情与 AI 剧情融合）。

用户手动创建的固定分支，在画布上以**双向对称连线**表达；前端提交时把它收敛成
一条**单向边**，并在 `Transition.action` 里带上 `[[USER_FIXED]]` 标记。

本模块只回答两个问题：
  1. 主干相邻锚点之间（START → KEY_1、A → B、KEY_n → END）哪几段已被用户固定？
     固定段 `needAi = False`：直连锁定，禁止 AI 在中间插入过渡节点。
  2. 其余固定分支怎么处理？原样保留为可选平行路线，既不能删，也不能强行塞进主干
     （铁律三：固定不等于必经）。

⚠️ 三条铁律的落点：
  - 固定不等于最优：本模块只决定「哪段不生成」，不给任何加分；
  - 固定不等于连通：`needAi = True` 的段仍要 AI 补齐并交给 DP 验证可达 END；
  - 固定不等于必经：只有出现在必经锚点链上的固定段才算 `main_segments`。
"""

from dataclasses import dataclass

from app.domain.worldline.models import TransitionInput

# 固定分支标记：大小写敏感，与前端约定的字符串完全一致
USER_FIXED_MARKER = "[[USER_FIXED]]"

# 固定节点与 AI 节点共用的基准质量分（铁律一：固定不等于最优）
DEFAULT_QUALITY_SCORE = 8.0


def is_user_fixed(action: str | None) -> bool:
    """一条连线是否被用户标记为固定分支。"""
    return USER_FIXED_MARKER in (action or "")


def with_fixed_marker(action: str) -> str:
    """保证输出回来的边仍然带标记（Java 落库时据此识别固定分支）。"""
    text = (action or "").strip()
    if is_user_fixed(text):
        return text
    return f"{USER_FIXED_MARKER} {text}".strip()


@dataclass(frozen=True)
class FixedSegment:
    """一段被用户锁定的直连剧情。"""

    fromSceneId: str
    toSceneId: str
    action: str

    @property
    def marked_action(self) -> str:
        return with_fixed_marker(self.action)


@dataclass(frozen=True)
class FixedRoutePlan:
    """一次插值中对固定剧情的完整识别结果。"""

    # 主干（必经锚点链）上的固定直连段：这些段不生成 AI 过渡
    main_segments: tuple[FixedSegment, ...] = ()
    # 主干之外的固定分支：作为可选平行路线保留，不参与必经约束
    optional_segments: tuple[FixedSegment, ...] = ()

    def is_fixed_pair(self, from_scene_id: str, to_scene_id: str) -> bool:
        return any(
            seg.fromSceneId == from_scene_id and seg.toSceneId == to_scene_id
            for seg in self.main_segments
        )

    def needs_ai(self, from_scene_id: str, to_scene_id: str) -> bool:
        """该相邻锚点段是否需要 AI 补齐连接剧情。"""
        return not self.is_fixed_pair(from_scene_id, to_scene_id)

    def fixed_action_for(self, scene_id: str) -> str | None:
        """进入该锚点的固定动作（带标记）；不是固定段终点则返回 None。"""
        for seg in self.main_segments:
            if seg.toSceneId == scene_id:
                return seg.marked_action
        return None

    @property
    def all_segments(self) -> tuple[FixedSegment, ...]:
        return self.main_segments + self.optional_segments


def identify_fixed_segments(
    transitions: list[TransitionInput] | tuple[TransitionInput, ...],
    waypoint_ids: list[str],
) -> FixedRoutePlan:
    """扫描单向连线，识别主干固定段与可选固定分支。

    `waypoint_ids` 是有序必经锚点链：`[START, KEY_1, ..., END]`。
    只有恰好连接相邻两个 waypoint 的固定边，才会把该段标记为「不需要 AI」。
    """
    main_pairs = set(zip(waypoint_ids, waypoint_ids[1:]))
    main: list[FixedSegment] = []
    optional: list[FixedSegment] = []
    seen: set[tuple[str, str]] = set()

    for transition in transitions:
        if not is_user_fixed(transition.action):
            continue

        pair = (transition.fromSceneId, transition.toSceneId)
        if pair in seen:
            continue
        seen.add(pair)

        segment = FixedSegment(
            fromSceneId=transition.fromSceneId,
            toSceneId=transition.toSceneId,
            action=transition.action,
        )
        if pair in main_pairs:
            main.append(segment)
        else:
            optional.append(segment)

    return FixedRoutePlan(main_segments=tuple(main), optional_segments=tuple(optional))