"""纯音频（MP3）拼接：不依赖 ffmpeg / pydub 的字节级实现。

把一条世界线路径上各节点的音频片段按顺序首尾相接成一个 MP3，
并去掉夹在中间的 ID3 标签，保证结果能被任意播放器直接播放。

前提：各片段由同一个 TTS 音色产出，采样率 / 声道一致。
"""

from app.core.exceptions import AudioFormatUnsupportedException
from app.core.logging import get_logger

logger = get_logger(__name__)

_ID3V2_HEADER_SIZE = 10
_ID3V1_SIZE = 128

# MPEG 版本（帧头中的 version 位）-> 采样率表
_SAMPLE_RATES = {
    3: (44100, 48000, 32000),  # MPEG 1
    2: (22050, 24000, 16000),  # MPEG 2
    0: (11025, 12000, 8000),   # MPEG 2.5
}
# Layer III 码率表（kbps），下标即帧头里的 bitrate index
_BITRATES_V1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0)
_BITRATES_V2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0)
_SAMPLES_PER_FRAME_V1 = 1152
_SAMPLES_PER_FRAME_V2 = 576


def _synchsafe(value: bytes) -> int:
    """ID3v2 的长度由 4 个 7 位字节拼成。"""
    return (value[0] << 21) | (value[1] << 14) | (value[2] << 7) | value[3]


def strip_id3v2(data: bytes) -> bytes:
    """去掉开头的 ID3v2 标签。"""
    if len(data) < _ID3V2_HEADER_SIZE or not data.startswith(b"ID3"):
        return data

    tag_size = _ID3V2_HEADER_SIZE + _synchsafe(data[6:10])
    if data[5] & 0x10:  # 带 footer
        tag_size += _ID3V2_HEADER_SIZE
    return data[tag_size:] if tag_size < len(data) else b""


def strip_id3v1(data: bytes) -> bytes:
    """去掉结尾的 ID3v1 标签（最后 128 字节）。"""
    if len(data) >= _ID3V1_SIZE and data[-_ID3V1_SIZE:-_ID3V1_SIZE + 3] == b"TAG":
        return data[:-_ID3V1_SIZE]
    return data


def strip_tags(data: bytes) -> bytes:
    """去掉文件级标签，只留音频帧。"""
    return strip_id3v1(strip_id3v2(data))


def _frame_at(data: bytes, offset: int) -> tuple[int, int, int] | None:
    """解析 offset 处的 MP3 帧头，返回 (帧长, 每帧采样数, 采样率)；不是帧头则返回 None。"""
    if offset + 4 > len(data):
        return None
    if data[offset] != 0xFF or (data[offset + 1] & 0xE0) != 0xE0:
        return None

    version = (data[offset + 1] >> 3) & 0x03
    layer = (data[offset + 1] >> 1) & 0x03
    bitrate_index = (data[offset + 2] >> 4) & 0x0F
    sample_rate_index = (data[offset + 2] >> 2) & 0x03
    padding = (data[offset + 2] >> 1) & 0x01

    # version == 1 是保留值；layer != 1 表示不是 Layer III；后两个索引 0/15/3 是非法值
    if version == 1 or layer != 1 or sample_rate_index == 3 or bitrate_index in (0, 15):
        return None

    bitrate = (_BITRATES_V1 if version == 3 else _BITRATES_V2)[bitrate_index] * 1000
    sample_rate = _SAMPLE_RATES[version][sample_rate_index]
    samples = _SAMPLES_PER_FRAME_V1 if version == 3 else _SAMPLES_PER_FRAME_V2
    frame_size = samples // 8 * bitrate // sample_rate + padding
    return frame_size, samples, sample_rate


def is_mp3(data: bytes) -> bool:
    """去掉标签后能否在开头识别出一个 MP3 帧。"""
    return _frame_at(strip_tags(data), 0) is not None


def mp3_duration_ms(data: bytes) -> int:
    """逐帧累加时长；一帧都识别不出来时返回 0。"""
    body = strip_tags(data)
    offset = 0
    total_ms = 0.0
    frames = 0

    while offset + 4 <= len(body):
        frame = _frame_at(body, offset)
        if frame is None:
            offset += 1  # 容错：跳过脏字节，重新对齐帧头
            continue
        frame_size, samples, sample_rate = frame
        total_ms += samples * 1000.0 / sample_rate
        frames += 1
        offset += frame_size

    if frames == 0:
        logger.warning("mp3_duration_unparsable", sizeBytes=len(data))
    return int(total_ms)


def merge_mp3_segments(segments: list[bytes]) -> bytes:
    """按顺序拼接多个 MP3 片段。

    任一片段识别不出 MP3 帧都会抛 AudioFormatUnsupportedException：
    宁可让调用方收到明确错误，也不要把非音频内容混进结果里。
    """
    merged = bytearray()
    for index, raw in enumerate(segments):
        body = strip_tags(raw)
        if _frame_at(body, 0) is None:
            raise AudioFormatUnsupportedException(
                f"第 {index + 1} 段不是有效的 MP3 音频",
                details={"index": index, "sizeBytes": len(raw)},
            )
        merged.extend(body)
    return bytes(merged)
