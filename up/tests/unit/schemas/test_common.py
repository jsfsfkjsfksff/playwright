"""统一响应结构测试。"""

import json

import pytest
from pydantic import ValidationError

from app.schemas.common import ErrorResponse


@pytest.mark.parametrize("missing", ["code", "message", "traceId"])
def test_required_fields(missing):
    """对外错误体的三个必填字段缺一不可。"""
    payload = {"code": "C", "message": "m", "traceId": "t"}
    payload.pop(missing)
    with pytest.raises(ValidationError):
        ErrorResponse(**payload)


def test_details_defaults_to_empty_and_is_independent():
    first = ErrorResponse(code="C", message="m", traceId="t")
    second = ErrorResponse(code="C", message="m", traceId="t")
    assert first.details == {}
    assert first.details is not second.details


def test_serialized_keys_are_camel_case():
    """traceId 是对外契约，序列化后不能变成 trace_id。"""
    dumped = ErrorResponse(code="C", message="m", traceId="t", details={"x": 1}).model_dump()
    assert set(dumped) == {"code", "message", "traceId", "details"}
    assert json.loads(json.dumps(dumped))["traceId"] == "t"
