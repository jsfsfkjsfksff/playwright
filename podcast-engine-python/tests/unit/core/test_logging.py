"""日志与 traceId 测试。"""

import json
import logging

import pytest

from app.core.logging import (
    _add_trace_id,
    configure_logging,
    get_logger,
    get_trace_id,
    new_trace_id,
    set_trace_id,
    trace_id_ctx,
)


@pytest.fixture(autouse=True)
def _isolate_structlog():
    """每个用例前后都恢复默认日志级别，避免污染其它用例。"""
    yield
    configure_logging(debug=False)


@pytest.fixture(autouse=True)
def _reset_trace_id():
    """每个用例结束后恢复 contextvar，避免串味。"""
    token = trace_id_ctx.set("-")
    yield
    trace_id_ctx.reset(token)


def test_new_trace_id_is_unique_hex():
    ids = {new_trace_id() for _ in range(100)}
    assert len(ids) == 100
    assert all(len(tid) == 32 for tid in ids)
    assert all(int(tid, 16) >= 0 for tid in ids)


def test_default_trace_id():
    assert get_trace_id() == "-"


def test_set_trace_id_keeps_incoming_value():
    assert set_trace_id("abc123") == "abc123"
    assert get_trace_id() == "abc123"


def test_set_trace_id_generates_when_missing():
    generated = set_trace_id()
    assert generated == get_trace_id()
    assert len(generated) == 32


def test_add_trace_id_processor_injects_current_trace():
    set_trace_id("trace-xyz")
    event_dict = _add_trace_id(None, None, {"event": "hello"})
    assert event_dict["traceId"] == "trace-xyz"


def test_log_output_is_json_with_trace_id(capsys):
    """structlog 输出 JSON，且自动带上 traceId。"""
    configure_logging(debug=False)
    set_trace_id("trace-123")
    get_logger("test_logging_json").info("hello", key="value")

    line = [ln for ln in capsys.readouterr().out.splitlines() if ln.strip()][-1]
    record = json.loads(line)
    assert record["event"] == "hello"
    assert record["level"] == "info"
    assert record["traceId"] == "trace-123"
    assert record["key"] == "value"
    assert record["timestamp"]


def test_chinese_is_not_escaped(capsys):
    """ensure_ascii=False：中文日志保持可读。"""
    configure_logging(debug=False)
    get_logger("test_logging_chinese").info("播客文稿生成失败")
    assert "播客文稿生成失败" in capsys.readouterr().out


def test_debug_flag_controls_debug_records(capsys):
    """debug=False 过滤 debug 级别，debug=True 放行。"""
    configure_logging(debug=False)
    get_logger("test_logging_quiet").debug("quiet-debug")
    assert "quiet-debug" not in capsys.readouterr().out

    configure_logging(debug=True)
    get_logger("test_logging_loud").debug("loud-debug")
    assert "loud-debug" in capsys.readouterr().out


def test_logging_level_mapping(monkeypatch):
    """debug 标志映射到标准库级别：True→DEBUG，False→INFO。"""
    calls: list[dict] = []
    monkeypatch.setattr(logging, "basicConfig", lambda **kwargs: calls.append(kwargs))

    configure_logging(debug=True)
    assert calls[-1]["level"] == logging.DEBUG

    configure_logging(debug=False)
    assert calls[-1]["level"] == logging.INFO
