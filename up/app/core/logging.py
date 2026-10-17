import logging
import sys
import uuid
from contextvars import ContextVar

import structlog

trace_id_ctx: ContextVar[str] = ContextVar("trace_id", default="-")


def new_trace_id() -> str:
    return uuid.uuid4().hex


def set_trace_id(trace_id: str | None = None) -> str:
    tid = trace_id or new_trace_id()
    trace_id_ctx.set(tid)
    return tid


def get_trace_id() -> str:
    return trace_id_ctx.get()


def _add_trace_id(_, __, event_dict: dict) -> dict:
    event_dict["traceId"] = trace_id_ctx.get()
    return event_dict


def configure_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _add_trace_id,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "app"):
    return structlog.get_logger(name)