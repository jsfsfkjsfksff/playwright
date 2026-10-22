"""音色解析：把"标识"翻译成 TTS 引擎真正认的音色名。

这里有两件不同的事，别混：

1. **说话人 → 音色**（`VoiceMap`，配置在 `configs/voices.yaml`）：
   按世界线节点上的 `speaker` 名挑音色，避免所有角色一个声音。

2. **前端音色标识 → 百炼真实音色名**（`resolve_timbre_alias`，见文件末尾）：
   契约（前端交接文档）约定 `voiceName` 是"前端与后端约定的稳定标识"
   （如 `elder-warm`），**不是 TTS 引擎的真实发音人名** —— 映射是后端的责任。
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
    pitch: float = 1.0


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
        # 音调是 [0.5, 2.0] 的倍数（官方文档），不配就是原调 1.0
        pitch = 1.0 if pitch_raw is None else float(pitch_raw)
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


# ---------------------------------------------------------------------------
# 前端音色标识 → 百炼真实音色名
# ---------------------------------------------------------------------------

# 键是前端的 TimbreId（见 frontend/src/types/studio.ts 的 TIMBRE_OPTIONS），
# 值是 qwen-audio-3.1-tts-flash 官方音色列表里的 voice 参数（区分大小写）。
#
# 曾经缺这一层，导致前端标识被原样透传给百炼：服务端直接回
# 400 InvalidParameter「[cosyvoice:]Engine error [411]: TTS speak operation failed」，
# 音频一条都出不来 —— 因为百炼明确要求「所选音色必须属于当前模型支持的音色列表，
# 不能跨模型混用」。
#
# 取值是按前端标签的声线倾向挑的：
#   男声-磁性 → 睿智轻熟男；女声-温柔 → 知性温柔女（白晴岚）；童声 → 阳光男童声；
#   旁白-沉稳 → 稳重成熟、官方标注适用旁白；长者-温厚 → 沉稳质感（有声书）。
# 想换音色只改这里，前端与 Java 都不用动。
TIMBRE_ALIASES: dict[str, str] = {
    "male-magnetic": "longanzhi_v3.1",
    "female-gentle": "baiqinglan_v3.1",
    "child": "longniuniu_v3.1",
    "narrator-calm": "wenhuaizhi_v3.1",
    "elder-warm": "longsanshu_v3.1",
}


def resolve_timbre_alias(voice: str | None) -> str | None:
    """把前端音色标识翻译成真实音色名；未收录的取值**原样返回**。

    原样返回是有意的：直接传真实音色名（如 `longanhuan_v3.1`）也必须能用，
    否则调 TTS 就没法绕过这层映射做实验了。
    """
    if voice is None:
        return None
    return TIMBRE_ALIASES.get(voice.strip(), voice)
