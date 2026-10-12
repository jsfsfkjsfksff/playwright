from app.core.constants import ModelAlias
from app.domain.agent.models import NarrateInput, NarrateResult
from app.domain.agent.podcaster import LLMClientProtocol, Podcaster


class AgentService:
    """Agent 服务：封装 Podcaster，供上层编排调用。"""

    def __init__(
        self,
        llm: LLMClientProtocol,
        model_alias: str = ModelAlias.PODCASTER,
    ):
        self._podcaster = Podcaster(llm=llm, model_alias=model_alias)

    async def narrate(self, req: NarrateInput) -> NarrateResult:
        return await self._podcaster.narrate(req)