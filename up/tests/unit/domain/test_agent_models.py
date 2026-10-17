"""Agent 领域模型测试。"""

import pytest
from pydantic import ValidationError

from app.domain.agent.models import NarrateInput, NarrateResult


def test_narrate_input_field_names_are_camel_case():
    """字段名是对外契约，保持 camelCase。"""
    assert set(NarrateInput.model_fields) == {
        "plotEvent",
        "podcasterPersona",
        "userDirective",
    }


def test_narrate_input_requires_plot_event_and_persona():
    with pytest.raises(ValidationError):
        NarrateInput(podcasterPersona="人设")
    with pytest.raises(ValidationError):
        NarrateInput(plotEvent="事件")


def test_narrate_input_user_directive_is_optional():
    assert NarrateInput(plotEvent="事件", podcasterPersona="人设").userDirective is None
    req = NarrateInput(plotEvent="事件", podcasterPersona="人设", userDirective="结尾留悬念")
    assert req.userDirective == "结尾留悬念"


def test_narrate_result_shape():
    result = NarrateResult(script="稿子")
    assert result.script == "稿子"
    assert result.emotion is None
    assert NarrateResult(script="稿子", emotion="calm").emotion == "calm"
    with pytest.raises(ValidationError):
        NarrateResult()
