"""TTS 服务测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import TTSProviderNotFoundException
from app.domain.tts.models import AudioResult, TTSInput
from app.infra.tts.registry import TTSRegistry
from app.services.tts_service import TTSService

INPUT = TTSInput(text="各位听众")


def _provider(name: str = "dashscope"):
    provider = MagicMock()
    provider.name = name
    provider.synthesize = AsyncMock(
        return_value=AudioResult(
            audioUrl=f"/static/audio/{name}.mp3", durationMs=1000, localPath=f"/tmp/{name}"
        )
    )
    provider.aclose = AsyncMock(return_value=None)
    return provider


def _service(*providers, provider_name: str = "dashscope") -> TTSService:
    registry = TTSRegistry()
    for provider in providers:
        registry.register(provider)
    return TTSService(registry=registry, provider_name=provider_name)


@pytest.mark.anyio
async def test_synthesize_delegates_to_current_provider():
    primary, secondary = _provider("dashscope"), _provider("genie")
    result = await _service(primary, secondary).synthesize(INPUT)

    primary.synthesize.assert_awaited_once_with(INPUT)
    secondary.synthesize.assert_not_awaited()
    assert result.audioUrl == "/static/audio/dashscope.mp3"


@pytest.mark.anyio
async def test_use_provider_switches_target():
    primary, secondary = _provider("dashscope"), _provider("genie")
    service = _service(primary, secondary)

    service.use_provider("genie")
    await service.synthesize(INPUT)

    secondary.synthesize.assert_awaited_once()
    primary.synthesize.assert_not_awaited()


def test_use_unknown_provider_raises_and_keeps_current():
    service = _service(_provider("dashscope"))
    with pytest.raises(TTSProviderNotFoundException):
        service.use_provider("nope")
    assert service.provider.name == "dashscope"


def test_unknown_default_provider_raises_on_access():
    service = _service(_provider("genie"), provider_name="nope")
    with pytest.raises(TTSProviderNotFoundException):
        service.provider


@pytest.mark.anyio
async def test_synthesize_batch_keeps_order_and_calls_each_input():
    provider = _provider("dashscope")
    provider.synthesize = AsyncMock(
        side_effect=lambda req: AudioResult(
            audioUrl=f"/static/audio/{req.text}.mp3", durationMs=1, localPath="x"
        )
    )
    inputs = [TTSInput(text=text) for text in ("a", "b", "c")]

    results = await _service(provider).synthesize_batch(inputs)

    assert [r.audioUrl for r in results] == [
        "/static/audio/a.mp3",
        "/static/audio/b.mp3",
        "/static/audio/c.mp3",
    ]
    assert provider.synthesize.await_count == 3


@pytest.mark.anyio
async def test_aclose_closes_every_provider():
    primary, secondary = _provider("dashscope"), _provider("genie")
    await _service(primary, secondary).aclose()

    primary.aclose.assert_awaited_once()
    secondary.aclose.assert_awaited_once()


@pytest.mark.anyio
async def test_aclose_continues_after_provider_failure():
    """回归：单个 provider 关不掉不能连累其它 provider。"""
    primary, secondary = _provider("dashscope"), _provider("genie")
    primary.aclose = AsyncMock(side_effect=RuntimeError("close boom"))

    await _service(primary, secondary).aclose()

    secondary.aclose.assert_awaited_once()


@pytest.mark.anyio
async def test_aclose_with_empty_registry():
    await _service().aclose()
