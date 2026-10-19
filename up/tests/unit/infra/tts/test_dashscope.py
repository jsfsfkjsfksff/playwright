"""DashScope TTS provider 测试。"""

import asyncio
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

from app.core.exceptions import ConfigException, TTSFailedException, TTSTimeoutException
from app.domain.tts.models import TTSInput
from app.infra.tts import dashscope as dsp
from app.infra.tts.dashscope import DashScopeTTSProvider

AUDIO_URL = "https://cdn.invalid/a.mp3"
API_PATH = "/services/aigc/multimodal-generation/generation"


@pytest.fixture(autouse=True)
def _no_retry_wait(monkeypatch):
    """把 tenacity 退避改成 0，避免测试真的 sleep。"""
    monkeypatch.setattr(dsp, "wait_exponential", lambda **_: 0)


@pytest.fixture
def provider(tmp_path):
    return DashScopeTTSProvider(
        api_key="key",
        base_url="https://dashscope.invalid",
        model="qwen-tts",
        output_dir=tmp_path,
        timeout=5.0,
    )


def _response(status_code: int = 200, payload: dict | None = None, content: bytes = b""):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload or {}
    response.content = content
    response.text = str(payload or {})
    return response


def _audio_payload(**output_overrides) -> dict:
    output = {"audio_url": AUDIO_URL, "duration_ms": 1500}
    output.update(output_overrides)
    return {"output": output}


@pytest.mark.anyio
async def test_synthesize_success(provider, patch_httpx, tmp_path):
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(content=b"ID3-bytes")

    result = await provider.synthesize(TTSInput(text="各位听众"))

    assert post.await_count == 1
    assert post.call_args.args[0] == f"https://dashscope.invalid{API_PATH}"
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer key"
    payload = post.call_args.kwargs["json"]
    assert payload["model"] == "qwen-tts"
    assert payload["input"]["text"] == "各位听众"
    assert payload["parameters"]["voice"] == "zh-CN-xiaoxiao"

    assert result.durationMs == 1500
    assert result.format == "mp3"
    assert result.audioUrl.startswith("static/audio/")
    assert result.audioUrl.endswith(".mp3")
    saved = Path(result.localPath)
    assert saved.parent == tmp_path
    assert saved.read_bytes() == b"ID3-bytes"
    assert result.audioUrl.endswith(f"/{saved.name}")


@pytest.mark.anyio
@pytest.mark.parametrize("key", ["audio_url", "audioUrl", "url"])
async def test_audio_url_field_variants(provider, patch_httpx, key):
    _, post, get = patch_httpx
    post.return_value = _response(payload={"output": {key: AUDIO_URL}})
    get.return_value = _response(content=b"audio")

    result = await provider.synthesize(TTSInput(text="各位听众"))
    assert result.audioUrl.startswith("static/audio/")


@pytest.mark.anyio
async def test_duration_is_estimated_when_missing(provider, patch_httpx):
    _, post, get = patch_httpx
    post.return_value = _response(payload={"output": {"audio_url": AUDIO_URL}})
    get.return_value = _response(content=b"audio")

    result = await provider.synthesize(TTSInput(text="四个汉字"))
    assert result.durationMs == 4 * 250


@pytest.mark.anyio
async def test_missing_audio_url_raises_and_retries(provider, patch_httpx, monkeypatch):
    monkeypatch.setattr(dsp.settings, "llm_max_retries", 2)
    _, post, _ = patch_httpx
    post.return_value = _response(payload={"output": {}})

    with pytest.raises(TTSFailedException) as info:
        await provider.synthesize(TTSInput(text="各位听众"))
    assert "未返回音频 URL" in info.value.message
    assert post.await_count == 2


@pytest.mark.anyio
async def test_http_error_status_raises_with_body(provider, patch_httpx, monkeypatch):
    monkeypatch.setattr(dsp.settings, "llm_max_retries", 1)
    _, post, _ = patch_httpx
    post.return_value = _response(status_code=429, payload={"message": "rate limited"})

    with pytest.raises(TTSFailedException) as info:
        await provider.synthesize(TTSInput(text="各位听众"))
    assert info.value.details["body"]
    assert post.await_count == 1


@pytest.mark.anyio
async def test_post_timeout_is_not_retried(provider, patch_httpx):
    _, post, _ = patch_httpx
    post.side_effect = httpx.TimeoutException("too slow")

    with pytest.raises(TTSTimeoutException) as info:
        await provider.synthesize(TTSInput(text="各位听众", voice="zh-CN-yunxi"))
    assert info.value.details["voice"] == "zh-CN-yunxi"
    assert post.await_count == 1


@pytest.mark.anyio
async def test_transport_error_is_retried_then_succeeds(provider, patch_httpx):
    _, post, get = patch_httpx
    post.side_effect = [httpx.ConnectError("boom"), _response(payload=_audio_payload())]
    get.return_value = _response(content=b"audio")

    result = await provider.synthesize(TTSInput(text="各位听众"))
    assert result.durationMs == 1500
    assert post.await_count == 2


