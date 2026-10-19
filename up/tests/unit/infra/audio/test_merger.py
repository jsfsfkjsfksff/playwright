"""MP3 拼接器行为测试。"""

import pytest

from app.core.exceptions import AudioFormatUnsupportedException
from app.infra.audio.merger import (
    is_mp3,
    merge_mp3_segments,
    mp3_duration_ms,
    strip_id3v1,
    strip_id3v2,
    strip_tags,
)


def test_is_mp3_accepts_a_frame(mp3_kit):
    assert is_mp3(mp3_kit.frames(1))


def test_is_mp3_rejects_text():
    assert not is_mp3("这不是音频".encode())


def test_strip_id3v2_only_removes_leading_tag(mp3_kit):
    data = mp3_kit.id3v2(b"x" * 100) + mp3_kit.frames(1)
    assert strip_id3v2(data) == mp3_kit.frames(1)


def test_strip_id3v2_keeps_plain_audio(mp3_kit):
    audio = mp3_kit.frames(2)
    assert strip_id3v2(audio) == audio


def test_strip_id3v2_handles_footer_flag(mp3_kit):
    tag = bytearray(mp3_kit.id3v2(b"y" * 10))
    tag[5] = 0x10  # 带 footer 的标签
    data = bytes(tag) + b"\x00" * 10 + mp3_kit.frames(1)
    assert strip_id3v2(data) == mp3_kit.frames(1)


def test_strip_id3v1_removes_trailing_tag(mp3_kit):
    audio = mp3_kit.frames(1)
    assert strip_id3v1(audio + mp3_kit.id3v1()) == audio


def test_strip_tags_removes_both_ends(mp3_kit):
    audio = mp3_kit.frames(1)
    assert strip_tags(mp3_kit.id3v2() + audio + mp3_kit.id3v1()) == audio


def test_mp3_duration_counts_frames(mp3_kit):
    assert mp3_duration_ms(mp3_kit.frames(10)) == int(10 * mp3_kit.frame_ms)


def test_mp3_duration_resyncs_after_garbage(mp3_kit):
    assert mp3_duration_ms(b"\x00\x00" + mp3_kit.frames(4)) == int(4 * mp3_kit.frame_ms)


def test_mp3_duration_is_zero_when_unparsable():
    assert mp3_duration_ms(b"not an mp3 at all") == 0


def test_merge_concatenates_segments_in_order(mp3_kit):
    merged = merge_mp3_segments([mp3_kit.frames(1), mp3_kit.frames(2)])
    assert merged == mp3_kit.frames(3)
    assert mp3_duration_ms(merged) == int(3 * mp3_kit.frame_ms)


def test_merge_drops_intermediate_tags(mp3_kit):
    merged = merge_mp3_segments(
        [
            mp3_kit.id3v2(b"z" * 30) + mp3_kit.frames(1),
            mp3_kit.frames(1) + mp3_kit.id3v1(),
        ]
    )
    assert merged == mp3_kit.frames(2)


def test_merge_rejects_segment_without_frames(mp3_kit):
    with pytest.raises(AudioFormatUnsupportedException) as excinfo:
        merge_mp3_segments([mp3_kit.frames(1), b"<html>404</html>"])
    assert excinfo.value.details["index"] == 1
    assert excinfo.value.details["sizeBytes"] == len(b"<html>404</html>")


def test_merge_rejects_tag_only_segment(mp3_kit):
    with pytest.raises(AudioFormatUnsupportedException):
        merge_mp3_segments([mp3_kit.id3v2(b"only a tag")])
