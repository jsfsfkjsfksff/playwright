from pydantic import BaseModel, Field


class NarrateInput(BaseModel):
    """Agent 叙事输入。"""

    plotEvent: str = Field(..., description="逻辑事件")
    podcasterPersona: str = Field(..., description="播客主人设")
    userDirective: str | None = Field(None, description="用户额外指令")


class NarrateResult(BaseModel):
    """Agent 叙事输出。"""

    script: str = Field(..., description="口语化播客脚本")
    emotion: str | None = Field(None, description="情绪标签，可选")