@pytest.mark.anyio
async def test_download_timeout_raises(provider, patch_httpx):
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.side_effect = httpx.TimeoutException("slow download")

    with pytest.raises(TTSTimeoutException) as info:
        await provider.synthesize(TTSInput(text="各位听众"))
    assert "下载音频超时" in info.value.message


@pytest.mark.anyio
async def test_download_failure_raises_with_url(provider, patch_httpx):
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(status_code=404)

    with pytest.raises(TTSFailedException) as info:
        await provider.synthesize(TTSInput(text="各位听众"))
    assert info.value.details["audioUrl"] == AUDIO_URL


@pytest.mark.anyio
@pytest.mark.parametrize(
    "kwargs, env_name",
    [
        ({"api_key": None}, "DASHSCOPE_TTS_API_KEY"),
        ({"base_url": None}, None),
        ({"model": None}, None),
    ],
)
async def test_missing_config_raises_before_request(
    tmp_path, patch_httpx, kwargs, env_name
):
    defaults = {
        "api_key": "key",
        "base_url": "https://dashscope.invalid",
        "model": "qwen-tts",
        "output_dir": tmp_path,
    }
    defaults.update(kwargs)
    provider = DashScopeTTSProvider(**defaults)
    _, post, _ = patch_httpx

    with pytest.raises(ConfigException) as info:
        await provider.synthesize(TTSInput(text="各位听众"))
    if env_name:
        assert info.value.details["env"] == env_name
    post.assert_not_awaited()


@pytest.mark.anyio
async def test_client_is_created_once_under_concurrency(provider, spy_httpx):
    """并发首用时也只建一个连接池（懒加载 + 锁）。"""
    clients = await asyncio.gather(*(provider._get_client() for _ in range(5)))
    assert len(spy_httpx.created) == 1
    assert all(client is clients[0] for client in clients)


@pytest.mark.anyio
async def test_aclose_closes_client_and_allows_rebuild(provider, spy_httpx):
    first = await provider._get_client()
    await provider.aclose()

    spy_httpx.created[0].aclose.assert_awaited_once()
    assert provider._client is None

    second = await provider._get_client()
    assert second is not first
    assert len(spy_httpx.created) == 2
    await provider.aclose()


@pytest.mark.anyio
async def test_aclose_without_client_is_noop(provider):
    await provider.aclose()


def test_output_dir_is_created_on_init(tmp_path):
    target = tmp_path / "nested" / "audio"
    DashScopeTTSProvider(
        api_key="key",
        base_url="https://dashscope.invalid",
        model="qwen-tts",
        output_dir=target,
    )
    assert target.is_dir()


@pytest.mark.anyio
async def test_audio_url_is_relative_per_contract(provider, patch_httpx):
    """契约 §3.2：Python 只回相对路径，绝对 URL 由 Java 的 MediaUrlResolver 拼。"""
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(content=b"ID3-bytes")

    result = await provider.synthesize(TTSInput(text="各位听众"))

    assert result.audioUrl.startswith("static/audio/")
    assert not result.audioUrl.startswith("/")
    assert "http://" not in result.audioUrl


@pytest.mark.anyio
async def test_wav_bytes_get_wav_suffix(provider, patch_httpx):
    """服务端给的是 wav 时后缀要跟着变，不能按请求里的 mp3 写死。"""
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(content=b"RIFF" + b"\x00" * 4 + b"WAVEfmt ")

    result = await provider.synthesize(TTSInput(text="各位听众", format="mp3"))

    assert result.format == "wav"
    assert result.audioUrl.endswith(".wav")
    assert Path(result.localPath).suffix == ".wav"


@pytest.mark.anyio
async def test_format_falls_back_to_url_suffix(provider, patch_httpx):
    """字节认不出来时，用下载地址的后缀兜底。"""
    _, post, get = patch_httpx
    post.return_value = _response(payload={"output": {"audio_url": "https://cdn.invalid/b.wav"}})
    get.return_value = _response(content=b"unknown-bytes")

    result = await provider.synthesize(TTSInput(text="各位听众", format="mp3"))

    assert result.format == "wav"


@pytest.mark.anyio
async def test_pitch_is_forwarded_when_set(provider, patch_httpx):
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(content=b"ID3-bytes")

    await provider.synthesize(TTSInput(text="各位听众", pitch=-2.0))

    assert post.call_args.kwargs["json"]["parameters"]["pitch"] == -2.0


@pytest.mark.anyio
async def test_pitch_is_absent_when_not_set(provider, patch_httpx):
    _, post, get = patch_httpx
    post.return_value = _response(payload=_audio_payload())
    get.return_value = _response(content=b"ID3-bytes")

    await provider.synthesize(TTSInput(text="各位听众"))

    assert "pitch" not in post.call_args.kwargs["json"]["parameters"]
