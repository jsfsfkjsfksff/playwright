"""OpenAI 兼容适配器测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import BaseModel

from app.core.exceptions import LLMOutputInvalidException, LLMTimeoutException
from app.infra.llm.adapters import openai_compat as oc

MESSAGES = [{"role": "user", "content": "hi"}]


class _Draft(BaseModel):
    script: str
    emotion: str | None = None


@pytest.fixture(autouse=True)
def _no_retry_wait(monkeypatch):
    """把 tenacity 退避改成 0，避免测试真的 sleep。"""
    monkeypatch.setattr(oc, "wait_exponential", lambda **_: 0)


@pytest.mark.anyio
async def test_chat_returns_result(openai_adapter, patch_openai_create, fake_openai_response):
    patch_openai_create.return_value = fake_openai_response(content="你好", model="qwen-plus")

    result = await openai_adapter.chat(model="qwen-plus", messages=MESSAGES)

    assert result.content == "你好"
    assert result.model == "qwen-plus"
    assert result.provider == "dashscope"
    assert result.usage is None


@pytest.mark.anyio
async def test_chat_includes_usage_when_present(
    openai_adapter, patch_openai_create, fake_openai_response
):
    response = fake_openai_response(content="x")
    response.usage = MagicMock()
    response.usage.model_dump.return_value = {"total_tokens": 7}
    patch_openai_create.return_value = response

    result = await openai_adapter.chat(model="m", messages=MESSAGES)
    assert result.usage == {"total_tokens": 7}


@pytest.mark.anyio
async def test_chat_forwards_payload(
    openai_adapter, patch_openai_create, fake_openai_response
):
    patch_openai_create.return_value = fake_openai_response(content="x")

    await openai_adapter.chat(
        model="m",
        messages=MESSAGES,
        temperature=0.1,
        response_format={"type": "json_object"},
        max_tokens=32,
    )

    kwargs = patch_openai_create.call_args.kwargs
    assert kwargs["model"] == "m"
    assert kwargs["messages"] == MESSAGES
    assert kwargs["temperature"] == 0.1
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["max_tokens"] == 32


@pytest.mark.anyio
async def test_chat_omits_response_format_by_default(
    openai_adapter, patch_openai_create, fake_openai_response
):
    patch_openai_create.return_value = fake_openai_response(content="x")
    await openai_adapter.chat(model="m", messages=MESSAGES)
    assert "response_format" not in patch_openai_create.call_args.kwargs
    assert patch_openai_create.call_args.kwargs["temperature"] == 0.7


@pytest.mark.anyio
async def test_empty_choices_raises(openai_adapter, patch_openai_create, fake_openai_response):
    response = fake_openai_response(content="x")
    response.choices = []
    patch_openai_create.return_value = response

    with pytest.raises(LLMOutputInvalidException) as info:
        await openai_adapter.chat(model="m", messages=MESSAGES)
    assert "choices" in info.value.message


@pytest.mark.anyio
async def test_empty_content_raises(openai_adapter, patch_openai_create, fake_openai_response):
    patch_openai_create.return_value = fake_openai_response(content="")

    with pytest.raises(LLMOutputInvalidException) as info:
        await openai_adapter.chat(model="m", messages=MESSAGES)
    assert "为空" in info.value.message


@pytest.mark.anyio
async def test_timeout_error_becomes_timeout_exception(openai_adapter, patch_openai_create):
    openai_adapter._max_retries = 1
    patch_openai_create.side_effect = Exception("Request timeout")

    with pytest.raises(LLMTimeoutException) as info:
        await openai_adapter.chat(model="qwen-plus", messages=MESSAGES)
    assert info.value.details["model"] == "qwen-plus"
    assert patch_openai_create.await_count == 1


@pytest.mark.anyio
async def test_retries_then_succeeds(openai_adapter, patch_openai_create, fake_openai_response):
    patch_openai_create.side_effect = [
        RuntimeError("boom"),
        fake_openai_response(content="ok"),
    ]

    result = await openai_adapter.chat(model="m", messages=MESSAGES)
    assert result.content == "ok"
    assert patch_openai_create.await_count == 2


@pytest.mark.anyio
async def test_retries_are_exhausted_then_reraise(openai_adapter, patch_openai_create):
    patch_openai_create.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        await openai_adapter.chat(model="m", messages=MESSAGES)
    assert patch_openai_create.await_count == openai_adapter._max_retries


@pytest.mark.anyio
async def test_aclose_closes_underlying_client(openai_adapter):
    await openai_adapter.aclose()
    assert openai_adapter._client.is_closed() is True


@pytest.mark.anyio
async def test_aclose_swallows_errors(openai_adapter, monkeypatch):
    monkeypatch.setattr(
        openai_adapter._client, "close", AsyncMock(side_effect=RuntimeError("close boom"))
    )
    await openai_adapter.aclose()


@pytest.mark.anyio
async def test_structured_uses_json_schema_first(
    openai_adapter, patch_openai_create, fake_openai_response
):
    patch_openai_create.return_value = fake_openai_response(
        content='{"script": "s", "emotion": "calm"}'
    )

    result = await openai_adapter.structured(model="m", messages=MESSAGES, schema=_Draft)

    assert result == _Draft(script="s", emotion="calm")
    assert patch_openai_create.await_count == 1
    response_format = patch_openai_create.call_args.kwargs["response_format"]
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["name"] == "_Draft"
    assert patch_openai_create.call_args.kwargs["temperature"] == 0.2


@pytest.mark.anyio
async def test_structured_falls_back_to_json_object(
    openai_adapter, patch_openai_create, fake_openai_response
):
    patch_openai_create.side_effect = [
        fake_openai_response(content="not json"),
        fake_openai_response(content='{"script": "s"}'),
    ]

    result = await openai_adapter.structured(model="m", messages=MESSAGES, schema=_Draft)

    assert result.script == "s"
    assert patch_openai_create.await_count == 2
    assert patch_openai_create.call_args_list[1].kwargs["response_format"] == {
        "type": "json_object"
    }


@pytest.mark.anyio
async def test_structured_falls_back_to_plain_prompt(
    openai_adapter, patch_openai_create, fake_openai_response
):
    patch_openai_create.side_effect = [
        fake_openai_response(content="not json"),
        fake_openai_response(content="still not json"),
        fake_openai_response(content='{"script": "s"}'),
    ]

    result = await openai_adapter.structured(model="m", messages=MESSAGES, schema=_Draft)

    assert result.script == "s"
    assert patch_openai_create.await_count == 3
    assert "response_format" not in patch_openai_create.call_args_list[2].kwargs


@pytest.mark.anyio
async def test_structured_all_levels_fail(openai_adapter, patch_openai_create, fake_openai_response):
    patch_openai_create.return_value = fake_openai_response(content="not json")

    with pytest.raises(LLMOutputInvalidException) as info:
        await openai_adapter.structured(model="m", messages=MESSAGES, schema=_Draft)
    assert info.value.details["schema"] == "_Draft"
    assert patch_openai_create.await_count == 3
