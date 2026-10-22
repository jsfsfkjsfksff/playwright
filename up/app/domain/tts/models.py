from pydantic import BaseModel, Field


class TTSInput(BaseModel):
    """TTS 合成输入。"""

    text: str = Field(..., min_length=1, description="待合成文本")
    voice: str = Field(
        "longanhuan_v3.1",
        description="音色，取值见百炼 Qwen-Audio-TTS 音色列表",
    )
    rate: float = Field(1.0, ge=0.5, le=2.0, description="语速")
    pitch: float = Field(1.0, ge=0.5, le=2.0, description="音调（倍数，1.0 为原调）")
    instruction: str | None = Field(
        None,
        description="情感/角色/方言控制指令，如“语气低沉、疲惫、语速偏慢”",
    )
    format: str = Field("mp3", description="音频格式：mp3 / pcm / wav / opus")


class AudioResult(BaseModel):
    """TTS 合成结果。"""

    audioUrl: str = Field(
        ...,
        description="相对媒体路径（如 static/audio/x.mp3），对外 URL 由 Java 的 MediaUrlResolver 拼",
    )
    durationMs: int = Field(..., description="音频时长（毫秒）")
    localPath: str = Field(..., description="本地文件路径")
    format: str = Field("mp3", description="音频格式")


class TTSBatchRequest(BaseModel):
    """批量合成请求：整段剧情一次往返配完，避免 N 次 HTTP。"""

    inputs: list[TTSInput] = Field(..., min_length=1, description="待合成列表")


class TTSBatchResult(BaseModel):
    """批量合成结果。"""

    results: list[AudioResult] = Field(..., description="合成结果，与请求同序")
