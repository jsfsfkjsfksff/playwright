"""音频导出服务测试（契约：相对路径 + FAILED 语义）。"""

import pytest

from app.core.exceptions import (
    AudioFormatUnsupportedException,
    AudioSegmentMissingException,
    InvalidRequestException,
)
from app.domain.audio.models import ExportAudioRequest
from app.services.audio_export_service import AudioExportService


@pytest.fixture
def service(tmp_path):
    return AudioExportService(static_dir=tmp_path)


def test_export_writes_relative_path_under_static(service, tmp_path, mp3_kit):
    mp3_kit.write_file(tmp_path / "audio" / "a.mp3", count=2)
    mp3_kit.write_file(tmp_path / "audio" / "b.mp3", count=3)

    result = service.export(
        ExportAudioRequest(audioUrls=["static/audio/a.mp3", "/static/audio/b.mp3"])
    )

    assert result.status == "OK"
    assert result.error is None
    assert result.url == f"static/exports/{result.filename}"
    assert not result.url.startswith("/")
    assert result.segments == 2
    # 段与段之间会插入静音间隔，所以体积/时长都比纯首尾相接更大
    assert result.sizeBytes > 5 * mp3_kit.frame_size
    assert result.durationMs > int(5 * mp3_kit.frame_ms)

    exported = (tmp_path / "exports" / result.filename).read_bytes()
    assert exported.startswith(mp3_kit.frames(2))
    assert exported.endswith(mp3_kit.frames(3))


def test_absolute_url_with_static_path_is_accepted(service, tmp_path, mp3_kit):
    mp3_kit.write_file(tmp_path / "audio" / "a.mp3", count=1)

    result = service.export(
        ExportAudioRequest(audioUrls=["http://localhost:8000/static/audio/a.mp3"])
    )

    assert result.status == "OK"
    assert result.segments == 1


def test_bgm_request_fails_without_half_product(service, tmp_path, mp3_kit):
    mp3_kit.write_file(tmp_path / "audio" / "a.mp3", count=1)

    result = service.export(
        ExportAudioRequest(
            audioUrls=["static/audio/a.mp3"],
            bgmUrl="static/audio/bgm.mp3",
        )
    )

    assert result.status == "FAILED"
    assert result.error
    assert result.url is None
    assert not (tmp_path / "exports").exists()


def test_missing_segment_raises(service):
    with pytest.raises(AudioSegmentMissingException):
        service.export(ExportAudioRequest(audioUrls=["static/audio/nope.mp3"]))


def test_path_traversal_is_rejected(service):
    with pytest.raises(InvalidRequestException):
        service.export(ExportAudioRequest(audioUrls=["static/../secret.mp3"]))


def test_non_audio_segment_is_rejected(service, tmp_path):
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir(parents=True)
    (audio_dir / "fake.mp3").write_bytes(b"<html>not audio</html>")

    with pytest.raises(AudioFormatUnsupportedException):
        service.export(ExportAudioRequest(audioUrls=["static/audio/fake.mp3"]))
