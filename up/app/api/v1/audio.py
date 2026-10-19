from fastapi import APIRouter, Depends

from app.api.deps import get_audio_export_service
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.domain.audio.models import ExportAudioRequest, ExportAudioResult
from app.services.audio_export_service import AudioExportService

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/export",
    response_model=ExportAudioResult,
    summary="拼接人声片段（可选混入 BGM），返回相对媒体路径（供 Java 端调用）",
)
def export_audio(
    req: ExportAudioRequest,
    service: AudioExportService = Depends(get_audio_export_service),
) -> ExportAudioResult:
    """按 audioUrls 的顺序拼成单个文件。

    同步 def：本地文件 IO + 逐帧字节处理，交给 Starlette 线程池执行。
    业务失败一律回 `status=FAILED` + `error`，由 Java 侧判定为失败，
    绝不返回"只拼了一半"的成品。
    """
    try:
        return service.export(req)
    except AppException as e:
        logger.warning("audio_export_failed", code=e.code, message=e.message)
        return ExportAudioResult(status="FAILED", error=e.message)
