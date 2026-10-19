package cn.edu.zut.aigcgal.export.service;

import cn.edu.zut.aigcgal.common.media.MediaUrlResolver;
import cn.edu.zut.aigcgal.dao.node.Scene;
import cn.edu.zut.aigcgal.export.client.PythonAudioClient;
import cn.edu.zut.aigcgal.export.dto.AudioExportPayload;
import cn.edu.zut.aigcgal.export.dto.AudioExportResult;
import cn.edu.zut.aigcgal.export.dto.ExportSegmentResponse;
import cn.edu.zut.aigcgal.map.SceneRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.List;

/**
 * 导出：按前端给的 sceneIds 顺序取 audioUrl，交给 Python 做物理拼接。
 */
@Service
public class ExportService {

    /** 契约默认的 BGM 衰减（-15dB）；BGM 模块落地后从这里接配置 */
    private static final double DEFAULT_BGM_VOLUME_DB = -15.0;

    private final SceneRepository sceneRepository;
    private final PythonAudioClient pythonAudioClient;
    private final MediaUrlResolver mediaUrlResolver;

    public ExportService(
            SceneRepository sceneRepository,
            PythonAudioClient pythonAudioClient,
            MediaUrlResolver mediaUrlResolver
    ) {
        this.sceneRepository = sceneRepository;
        this.pythonAudioClient = pythonAudioClient;
        this.mediaUrlResolver = mediaUrlResolver;
    }

    public ExportSegmentResponse export(List<String> sceneIds) {
        // 1. 按框选顺序收集人声地址
        List<String> audioUrls = new ArrayList<>();
        for (String sceneId : sceneIds) {
            Scene scene = sceneRepository.findBySceneId(sceneId);
            if (scene == null) {
                throw ExportException.notFound("场景不存在: " + sceneId);
            }
            if (scene.getAudioUrl() != null && !scene.getAudioUrl().isBlank()) {
                audioUrls.add(scene.getAudioUrl());
            }
        }
        if (audioUrls.isEmpty()) {
            throw ExportException.segmentEmpty("所选片段没有任何可用的人声音频");
        }

        // 2. 组装混音任务（BGM 模块未落地，当前不混 BGM）
        AudioExportPayload payload = new AudioExportPayload(audioUrls, null, DEFAULT_BGM_VOLUME_DB);

        // 3. 调 Python；任何失败都不返回半成品
        AudioExportResult result;
        try {
            result = pythonAudioClient.export(payload);
        } catch (RestClientException e) {
            throw ExportException.failed("Python 混音服务调用失败: " + e.getMessage());
        }

        if (result == null) {
            throw ExportException.failed("Python 混音服务没有返回结果");
        }
        if (!"OK".equalsIgnoreCase(result.getStatus()) || result.getError() != null
                || result.getUrl() == null || result.getUrl().isBlank()) {
            String reason = result.getError() == null ? "混音失败" : result.getError();
            throw ExportException.failed(reason);
        }

        // 4. 相对路径 → 对外完整地址（全站唯一入口）
        String finalUrl = mediaUrlResolver.url(result.getUrl());

        ExportSegmentResponse response = new ExportSegmentResponse();
        response.setUrl(finalUrl);
        response.setFinalAudioUrl(finalUrl);
        response.setFilename(result.getFilename());
        response.setSegments(result.getSegments() == null ? audioUrls.size() : result.getSegments());
        response.setDurationMs(result.getDurationMs());
        return response;
    }
}
