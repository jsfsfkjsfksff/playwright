from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """统一错误响应结构。"""

    code: str = Field(..., description="业务错误码")
    message: str = Field(..., description="人类可读错误信息")
    traceId: str = Field(..., description="全链路追踪 ID")
    details: dict = Field(default_factory=dict, description="附加信息")