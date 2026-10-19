"""世界线服务：给图节点补语音的行为测试。"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.tts.models import AudioResult
from app.domain.worldline.models import (
    InterpolateRequest,
    TrellisGraphResponse,
    WorldlineNode,
)
from app.services.worldline_service import WorldlineService

REQUEST = InterpolateRequest(
    startText="夏日祭的夜晚，你在神社后山迷路了。",
    endText="少女的长剑架在了你的脖子上。",
    outline="男主试图搭讪，但说错了话激怒了对方",
    layers=2,
)


def _node(scene_id: str, text: str, speaker: str = "旁白", **kwargs) -> WorldlineNode:
    return WorldlineNode(sceneId=scene_id, text=text, speaker=speaker, **kwargs)


def _graph(*nodes: WorldlineNode) -> TrellisGraphResponse:
    return TrellisGraphResponse(nodes=list(nodes), edges=[])


@pytest.fixture
def fake_planner(monkeypatch):
    """替换 planner，只关心 service 是否把语音接上。"""

    def _install(graph: TrellisGraphResponse):
        planner = MagicMock()
        planner.plan = AsyncMock(return_value=graph)
        monkeypatch.setattr(
            "app.services.worldline_service.WorldlinePlanner",
            MagicMock(return_value=planner),
        )
        return planner

    return _install


@pytest.fixture
def fake_tts():
    tts = MagicMock()
    tts.build_input = MagicMock(side_effect=lambda text, speaker=None: (text, speaker))
    tts.synthesize_many = AsyncMock(
        side_effect=lambda inputs: [
            AudioResult(
                audioUrl=f"static/audio/{index}.mp3",
                durationMs=1,
                localPath=f"/tmp/{index}",
            )
            for index, _ in enumerate(inputs)
        ]
    )
    return tts


@pytest.mark.anyio
async def test_every_new_node_gets_its_audio(fake_planner, fake_tts):
    graph = _graph(
        _node("S1", "你鼓起勇气开口。"),
        _node("S2", "少女的眼神冷了下来。", "少女"),
    )
    fake_planner(graph)

    result = await WorldlineService(llm=MagicMock(), tts=fake_tts).generate_worldline(REQUEST)

    assert result is graph
    assert [node.audioUrl for node in graph.nodes] == [
        "static/audio/0.mp3",
        "static/audio/1.mp3",
    ]
    fake_tts.build_input.assert_any_call("你鼓起勇气开口。", "旁白")
    fake_tts.build_input.assert_any_call("少女的眼神冷了下来。", "少女")


@pytest.mark.anyio
async def test_mandatory_anchor_is_not_re_synthesized(fake_planner, fake_tts):
    """必经锚点在 Java 侧复用库里已有场景，不该再花一次 TTS。"""
    graph = _graph(_node("KEY_1", "已经存在的锚点", isMandatory=True))
    fake_planner(graph)

    await WorldlineService(llm=MagicMock(), tts=fake_tts).generate_worldline(REQUEST)

    fake_tts.synthesize_many.assert_not_awaited()
    assert graph.nodes[0].audioUrl == ""


@pytest.mark.anyio
async def test_node_with_existing_audio_is_kept(fake_planner, fake_tts):
    graph = _graph(_node("S1", "已有音频", audioUrl="static/audio/old.mp3"))
    fake_planner(graph)

    await WorldlineService(llm=MagicMock(), tts=fake_tts).generate_worldline(REQUEST)

    fake_tts.synthesize_many.assert_not_awaited()
    assert graph.nodes[0].audioUrl == "static/audio/old.mp3"


@pytest.mark.anyio
async def test_failed_segment_still_returns_the_graph(fake_planner, fake_tts):
    graph = _graph(_node("S1", "第一句"), _node("S2", "第二句"))
    fake_planner(graph)
    fake_tts.synthesize_many = AsyncMock(
        return_value=[
            None,
            AudioResult(audioUrl="static/audio/ok.mp3", durationMs=1, localPath="x"),
        ]
    )

    result = await WorldlineService(llm=MagicMock(), tts=fake_tts).generate_worldline(REQUEST)

    assert len(result.nodes) == 2
    assert result.nodes[0].audioUrl == ""
    assert result.nodes[1].audioUrl == "static/audio/ok.mp3"


@pytest.mark.anyio
async def test_empty_text_is_not_synthesized(fake_planner, fake_tts):
    graph = _graph(_node("S1", "   "), _node("S2", "有台词"))
    fake_planner(graph)

    await WorldlineService(llm=MagicMock(), tts=fake_tts).generate_worldline(REQUEST)

    assert fake_tts.synthesize_many.await_count == 1
    assert len(fake_tts.synthesize_many.call_args.args[0]) == 1
    assert graph.nodes[0].audioUrl == ""
    assert graph.nodes[1].audioUrl != ""


@pytest.mark.anyio
async def test_without_tts_service_still_returns_graph(fake_planner):
    graph = _graph(_node("S1", "你鼓起勇气开口。"))
    fake_planner(graph)

    result = await WorldlineService(llm=MagicMock()).generate_worldline(REQUEST)

    assert result == graph
    assert result.nodes[0].audioUrl == ""
