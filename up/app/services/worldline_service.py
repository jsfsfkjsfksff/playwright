from app.core.constants import ModelAlias
from app.core.logging import get_logger
from app.domain.worldline.models import (
    InterpolateRequest,
    TrellisGraphResponse,
    WorldlineNode,
)
from app.domain.worldline.planner import LLMChatProtocol, WorldlinePlanner
from app.services.tts_service import TTSService

logger = get_logger(__name__)


class WorldlineService:
    """世界线服务：封装 WorldlinePlanner，并给图里的每个节点补上语音。"""

    def __init__(
        self,
        llm: LLMChatProtocol,
        tts: TTSService | None = None,
        model_alias: str = ModelAlias.WORLDLINE,
    ):
        self._planner = WorldlinePlanner(llm=llm, model_alias=model_alias)
        self._tts = tts

    async def generate_worldline(self, req: InterpolateRequest) -> TrellisGraphResponse:
        graph = await self._planner.plan(req)
        await self._attach_audio(graph.nodes)
        return graph

    async def _attach_audio(self, nodes: list[WorldlineNode]) -> None:
        """给每个新生成的节点补上 audioUrl（相对路径，见契约 §3.2）。

        - 必经锚点（isMandatory）在 Java 侧复用的是库里已有场景，自带音频，跳过；
        - 单条合成失败只留空 audioUrl 并记日志：剧情照常返回，
          不能因为 TTS 抽风就让整次插值失败。
        """
        if self._tts is None:
            logger.warning("worldline_tts_not_configured", nodes=len(nodes))
            return

        targets = [
            node
            for node in nodes
            if node.text.strip() and not node.isMandatory and not node.audioUrl
        ]
        if not targets:
            return

        inputs = [self._tts.build_input(node.text, node.speaker) for node in targets]
        logger.info("worldline_tts_begin", segments=len(inputs))

        results = await self._tts.synthesize_many(inputs)
        for node, audio in zip(targets, results):
            if audio is not None:
                node.audioUrl = audio.audioUrl

        logger.info(
            "worldline_tts_done",
            segments=len(inputs),
            with_audio=sum(1 for node in targets if node.audioUrl),
        )
