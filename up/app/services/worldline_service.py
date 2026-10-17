from app.core.constants import ModelAlias
from app.domain.worldline.models import InterpolateRequest, TrellisGraphResponse
from app.domain.worldline.planner import LLMChatProtocol, WorldlinePlanner


class WorldlineService:
    """世界线服务：封装 WorldlinePlanner，供上层编排调用。"""

    def __init__(
        self,
        llm: LLMChatProtocol,
        model_alias: str = ModelAlias.WORLDLINE,
    ):
        self._planner = WorldlinePlanner(llm=llm, model_alias=model_alias)

    async def generate_worldline(self, req: InterpolateRequest) -> TrellisGraphResponse:
        return await self._planner.plan(req)