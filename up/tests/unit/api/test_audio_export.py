"""音频导出接口测试（/api/audio/export 与 /api/v1/audio/export）。"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def lifespan_spies(monkeypatch):
    """跑真实 lifespan，但把预热与停机释放换成假对象。"""
    monkeypatch.setattr("app.main.get_llm_gateway", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.main.shutdown_services", AsyncMock(return_value=None))


@pytest.fixture
def static_dir(tmp_path, monkeypatch, mp3_kit):
    """把静态目录指到临时目录，并放两段音频。"""
    monkeypatch.setattr("app.core.config.settings.static_dir", str(tmp_path))
    mp3_kit.write_file(tmp_path / "audio" / "a.mp3", count=2)
    mp3_kit.write_file(tmp_path / "audio" / "b.mp3", count=3)
    return tmp_path


@pytest.fixture
def client(static_dir):
    with TestClient(app) as test_client:
        yield test_client


def test_export_returns_relative_url(client, static_dir, mp3_kit):
    response = client.post(
        "/api/audio/export",
        json={"audioUrls": ["static/audio/a.mp3", "static/audio/b.mp3"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "OK"
    assert body["url"] == f"static/exports/{body['filename']}"
    assert body["segments"] == 2
    assert body["sizeBytes"] == 5 * mp3_kit.frame_size
    assert (static_dir / "exports" / body["filename"]).is_file()


def test_export_also_available_under_v1(client):
    response = client.post(
        "/api/v1/audio/export",
        json={"audioUrls": ["static/audio/a.mp3"]},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "OK"


def test_missing_segment_returns_failed_not_half_product(client):
    response = client.post(
        "/api/audio/export",
        json={"audioUrls": ["static/audio/nope.mp3"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "FAILED"
    assert body["error"]
    assert body["url"] is None


def test_bgm_request_returns_failed(client):
    response = client.post(
        "/api/audio/export",
        json={
            "audioUrls": ["static/audio/a.mp3"],
            "bgmUrl": "static/audio/bgm.mp3",
            "bgmVolumeDb": -15,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"


def test_empty_list_is_rejected(client):
    response = client.post("/api/audio/export", json={"audioUrls": []})
    assert response.status_code == 422
