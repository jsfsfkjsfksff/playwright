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

    # 世界线 LLM（configs/providers.yaml 的 aliyun_maas）。
    # 这里显式声明，是为了让 .env 里的 ALIYUN_MAAS_API_KEY 被 pydantic 读进来：
    # os.environ 里没有它，config_loader 读不到环境变量时会回落到这个字段。
    aliyun_maas_api_key: str = ""

    # ---------- TTS 通用参数 ----------
    # 音色取值见百炼「Qwen-Audio-TTS 音色列表」，不是 Azure 的 zh-CN-xxx 命名
    tts_default_voice: str = "longanhuan_v3.1"
    tts_default_rate: float = 1.0
    tts_timeout: float = 60.0
    # 批量合成并发上限：一次生成几十幕时不加限制会同时打出几十个请求，DashScope 会限流
    tts_max_concurrency: int = 4

    # Qwen-Audio-TTS：走「业务空间」专属域名，形如
    # https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1
    # 留空时 provider 会抛出明确的 ConfigException，而不是打到错误地址上
    dashscope_tts_base_url: str = ""
    dashscope_tts_model: str = "qwen-audio-3.1-tts-flash"
    dashscope_tts_api_key: str = ""

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
