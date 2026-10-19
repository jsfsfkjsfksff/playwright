from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------- 服务 ----------
    app_name: str = "podcast-engine-python"
    app_version: str = "0.1.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # ---------- 鉴权 ----------
    internal_token: str = "change-me"

    # ---------- 静态资源 ----------
    static_dir: str = "static"
    audio_subdir: str = "audio"
    export_subdir: str = "exports"

    # ---------- 配置文件路径 ----------
    providers_file: str = "configs/providers.yaml"
    model_routing_file: str = "configs/model_routing.yaml"
    voices_file: str = "configs/voices.yaml"

    # ---------- LLM 通用参数 ----------
    llm_timeout: float = 60.0
    llm_max_retries: int = 3

    # ---------- TTS 通用参数 ----------
    tts_default_voice: str = "zh-CN-xiaoxiao"
    tts_default_rate: float = 1.0
    tts_timeout: float = 60.0

    # ---------- TTS provider（DashScope 原生接口） ----------
    dashscope_tts_api_key: str | None = None
    dashscope_tts_base_url: str = "https://dashscope.aliyuncs.com"
    dashscope_tts_model: str = "qwen-tts"

    # ---------- Agent ----------
    agent_default_model_alias: str = "podcaster"

    # ---------- 路径辅助 ----------
    @property
    def static_path(self) -> Path:
        return Path(self.static_dir)

    @property
    def audio_path(self) -> Path:
        return Path(self.static_dir) / self.audio_subdir

    @property
    def export_path(self) -> Path:
        return Path(self.static_dir) / self.export_subdir

    @property
    def voices_path(self) -> Path:
        return Path(self.voices_file)

    @property
    def providers_path(self) -> Path:
        return Path(self.providers_file)

    @property
    def model_routing_path(self) -> Path:
        return Path(self.model_routing_file)


settings = Settings()
