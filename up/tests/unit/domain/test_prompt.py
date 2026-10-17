"""播客主 System Prompt 加载测试。"""

import pytest

from app.core.exceptions import ConfigException
from app.domain.agent import prompt as prompt_module
from app.domain.agent.prompt import load_podcaster_system_prompt


def test_loads_real_prompt():
    """真实 prompt 文件可加载、非空、已去首尾空白。"""
    text = load_podcaster_system_prompt()
    assert text
    assert text == text.strip()
    assert "播客" in text


def test_prompt_path_points_into_app_prompts():
    path = prompt_module._PODCASTER_PROMPT_FILE
    assert path.name == "podcaster_system.md"
    assert path.parent.name == "prompts"
    assert path.parent.parent.name == "app"


def test_missing_file_raises_config_error(monkeypatch, tmp_path):
    monkeypatch.setattr(prompt_module, "_PODCASTER_PROMPT_FILE", tmp_path / "missing.md")
    with pytest.raises(ConfigException) as info:
        load_podcaster_system_prompt()
    assert "不存在" in info.value.message


def test_content_is_stripped(monkeypatch, tmp_path):
    path = tmp_path / "podcaster_system.md"
    path.write_text("\n\n  场景说明  \n\n", encoding="utf-8")
    monkeypatch.setattr(prompt_module, "_PODCASTER_PROMPT_FILE", path)
    assert load_podcaster_system_prompt() == "场景说明"
