from fastapi import APIRouter, Depends

from app.api.deps import get_tts_service
from app.domain.tts.models import TTSBatchRequest, TTSBatchResult
from app.services.tts_service import TTSService

router = APIRouter()

@router.post(
    "/tts",
    response_model=TTSBatchResult,
    summary="批量语音合成：文字 → 音频文件（供 Java 端调用）",
)
async def synthesize_batch(
    req: TTSBatchRequest,
    service: TTSService = Depends(get_tts_service),
) -> TTSBatchResult:
    """只做「文字 → 音频」，不碰剧情图、不写数据库。

    返回的 audioUrl 是相对路径（/static/audio/xxx.mp3），
    由 Java 端拼成完整地址后写进 Scene.audioUrl。
    """
    return TTSBatchResult(results=await service.synthesize_batch(req.inputs))