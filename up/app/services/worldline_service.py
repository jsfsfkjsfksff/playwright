from app.core.constants import ModelAlias
from app.domain.worldline.models import InterpolateRequest, TrellisGraphResponse
from app.domain.worldline.planner import LLMChatProtocol, WorldlinePlanner


class WorldlineService:
    """世界线服务：封装 WorldlinePlanner，供上层编排调用。

    只负责出文本剧情。节点音频由 Java 侧在生成落库前统一调 /api/ai/tts 回填
    （契约「服务地址与音频文件存储约定」：Scene.audioUrl 的唯一写入者是 Java）。
    """

    def __init__(
        self,
        llm: LLMChatProtocol,
        model_alias: str = ModelAlias.WORLDLINE,
    ):
        self._planner = WorldlinePlanner(llm=llm, model_alias=model_alias)

    async def generate_worldline(self, req: InterpolateRequest) -> TrellisGraphResponse:
        return await self._planner.plan(req)