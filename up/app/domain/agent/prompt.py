from pathlib import Path

from app.core.exceptions import ConfigException

_PROMPT_DIR = Path(__file__).resolve().parents[2] / "prompts"
_PODCASTER_PROMPT_FILE = _PROMPT_DIR / "podcaster_system.md"


def load_podcaster_system_prompt() -> str:
    """加载播客主 System Prompt。

    进程内可以缓存，因为文件不会在运行时变化。
    """
    if not _PODCASTER_PROMPT_FILE.exists():
        raise ConfigException(f"播客主 prompt 文件不存在: {_PODCASTER_PROMPT_FILE}")
    return _PODCASTER_PROMPT_FILE.read_text(encoding="utf-8").strip()