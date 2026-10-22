from typing import Any

from pydantic import BaseModel, Field


class PropertyInput(BaseModel):
    """图数据库中的资源节点（角色 / 物品 / 地点 / 规则）。

    由 Java 端从 Neo4j 读出 PropertyNode 后透传，用于编译剧情硬约束。
    """

    type: str = Field(..., description="CHARACTER / ITEM / ENTITY / LOCATION / RULE / RELATION")
    name: str = Field(..., description="实体名")
    description: str = Field(default="", description="实体描述")
    attributes: dict[str, Any] = Field(default_factory=dict, description="实体属性")


class RelationInput(BaseModel):
    """显式传入的图关系边（HOLDS / LOCATED_AT / ENEMY_OF / REQUIRES_ITEM）。"""

    type: str = Field(..., description="关系类型")
    subject: str = Field(..., description="起点实体名")
    object: str = Field(..., description="终点实体名")


class MandatoryNodeInput(BaseModel):
    """必经场景锚点（Java 侧的 KEY_i），AI 生成时必须按顺序穿过。"""

    sceneId: str = Field(..., description="锚点场景 ID")
    text: str = Field(..., description="锚点台词")
    speaker: str = Field(default="旁白", description="说话人")
    goal: str = Field(default="", description="该锚点要达成的剧情节拍")


class TransitionInput(BaseModel):
    """前端画布上的一条**单向**剧情连线（对应后端 Transition）。

    ⚠️ 第六代约定：
      - 前端**不**把画布上的双向边对原样传过来（双向只是画布交互的识别手段）；
      - 用户手动创建的固定分支，统一以单向边 + `action` 里携带 `[[USER_FIXED]]` 标记传入；
      - 不带标记的边就是普通的 AI 候选路径，不参与「固定剧情」识别。
    """

    fromSceneId: str = Field(..., description="起点场景 ID")
    toSceneId: str = Field(..., description="终点场景 ID")
    action: str = Field(default="继续", description="连线动作（固定分支必须含 [[USER_FIXED]]）")


class InterpolateRequest(BaseModel):
    """世界线插值输入。

    字段与 Java 端 PEngineController 调用 /api/ai/generate-worldline 时
    发送的请求体一一对应。
    """

    startText: str = Field(..., description="起点锚点场景文本")
    endText: str = Field(..., description="终点锚点场景文本")
    outline: str = Field(..., description="创作者大纲约束")
    layers: int = Field(default=1, description="每个任务段期望的过渡层数")
    maxActions: int = Field(default=2, description="每层期望的分支数")
    mandatoryNodes: list[MandatoryNodeInput] = Field(
        default_factory=list, description="有序的必经节点序列"
    )
    transitions: list[TransitionInput] = Field(
        default_factory=list,
        description="画布单向连线（含 [[USER_FIXED]] 固定分支标记）",
    )
    properties: list[PropertyInput] = Field(
        default_factory=list, description="图谱资源节点（约束来源）"
    )
    relations: list[RelationInput] = Field(
        default_factory=list, description="显式图关系边（约束来源）"
    )


class WorldlineNode(BaseModel):
    """世界线节点（对应 Java 的 WorldlineNodeDto）。"""

    sceneId: str = Field(default="", description="全局唯一场景 ID")
    action: str = Field(default="继续", description="玩家或角色的动作")
    text: str = Field(default="", description="该动作导致的台词或描写")
    speaker: str = Field(default="旁白", description="谁在说话")
    audioUrl: str = Field(default="", description="语音地址")
    isMandatory: bool = Field(default=False, description="是否为必经锚点")


class WorldlineEdge(BaseModel):
    """世界线连线（对应 Java 的 WorldlineEdgeDto）。"""

    fromSceneId: str = Field(..., description="起点场景 ID")
    toSceneId: str = Field(..., description="终点场景 ID")
    action: str = Field(..., description="玩家在该连线上的动作")
    condition: str = Field(..., description="连线的前置条件（JSON 字符串或 NONE）")


class TrellisGraphResponse(BaseModel):
    """DP 剪枝后的剧情网格图（对应 Java 的 TrellisGraphDto）。"""

    nodes: list[WorldlineNode]
    edges: list[WorldlineEdge]