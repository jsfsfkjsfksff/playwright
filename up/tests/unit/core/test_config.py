"""Settings 配置加载测试。"""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings

# 可能与断言冲突的环境变量：默认值测试前先清干净
ENV_NAMES = [
    "APP_NAME",
    "APP_VERSION",
    "DEBUG",
    "HOST",
    "PORT",
    "INTERNAL_TOKEN",
    "STATIC_DIR",
    "AUDIO_SUBDIR",
    "PROVIDERS_FILE",
    "MODEL_ROUTING_FILE",
    "LLM_TIMEOUT",
    "LLM_MAX_RETRIES",
    "TTS_DEFAULT_VOICE",
    "TTS_DEFAULT_RATE",
    "TTS_TIMEOUT",
    "TTS_MAX_CONCURRENCY",
    "DASHSCOPE_TTS_BASE_URL",
    "DASHSCOPE_TTS_MODEL",
    "DASHSCOPE_TTS_API_KEY",
    "AGENT_DEFAULT_MODEL_ALIAS",
]


@pytest.fixture
def clean_env(monkeypatch):
    """清掉同名环境变量，保证断言的是真实默认值。"""
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


def test_defaults(clean_env):
    """默认值：不读 .env，只认默认。"""
    config = Settings(_env_file=None)
    assert config.app_name == "podcast-engine-python"
    assert config.app_version == "0.1.0"
    assert config.debug is False
    assert config.host == "0.0.0.0"
    assert config.port == 8000
    assert config.internal_token == "change-me"
    assert config.static_dir == "static"
    assert config.audio_subdir == "audio"
    assert config.providers_file == "configs/providers.yaml"
    assert config.model_routing_file == "configs/model_routing.yaml"
    assert config.llm_timeout == 60.0
    assert config.llm_max_retries == 3
    assert config.tts_timeout == 60.0
    assert config.tts_default_voice == "longanhuan_v3.1"
    assert config.tts_default_rate == 1.0
    assert config.tts_max_concurrency == 4
    # Qwen-Audio-TTS 的域名含业务空间 ID，无法给默认值；密钥同理
    assert config.dashscope_tts_base_url == ""
    assert config.dashscope_tts_model == "qwen-audio-3.1-tts-flash"
    assert config.dashscope_tts_api_key == ""
    assert config.agent_default_model_alias == "podcaster"


def test_env_overrides_defaults(monkeypatch):
    """环境变量覆盖默认值，并完成类型转换。"""
    monkeypatch.setenv("APP_NAME", "podcast-engine-test")
    monkeypatch.setenv("PORT", "9911")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("LLM_TIMEOUT", "12.5")
    config = Settings(_env_file=None)
    assert config.app_name == "podcast-engine-test"
    assert config.port == 9911
    assert config.debug is True
    assert config.llm_timeout == 12.5


def test_env_names_are_case_insensitive(monkeypatch):
    """case_sensitive=False：小写变量名同样生效。"""
    monkeypatch.setenv("app_name", "lower-case")
    assert Settings(_env_file=None).app_name == "lower-case"


def test_init_args_beat_env(monkeypatch):
    """显式入参优先级高于环境变量。"""
    monkeypatch.setenv("APP_NAME", "from-env")
    assert Settings(_env_file=None, app_name="explicit").app_name == "explicit"


def test_unknown_keys_are_ignored(monkeypatch):
    """extra=ignore：无关的环境变量和入参不会让配置构造失败。"""
    monkeypatch.setenv("TOTALLY_UNRELATED_ENV", "1")
    config = Settings(_env_file=None, unknown_key=1)
    assert config.app_name


def test_env_file_is_loaded(monkeypatch, tmp_path):
    """指定 env_file 时从文件读取。"""
    monkeypatch.delenv("APP_NAME", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("APP_NAME=from-env-file\nPORT=9999\n", encoding="utf-8")
    config = Settings(_env_file=env_file)
    assert config.app_name == "from-env-file"
    assert config.port == 9999


def test_invalid_bool_env_raises(monkeypatch):
    """DEBUG 不是布尔字面量时直接报错（现状行为，注意别在生产环境里设奇怪的值）。"""
    monkeypatch.setenv("DEBUG", "release")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_path_properties_defaults(clean_env):
    """路径属性由字符串字段派生。"""
    config = Settings(_env_file=None)
    assert config.static_path == Path("static")
    assert config.audio_path == Path("static") / "audio"
    assert config.providers_path == Path("configs/providers.yaml")
    assert config.model_routing_path == Path("configs/model_routing.yaml")


def test_path_properties_follow_custom_values():
    """自定义 static_dir / audio_subdir 后路径跟着变。"""
    config = Settings(static_dir="public", audio_subdir="mp3")
    assert config.static_path == Path("public")
    assert config.audio_path == Path("public/mp3")


def test_module_level_singleton_is_settings():
    """模块级 settings 是单例实例，供全项目共享。"""
    assert isinstance(settings, Settings)
    assert settings is not Settings(_env_file=None)
