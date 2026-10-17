from typing import Any

from app.core.constants import ErrorCode


# ---------- 基类 ----------
class AppException(Exception):
    """业务异常基类。"""

    code: str = ErrorCode.INTERNAL_ERROR
    http_status: int = 500
    message: str = "服务内部错误"

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message or self.message
        self.details = details or {}
        super().__init__(self.message)


# ---------- 通用 ----------
class InvalidRequestException(AppException):
    code = ErrorCode.INVALID_REQUEST
    http_status = 400
    message = "请求参数错误"


class UnauthorizedException(AppException):
    code = ErrorCode.UNAUTHORIZED
    http_status = 401
    message = "鉴权失败"


class NotFoundException(AppException):
    code = ErrorCode.NOT_FOUND
    http_status = 404
    message = "资源不存在"


# ---------- 配置 / 路由 ----------
class ConfigException(AppException):
    code = ErrorCode.CONFIG_ERROR
    http_status = 500
    message = "配置错误"


class ModelAliasNotFoundException(AppException):
    code = ErrorCode.MODEL_ALIAS_NOT_FOUND
    http_status = 500
    message = "未定义的 model_alias"


class LLMProviderNotFoundException(AppException):
    code = ErrorCode.LLM_PROVIDER_NOT_FOUND
    http_status = 500
    message = "未注册的大模型 provider"


class TTSProviderNotFoundException(AppException):
    code = ErrorCode.TTS_PROVIDER_NOT_FOUND
    http_status = 500
    message = "未注册的 TTS provider"


# ---------- LLM ----------
class LLMTimeoutException(AppException):
    code = ErrorCode.LLM_TIMEOUT
    http_status = 504
    message = "大模型超时"


class LLMOutputInvalidException(AppException):
    code = ErrorCode.LLM_OUTPUT_INVALID
    http_status = 500
    message = "大模型输出无法解析"


# ---------- Agent ----------
class AgentPersonaBrokenException(AppException):
    code = ErrorCode.AGENT_PERSONA_BROKEN
    http_status = 500
    message = "Agent 输出偏离播客主身份"


# ---------- TTS ----------
class TTSFailedException(AppException):
    code = ErrorCode.TTS_FAILED
    http_status = 500
    message = "TTS 合成失败"


class TTSTimeoutException(AppException):
    code = ErrorCode.TTS_TIMEOUT
    http_status = 504
    message = "TTS 服务超时"