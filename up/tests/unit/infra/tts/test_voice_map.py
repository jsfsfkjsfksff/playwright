"""音色映射测试。"""

from pathlib import Path

import pytest
import yaml

from app.core.config import settings
from app.core.exceptions import ConfigException
from app.infra.tts.voice_map import load_voice_map


def _write(tmp_path: Path, data: object) -> Path:
    path = tmp_path / "voices.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return path


def test_speaker_gets_its_own_voice(tmp_path):
    path = _write(
        tmp_path,
        {
            "default": {"voice": "zh-CN-xiaoxiao", "rate": 1.0},
            "speakers": {"少女": {"voice": "zh-CN-xiaoyi", "rate": 1.1, "pitch": -2.5}},
        },
    )

    spec = load_voice_map(path).resolve("少女")

    assert spec.voice == "zh-CN-xiaoyi"
    assert spec.rate == 1.1
    assert spec.pitch == -2.5


@pytest.mark.parametrize("speaker", [None, "", "   ", "没配过的角色"])
def test_unknown_speaker_falls_back_to_default(tmp_path, speaker):
    path = _write(
        tmp_path,
        {
            "default": {"voice": "zh-CN-xiaoxiao", "rate": 1.0},
            "speakers": {"少女": {"voice": "zh-CN-xiaoyi"}},
        },
    )

    assert load_voice_map(path).resolve(speaker).voice == "zh-CN-xiaoxiao"


def test_pitch_is_none_when_not_configured(tmp_path):
    path = _write(tmp_path, {"speakers": {"少女": {"voice": "zh-CN-xiaoyi"}}})
    assert load_voice_map(path).resolve("少女").pitch is None


def test_missing_file_degrades_to_global_defaults(tmp_path):
    """没有配置文件不该报错，所有角色都用 TTS_DEFAULT_VOICE。"""
    voice_map = load_voice_map(tmp_path / "not-there.yaml")

    assert voice_map.default.voice == settings.tts_default_voice
    assert voice_map.resolve("少女").voice == settings.tts_default_voice


def test_missing_default_section_uses_global_defaults(tmp_path):
    path = _write(tmp_path, {"speakers": {"少女": {"voice": "zh-CN-xiaoyi"}}})
    voice_map = load_voice_map(path)

    assert voice_map.default.voice == settings.tts_default_voice
    assert voice_map.resolve("路人甲").rate == settings.tts_default_rate


@pytest.mark.parametrize(
    "data",
    [
        ["not", "a", "mapping"],
        {"speakers": "should be a mapping"},
        {"default": "should be a mapping"},
        {"speakers": {"少女": {"rate": "快"}}},
    ],
)
def test_invalid_shape_raises_config_error(tmp_path, data):
    path = _write(tmp_path, data)

    with pytest.raises(ConfigException):
        load_voice_map(path)
