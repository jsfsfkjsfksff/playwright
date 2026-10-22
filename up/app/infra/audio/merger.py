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

# 导出时相邻两段之间的静音间隔：太短听起来像抢话，太长又会拖节奏
DEFAULT_SEGMENT_GAP_MS = 800

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


def _silent_gap(previous_body: bytes, gap_ms: int) -> bytes:
    """按前一片段的帧参数，生成约 gap_ms 长的静音帧序列。

    MP3 没有「空字节即静音」的概念：直接填零字节会破坏帧同步。
    这里复制前一帧的帧头（清掉 padding 位保证帧长自洽），数据区全 0 ——
    侧信息与 main_data 全零会被解码器还原成静音，且不产生爆音。
    """
    if gap_ms <= 0:
        return b""

    frame = _frame_at(previous_body, 0)
    if frame is None:
        return b""

    frame_size, samples, sample_rate = frame
    header = bytearray(previous_body[:4])
    padding = (header[2] >> 1) & 0x01
    header[2] &= 0xFD  # padding = 0，静音帧长度才和帧头声明一致
    silent_size = frame_size - padding

    frame_ms = samples * 1000.0 / sample_rate
    frame_count = max(1, round(gap_ms / frame_ms))
    silent_frame = bytes(header) + bytes(silent_size - 4)
    return silent_frame * frame_count


def merge_mp3_segments(
    segments: list[bytes],
    gap_ms: int = DEFAULT_SEGMENT_GAP_MS,
) -> bytes:
    """按顺序拼接多个 MP3 片段，并在片段之间插入自然停顿。

    任一片段识别不出 MP3 帧都会抛 AudioFormatUnsupportedException：
    宁可让调用方收到明确错误，也不要把非音频内容混进结果里。

    `gap_ms` 是相邻两段的静音间隔，默认 800ms（对话/旁白之间听起来不赶）。
    传 0 则退化为原来的纯字节首尾相接。
    """
    merged = bytearray()
    previous_body: bytes | None = None

    for index, raw in enumerate(segments):
        body = strip_tags(raw)
        if _frame_at(body, 0) is None:
            raise AudioFormatUnsupportedException(
                f"第 {index + 1} 段不是有效的 MP3 音频",
                details={"index": index, "sizeBytes": len(raw)},
            )

        if previous_body is not None:
            merged.extend(_silent_gap(previous_body, gap_ms))

        merged.extend(body)
        previous_body = body

    return bytes(merged)
