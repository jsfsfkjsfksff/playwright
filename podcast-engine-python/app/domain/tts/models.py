from pydantic import BaseModel, Field


class TTSInput(BaseModel):
    """TTS 合成输入。"""

    text: str = Field(..., min_length=1, description="待合成文本")
    voice: str = Field("zh-CN-xiaoxiao", description="音色")
    rate: float = Field(1.0, ge=0.5, le=2.0, description="语速")
    format: str = Field("mp3", description="音频格式")


class AudioResult(BaseModel):
    """TTS 合成结果。"""

    audioUrl: str = Field(..., description="可访问音频 URL")
    durationMs: int = Field(..., description="音频时长（毫秒）")
    localPath: str = Field(..., description="本地文件路径")
    format: str = Field("mp3", description="音频格式")