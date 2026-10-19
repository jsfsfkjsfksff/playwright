"""说话人 -> 音色映射。

文档里的「语音档案」（POST /voices）记录在 Java 侧的图库里；Python 这边
用 configs/voices.yaml 把世界线节点上的 speaker 名映射成具体音色参数，
避免所有角色都用一个声音念。
"""

from dataclasses import dataclass
from pathlib import Path

import yaml

from app.core.config import settings
from app.core.exceptions import ConfigException
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class VoiceSpec:
    """一次合成要用到的音色参数。"""

    voice: str
    rate: float = 1.0
    pitch: float | None = None


class VoiceMap:
    """speaker 名 -> 音色；匹配不到就用 default。"""

    def __init__(
        self,
        default: VoiceSpec,
        speakers: dict[str, VoiceSpec] | None = None,
    ):
        self._default = default
        self._speakers = dict(speakers or {})

    @property
    def default(self) -> VoiceSpec:
        return self._default

    def resolve(self, speaker: str | None) -> VoiceSpec:
        if not speaker or not speaker.strip():
            return self._default
        return self._speakers.get(speaker.strip(), self._default)


def _spec_from(raw: object, field: str) -> VoiceSpec:
    """把 YAML 里的一段配置转成 VoiceSpec，缺字段用全局默认值补齐。"""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ConfigException(f"voices 配置的 {field} 应为对象")

    try:
        rate = float(raw.get("rate", settings.tts_default_rate))
        pitch_raw = raw.get("pitch")
        pitch = None if pitch_raw is None else float(pitch_raw)
    except (TypeError, ValueError) as e:
        raise ConfigException(f"voices 配置的 {field} 数值非法: {e}") from e

    return VoiceSpec(
        voice=str(raw.get("voice") or settings.tts_default_voice),
        rate=rate,
        pitch=pitch,
    )


def load_voice_map(path: Path | None = None) -> VoiceMap:
    """读取音色映射；文件不存在时退化成"所有角色都用默认音色"。"""
    file = path or settings.voices_path
    if not file.exists():
        logger.warning("voices_file_missing", path=str(file))
        return VoiceMap(default=_spec_from({}, "default"))

    raw = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ConfigException(f"voices 配置格式错误: {file}")

    speakers_raw = raw.get("speakers") or {}
    if not isinstance(speakers_raw, dict):
        raise ConfigException("voices 配置的 speakers 应为对象")

    return VoiceMap(
        default=_spec_from(raw.get("default"), "default"),
        speakers={
            name: _spec_from(cfg, f"speakers.{name}")
            for name, cfg in speakers_raw.items()
        },
    )
