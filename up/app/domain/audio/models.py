from pydantic import BaseModel, Field


class ExportAudioRequest(BaseModel):
    """Python 混音入参（由 Java 的 export 包调用 /api/audio/export 时发送）。"""

    audioUrls: list[str] = Field(
        ...,
        min_length=1,
        description="按收听顺序排列的人声地址（相对路径或完整 URL 均可）",
    )
    bgmUrl: str | None = Field(None, description="全篇 BGM 地址；为空表示不混 BGM")
    bgmVolumeDb: float | None = Field(
        None,
        description="BGM 衰减分贝（如 -15），为空则用默认值",
    )


class ExportAudioResult(BaseModel):
    """Python 混音结果。

    契约约定：Java 只认 `status == OK` 且 `error` 为空的结果，
    任何失败都必须带 `status=FAILED` + `error`，不允许返回半个成品。
    """

    status: str = Field(..., description="OK / FAILED")
    url: str | None = Field(None, description="相对媒体路径（如 static/exports/x.mp3）")
    filename: str | None = Field(None, description="结果文件名")
    segments: int = Field(0, description="参与拼接的人声片段数")
    sizeBytes: int = Field(0, description="结果文件大小（字节）")
    durationMs: int = Field(0, description="结果总时长（毫秒），解析失败时为 0")
    error: str | None = Field(None, description="失败原因；成功时为 null")
