"""全局 fixture。

原则：
- 不写 MockAdapter 类，用 AsyncMock / monkeypatch 代替。
- 外部依赖（openai、httpx）一律 monkeypatch。
- 配置文件用 tmp_path 生成，隔离真实仓库。
"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml

from app.infra.llm.adapters.openai_compat import OpenAICompatAdapter


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """仓库根目录（tests/conftest.py 的上一级）。"""
    return Path(__file__).resolve().parents[1]


@pytest.fixture
def fake_openai_response():
    """构造一个假的 OpenAI chat.completions.create 返回对象。

    用法：
        fake_openai_response(content='{"script": "..."}')
    """

    def _make(content: str, model: str = "qwen-plus"):
        choice = MagicMock()
        choice.message.content = content
        choice.finish_reason = "stop"

        resp = MagicMock()
        resp.choices = [choice]
        resp.model = model
        resp.usage = None
        return resp

    return _make


@pytest.fixture
def openai_adapter(monkeypatch):
    """返回一个未连网的 OpenAICompatAdapter。

    对 AsyncOpenAI.chat.completions.create 打桩，可通过
    adapter._client.chat.completions.create 覆盖。
    """
    adapter = OpenAICompatAdapter(
        provider="dashscope",
        base_url="http://localhost",
        api_key="test-key",
        timeout=5.0,
        max_retries=2,
    )
    return adapter


@pytest.fixture
def patch_openai_create(monkeypatch, openai_adapter):
    """把 adapter 的 chat.completions.create 替换为 AsyncMock。

    返回这个 mock，测试里可以设置 return_value / side_effect。
    """
    mock_create = AsyncMock()
    monkeypatch.setattr(
        openai_adapter._client.chat.completions,
        "create",
        mock_create,
    )
    return mock_create


@pytest.fixture
def patch_httpx(monkeypatch):
    """替换 httpx.AsyncClient，返回可控的 mock client。

    返回 (mock_client, mock_post, mock_get) 三元组，
    其中 mock_client 是 AsyncClient 类的替换结果。
    """
    mock_post = AsyncMock()
    mock_get = AsyncMock()

    mock_client = MagicMock()
    mock_client.post = mock_post
    mock_client.get = mock_get
    mock_client.aclose = AsyncMock()

    def _factory(*args, **kwargs):
        return mock_client

    monkeypatch.setattr(
        "app.infra.tts.dashscope.httpx.AsyncClient",
        _factory,
    )
    return mock_client, mock_post, mock_get


@pytest.fixture
def spy_httpx(monkeypatch):
    """替换 httpx.AsyncClient，每次构造返回独立 mock 并记录构造结果。

    返回 SimpleNamespace(created, posts, gets)：
    len(created) 即 AsyncClient 的实际构造次数，用于验证连接池复用。
    """
    created: list[MagicMock] = []

    def _factory(*args, **kwargs):
        client = MagicMock()
        client.post = AsyncMock()
        client.get = AsyncMock()
        client.aclose = AsyncMock()
        created.append(client)
        return client

    monkeypatch.setattr(
        "app.infra.tts.dashscope.httpx.AsyncClient",
        _factory,
    )
    return SimpleNamespace(
        created=created,
        posts=[c.post for c in created],
        gets=[c.get for c in created],
    )


@pytest.fixture
def make_adapter():
    """造一个不联网的假 LLM 适配器（AsyncMock 打桩）。"""

    def _make(provider: str, chat_result=None, structured_result=None):
        adapter = MagicMock()
        adapter.provider = provider
        adapter.chat = AsyncMock(return_value=chat_result)
        adapter.structured = AsyncMock(return_value=structured_result)
        adapter.aclose = AsyncMock(return_value=None)
        return adapter

    return _make


@pytest.fixture
def write_providers(tmp_path):
    """在临时目录生成 providers.yaml，返回文件路径。"""

    def _write(providers: dict, filename: str = "providers.yaml") -> Path:
        path = tmp_path / filename
        path.write_text(
            yaml.safe_dump({"providers": providers}, allow_unicode=True),
            encoding="utf-8",
        )
        return path

    return _write


@pytest.fixture
def write_routing(tmp_path):
    """在临时目录生成 model_routing.yaml，返回文件路径。"""

    def _write(aliases: dict, filename: str = "model_routing.yaml") -> Path:
        path = tmp_path / filename
        path.write_text(
            yaml.safe_dump({"aliases": aliases}, allow_unicode=True),
            encoding="utf-8",
        )
        return path

    return _write


@pytest.fixture
def mp3_kit():
    """构造合法 MP3 字节的工具（MPEG1 Layer III / 128kbps / 44.1kHz）。

    frames(n) 造 n 个音频帧；write_file 落盘；id3v2/id3v1 造文件级标签。
    """
    frame_size = 417  # 1152 / 8 * 128000 / 44100（无 padding）
    frame_ms = 1152 * 1000 / 44100  # 单帧时长 ≈ 26.12ms

    def frames(count: int = 1) -> bytes:
        frame = b"\xff\xfb\x90\x00" + b"\x00" * (frame_size - 4)
        return frame * count

    def id3v2(payload: bytes = b"TAGp") -> bytes:
        size = len(payload)
        header = b"ID3\x03\x00\x00" + bytes(
            [
                (size >> 21) & 0x7F,
                (size >> 14) & 0x7F,
                (size >> 7) & 0x7F,
                size & 0x7F,
            ]
        )
        return header + payload

    def id3v1() -> bytes:
        return b"TAG" + b"\x00" * 125

    def write_file(
        path: Path,
        count: int = 1,
        prefix: bytes = b"",
        suffix: bytes = b"",
    ) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(prefix + frames(count) + suffix)
        return path

    return SimpleNamespace(
        frames=frames,
        id3v2=id3v2,
        id3v1=id3v1,
        write_file=write_file,
        frame_size=frame_size,
        frame_ms=frame_ms,
    )
