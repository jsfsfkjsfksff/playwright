package cn.edu.zut.aigcgal.export;

import cn.edu.zut.aigcgal.R.BusinessCodeEnum;
import cn.edu.zut.aigcgal.common.media.MediaUrlResolver;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.export.client.PythonAudioClient;
import cn.edu.zut.aigcgal.export.dto.AudioExportPayload;
import cn.edu.zut.aigcgal.export.dto.AudioExportResult;
import cn.edu.zut.aigcgal.export.dto.ExportSegmentResponse;
import cn.edu.zut.aigcgal.export.service.ExportException;
import cn.edu.zut.aigcgal.export.service.ExportService;
import cn.edu.zut.aigcgal.map.SceneRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExportServiceTest {

    private final SceneRepository sceneRepository = mock(SceneRepository.class);
    private final PythonAudioClient pythonClient = mock(PythonAudioClient.class);
    private final MediaUrlResolver mediaUrlResolver = new MediaUrlResolver("http://localhost:8000");
    private final ExportService service =
            new ExportService(sceneRepository, pythonClient, mediaUrlResolver);

    private static Scene scene(String sceneId, String audioUrl) {
        Scene scene = new Scene();
        scene.setSceneId(sceneId);
        scene.setAudioUrl(audioUrl);
        return scene;
    }

    private static AudioExportResult okResult(String url, int segments) {
        AudioExportResult result = new AudioExportResult();
        result.setStatus("OK");
        result.setUrl(url);
        result.setFilename("out.mp3");
        result.setSegments(segments);
        result.setDurationMs(1000L);
        return result;
    }

    @Test
    void collectsAudioUrlsInRequestOrderAndReturnsPlayableUrl() {
        when(sceneRepository.findBySceneId("SCENE_02"))
                .thenReturn(scene("SCENE_02", "static/audio/b.mp3"));
        when(sceneRepository.findBySceneId("SCENE_01"))
                .thenReturn(scene("SCENE_01", "static/audio/a.mp3"));
        when(pythonClient.export(any())).thenReturn(okResult("static/exports/out.mp3", 2));

        ExportSegmentResponse response = service.export(List.of("SCENE_02", "SCENE_01"));

        assertThat(response.getUrl())
                .isEqualTo("http://localhost:8000/static/exports/out.mp3");
        assertThat(response.getFinalAudioUrl()).isEqualTo(response.getUrl());
        assertThat(response.getSegments()).isEqualTo(2);

        ArgumentCaptor<AudioExportPayload> captor =
                ArgumentCaptor.forClass(AudioExportPayload.class);
        verify(pythonClient).export(captor.capture());
        assertThat(captor.getValue().getAudioUrls())
                .containsExactly("static/audio/b.mp3", "static/audio/a.mp3");
    }

    @Test
    void scenesWithoutAudioAreSkipped() {
        when(sceneRepository.findBySceneId("SCENE_01")).thenReturn(scene("SCENE_01", null));
        when(sceneRepository.findBySceneId("SCENE_02"))
                .thenReturn(scene("SCENE_02", "static/audio/a.mp3"));
        when(pythonClient.export(any())).thenReturn(okResult("static/exports/out.mp3", 1));

        ExportSegmentResponse response = service.export(List.of("SCENE_01", "SCENE_02"));

        ArgumentCaptor<AudioExportPayload> captor =
                ArgumentCaptor.forClass(AudioExportPayload.class);
        verify(pythonClient).export(captor.capture());
        assertThat(captor.getValue().getAudioUrls()).containsExactly("static/audio/a.mp3");
        assertThat(response.getSegments()).isEqualTo(1);
    }

    @Test
    void noUsableAudioIsAConflictWithBusinessCode() {
        when(sceneRepository.findBySceneId("SCENE_01")).thenReturn(scene("SCENE_01", "  "));

        assertThatThrownBy(() -> service.export(List.of("SCENE_01")))
                .isInstanceOf(ExportException.class)
                .satisfies(e -> assertThat(((ExportException) e).getBusinessCode())
                        .isEqualTo(BusinessCodeEnum.AUDIO_SEGMENT_EMPTY));
    }

    @Test
    void pythonFailureIsNotReturnedAsHalfProduct() {
        when(sceneRepository.findBySceneId("SCENE_01"))
                .thenReturn(scene("SCENE_01", "static/audio/a.mp3"));
        AudioExportResult failed = new AudioExportResult();
        failed.setStatus("FAILED");
        failed.setError("BGM 混音尚未实现");
        when(pythonClient.export(any())).thenReturn(failed);

        assertThatThrownBy(() -> service.export(List.of("SCENE_01")))
                .isInstanceOf(ExportException.class)
                .hasMessageContaining("BGM 混音尚未实现");
    }

    @Test
    void okStatusWithoutUrlIsRejected() {
        when(sceneRepository.findBySceneId("SCENE_01"))
                .thenReturn(scene("SCENE_01", "static/audio/a.mp3"));
        when(pythonClient.export(any())).thenReturn(okResult("  ", 1));

        assertThatThrownBy(() -> service.export(List.of("SCENE_01")))
                .isInstanceOf(ExportException.class);
    }
}
