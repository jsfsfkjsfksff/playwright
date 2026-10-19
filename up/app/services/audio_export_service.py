"""音频导出服务：把人声片段按顺序拼成一个文件（可选混入 BGM）。"""

from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from app.core.config import settings
from app.core.exceptions import (
    AudioMergeFailedException,
    AudioSegmentMissingException,
    InvalidRequestException,
)
from app.core.logging import get_logger
from app.domain.audio.models import ExportAudioRequest, ExportAudioResult
from app.infra.audio.merger import merge_mp3_segments, mp3_duration_ms

logger = get_logger(__name__)

# 契约：Python 只回相对路径，绝对 URL 由 Java 的 MediaUrlResolver 拼
_STATIC_URL_PREFIX = "static"


class AudioExportService:
    """拼接服务：读取本地片段 -> 拼接 -> 落盘到 static/exports。"""

    def __init__(
        self,
        static_dir: str | Path | None = None,
        export_subdir: str | None = None,
    ):
        self._static_dir = Path(static_dir or settings.static_dir)
        self._export_subdir = export_subdir or settings.export_subdir

    def export(self, req: ExportAudioRequest) -> ExportAudioResult:
        if req.bgmUrl:
            # MP3 混音需要解码 + 重采样，纯字节拼接做不到；本机也没有 ffmpeg。
            # 契约要求失败时明确回 FAILED，绝不能返回"只有人声"的半成品。
            return ExportAudioResult(
                status="FAILED",
                error="BGM 混音尚未实现：当前环境没有 ffmpeg，无法把人声与 BGM 合成",
            )

        segments = [self._read_segment(url) for url in req.audioUrls]
        merged = merge_mp3_segments(segments)
        filename = self._write(merged)

        result = ExportAudioResult(
            status="OK",
            url=f"{_STATIC_URL_PREFIX}/{self._export_subdir}/{filename}",
            filename=filename,
            segments=len(segments),
            sizeBytes=len(merged),
            durationMs=mp3_duration_ms(merged),
        )
        logger.info(
            "audio_exported",
            segments=result.segments,
            sizeBytes=result.sizeBytes,
            durationMs=result.durationMs,
            filename=filename,
        )
        return result

    # ---------- 内部实现 ----------

    def _to_local_path(self, audio_url: str) -> Path:
        """把 static/xxx、/static/xxx、http://host/static/xxx 统一解析成本地文件。"""
        static_root = self._static_dir.resolve()
        path = unquote(urlparse(audio_url).path).replace("\\", "/").lstrip("/")

        prefix = f"{_STATIC_URL_PREFIX}/"
        if path.startswith(prefix):
            path = path[len(prefix):]
        elif path.startswith(_STATIC_URL_PREFIX) and path == _STATIC_URL_PREFIX:
            path = ""

        if not path:
            raise InvalidRequestException(
                "音频地址不能为空",
                details={"audioUrl": audio_url},
            )

        target = (static_root / path).resolve()
        if target != static_root and static_root not in target.parents:
            raise InvalidRequestException(
                "音频地址越出了静态目录",
                details={"audioUrl": audio_url},
            )
        return target

    def _read_segment(self, audio_url: str) -> bytes:
        path = self._to_local_path(audio_url)
        if not path.is_file():
            raise AudioSegmentMissingException(
                "待拼接的音频片段不存在",
                details={"audioUrl": audio_url, "path": str(path)},
            )
        return path.read_bytes()

    def _write(self, data: bytes) -> str:
        filename = f"export-{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:6]}.mp3"
        target = self._static_dir / self._export_subdir / filename
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        except OSError as e:
            raise AudioMergeFailedException(
                "导出音频写入失败",
                details={"filename": filename, "error": str(e)},
            ) from e
        return filename
