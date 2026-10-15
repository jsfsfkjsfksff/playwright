from pydantic import BaseModel, Field


class InterpolateRequest(BaseModel):
    """世界线插值输入。

    字段与 Java 端 PEngineController 调用 /api/ai/generate-worldline 时
    发送的请求体一一对应。
    """

    startText: str = Field(..., description="起点锚点场景文本")
    endText: str = Field(..., description="终点锚点场景文本")
    outline: str = Field(..., description="创作者大纲约束")
    layers: int = Field(..., description="期望的中间过渡层数")


class WorldlineNode(BaseModel):
    """世界线节点（对应 Java 的 WorldlineNodeDto）。"""

    action: str = Field(..., description="玩家或角色的动作")
    text: str = Field(..., description="该动作导致的台词或描写")
    speaker: str = Field(default="旁白", description="谁在说话")
    audioUrl: str = Field(default="", description="语音地址")