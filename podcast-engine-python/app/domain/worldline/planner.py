import json
from typing import Protocol

from app.core.constants import ModelAlias
from app.core.logging import get_logger
from app.domain.worldline.models import InterpolateRequest, WorldlineNode
from app.infra.llm.base import LLMResult

logger = get_logger(__name__)


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


def _build_prompt(req: InterpolateRequest) -> str:
    """【核心】：要求大模型运用 HTN 思想，一次性深度优先生成整条线，确保逻辑连贯。"""
    return f"""
    你是一个 Galgame 叙事规划器。请你根据以下条件，生成一条顺理成章的线性剧情。
    【起点】：{req.startText}
    【终点】：{req.endText}
    【创作者大纲】：{req.outline}
    【要求中间过渡层数】：{req.layers}层

    请严格输出一个包含 {req.layers} 个元素的 JSON 数组，补全起点到终点的空白。
    【强制格式要求】不要任何解释，纯 JSON 数组，格式如下：
    [
        {{"action": "角色采取的具体行动", "text": "这段行动导致的台词或描写...", "speaker": "说话人名字", "audioUrl": ""}}
    ]
    """


class WorldlinePlanner:
    """世界线规划器：把两个锚点场景之间的空白补全为一条线性剧情。"""

    def __init__(
        self,
        llm: LLMChatProtocol,
        model_alias: str = ModelAlias.WORLDLINE,
    ):
        self._llm = llm
        self._model_alias = model_alias

    async def plan(self, req: InterpolateRequest) -> list[WorldlineNode]:
        messages = [
            {"role": "system", "content": "你是一个只输出 JSON 数组的机器。"},
            {"role": "user", "content": _build_prompt(req)},
        ]

        try:
            logger.info("worldline_planning", layers=req.layers)
            result = await self._llm.chat(
                model_alias=self._model_alias,
                messages=messages,
                temperature=0.7,
            )
            worldline = self._parse(result.content)
            logger.info("worldline_planned", nodes=len(worldline))
            return worldline
        except Exception as e:
            logger.error("worldline_planning_failed", error=str(e))
            # 如果大模型抽风，返回一个降级节点防止 Java 崩溃
            return [
                WorldlineNode(
                    action="系统错误",
                    text="世界线推演崩溃",
                    speaker="System",
                    audioUrl="",
                )
            ]

    @staticmethod
    def _parse(raw_text: str) -> list[WorldlineNode]:
        text = raw_text.strip()

        # 暴力清洗可能存在的 Markdown 代码块标记（如 ```json ... ```）
        if text.startswith("```"):
            text = text.strip("`").removeprefix("json").strip()

        nodes_data = json.loads(text)

        worldline: list[WorldlineNode] = []
        for item in nodes_data:
            worldline.append(
                WorldlineNode(
                    action=item.get("action", "继续"),
                    text=item.get("text", ""),
                    speaker=item.get("speaker", "旁白"),
                    audioUrl="",  # 下一步，这里将接入 TTS 生成本地音频
                )
            )

        return worldline