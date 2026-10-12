"""异常层级测试。"""

import pytest

from app.core.constants import ErrorCode
from app.core.exceptions import (
    AgentPersonaBrokenException,
    AppException,
    ConfigException,
    InvalidRequestException,
    LLMOutputInvalidException,
    LLMProviderNotFoundException,
    LLMTimeoutException,
    ModelAliasNotFoundException,
    NotFoundException,
    TTSFailedException,
    TTSProviderNotFoundException,
    TTSTimeoutException,
    UnauthorizedException,
)

# (异常类, 期望错误码, 期望 HTTP 状态码)
SUBCLASSES = [
    (InvalidRequestException, ErrorCode.INVALID_REQUEST, 400),
    (UnauthorizedException, ErrorCode.UNAUTHORIZED, 401),
    (NotFoundException, ErrorCode.NOT_FOUND, 404),
    (ConfigException, ErrorCode.CONFIG_ERROR, 500),
    (ModelAliasNotFoundException, ErrorCode.MODEL_ALIAS_NOT_FOUND, 500),
    (LLMProviderNotFoundException, ErrorCode.LLM_PROVIDER_NOT_FOUND, 500),
    (LLMTimeoutException, ErrorCode.LLM_TIMEOUT, 504),
    (LLMOutputInvalidException, ErrorCode.LLM_OUTPUT_INVALID, 500),
    (AgentPersonaBrokenException, ErrorCode.AGENT_PERSONA_BROKEN, 500),
    (TTSProviderNotFoundException, ErrorCode.TTS_PROVIDER_NOT_FOUND, 500),
    (TTSFailedException, ErrorCode.TTS_FAILED, 500),
    (TTSTimeoutException, ErrorCode.TTS_TIMEOUT, 504),
]


@pytest.mark.parametrize(
    "exc_cls, code, http_status",
    SUBCLASSES,
    ids=[cls.__name__ for cls, _, _ in SUBCLASSES],
)
def test_subclass_code_and_http_status(exc_cls, code, http_status):
    """每个子类都带齐错误码、HTTP 状态码和默认文案。"""
    exc = exc_cls()
    assert isinstance(exc, AppException)
    assert exc.code == code
    assert exc.http_status == http_status
    assert exc.message
    assert exc.details == {}


def test_base_defaults():
    """基类默认错误码、状态码与文案。"""
    exc = AppException()
    assert exc.code == ErrorCode.INTERNAL_ERROR
    assert exc.http_status == 500
    assert exc.message == "服务内部错误"
    assert exc.details == {}
    assert str(exc) == "服务内部错误"


def test_custom_message_and_details():
    """自定义 message 和 details 覆盖默认值。"""
    exc = TTSFailedException("自定义消息", details={"a": 1})
    assert exc.message == "自定义消息"
    assert exc.details == {"a": 1}
    assert str(exc) == "自定义消息"


def test_empty_message_falls_back_to_default():
    """空字符串 message 回落到类默认文案（现状行为）。"""
    assert TTSFailedException("").message == "TTS 合成失败"


def test_details_are_not_shared_between_instances():
    """details 默认值必须是每实例独立的对象，不能共享可变默认值。"""
    first, second = TTSFailedException(), TTSFailedException()
    assert first.details is not second.details
    first.details["x"] = 1
    assert second.details == {}


def test_raisable_and_catchable_as_base():
    """异常可正常 raise，并按基类捕获。"""
    with pytest.raises(AppException) as info:
        raise InvalidRequestException("bad", details={"field": "text"})
    assert info.value.code == ErrorCode.INVALID_REQUEST
    assert info.value.details == {"field": "text"}


def test_every_error_code_is_used_by_an_exception():
    """ErrorCode 里的每个错误码都要有异常类能带出来，防止加码不接线。"""
    declared = {
        value
        for name, value in vars(ErrorCode).items()
        if not name.startswith("_") and isinstance(value, str)
    }
    covered = {cls().code for cls, _, _ in SUBCLASSES} | {AppException().code}
    assert covered == declared
