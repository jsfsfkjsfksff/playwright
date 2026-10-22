"""TTS 领域模型测试。"""

import pytest
from pydantic import ValidationError

from app.domain.tts.models import AudioResult, TTSInput


def test_tts_input_defaults():
    req = TTSInput(text="各位听众")
    assert req.voice == "longanhuan_v3.1"
    assert req.rate == 1.0
    assert req.pitch == 1.0
    assert req.instruction is None
    assert req.format == "mp3"


def test_tts_input_rejects_blank_text():
    with pytest.raises(ValidationError):
        TTSInput(text="")


@pytest.mark.parametrize("rate", [0.5, 1.0, 2.0])
def test_tts_input_rate_accepts_bounds(rate):
    assert TTSInput(text="文本", rate=rate).rate == rate


@pytest.mark.parametrize("rate", [0.49, 2.01])
def test_tts_input_rate_rejects_out_of_range(rate):
    with pytest.raises(ValidationError):
        TTSInput(text="文本", rate=rate)


@pytest.mark.parametrize("pitch", [0.5, 1.0, 2.0])
def test_tts_input_pitch_accepts_bounds(pitch):
    assert TTSInput(text="文本", pitch=pitch).pitch == pitch


@pytest.mark.parametrize("pitch", [0.49, 2.01])
def test_tts_input_pitch_rejects_out_of_range(pitch):
    """音调是倍数语义（1.0 为原调），不是 Azure 那种 -12~+12 的半音偏移。"""
    with pytest.raises(ValidationError):
        TTSInput(text="文本", pitch=pitch)


def test_audio_result_shape():
    result = AudioResult(audioUrl="/static/audio/a.mp3", durationMs=1200, localPath="x")
    assert result.format == "mp3"
    with pytest.raises(ValidationError):
        AudioResult(audioUrl="/static/audio/a.mp3", durationMs=1200)
