from functools import lru_cache

from app.core.logging import get_logger
from app.infra.llm.gateway import LLMGateway, build_gateway
from app.services.agent_service import AgentService
from app.services.audio_export_service import AudioExportService
from app.services.tts_service import TTSService
from app.services.worldline_service import WorldlineService

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_llm_gateway() -> LLMGateway:
    return build_gateway()


@lru_cache(maxsize=1)
def get_agent_service() -> AgentService:
    return AgentService(llm=get_llm_gateway())


@lru_cache(maxsize=1)
def get_tts_service() -> TTSService:
    return TTSService()


def get_audio_export_service() -> AudioExportService:
    """音频导出服务无状态、无连接资源，不需要缓存也不需要停机释放。"""
    return AudioExportService()


@lru_cache(maxsize=1)
def get_worldline_service() -> WorldlineService:
    """世界线生成后会逐条合成语音，复用同一个 TTS 服务（连带它的连接池）。"""
    return WorldlineService(llm=get_llm_gateway(), tts=get_tts_service())


async def shutdown_services() -> None:
    """按依赖顺序反向释放资源。

    单个资源释放失败只记日志，不阻断后续资源。
    """
    # TTS
    if get_tts_service.cache_info().currsize > 0:
        try:
            await get_tts_service().aclose()
            logger.info("tts_service_closed")
        except Exception as e:
            logger.error("tts_service_close_failed", error=str(e), exc_info=True)

    # LLM
    if get_llm_gateway.cache_info().currsize > 0:
        try:
            await get_llm_gateway().aclose()
            logger.info("llm_gateway_closed")
        except Exception as e:
            logger.error("llm_gateway_close_failed", error=str(e), exc_info=True)

    # 清掉缓存引用，避免已关闭的实例被再次取用
    get_agent_service.cache_clear()
    get_tts_service.cache_clear()
    get_worldline_service.cache_clear()
    get_llm_gateway.cache_clear()
