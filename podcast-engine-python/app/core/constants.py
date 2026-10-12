class ErrorCode:
    """对外错误码常量。

    唯一来源。exceptions.py 引用本类，不重复写字符串。
    """

    # 通用
    INVALID_REQUEST = "INVALID_REQUEST"
    UNAUTHORIZED = "UNAUTHORIZED"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # 配置 / 路由
    CONFIG_ERROR = "CONFIG_ERROR"
    MODEL_ALIAS_NOT_FOUND = "MODEL_ALIAS_NOT_FOUND"
    LLM_PROVIDER_NOT_FOUND = "LLM_PROVIDER_NOT_FOUND"
    TTS_PROVIDER_NOT_FOUND = "TTS_PROVIDER_NOT_FOUND"

    # LLM
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_OUTPUT_INVALID = "LLM_OUTPUT_INVALID"

    # Agent
    AGENT_PERSONA_BROKEN = "AGENT_PERSONA_BROKEN"

    # TTS
    TTS_FAILED = "TTS_FAILED"
    TTS_TIMEOUT = "TTS_TIMEOUT"


class Status:
    SUCCESS = "success"
    PENDING = "pending"
    FAILED = "failed"


class ProviderName:
    DASHSCOPE = "dashscope"
    DEEPSEEK = "deepseek"
    OPENAI = "openai"
    MOCK = "mock"


class ModelAlias:
    PLOT_PLANNER = "plot_planner"
    PODCASTER = "podcaster"
    FAST_CHEAP = "fast_cheap"
    JUDGE = "judge"