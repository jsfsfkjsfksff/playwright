package cn.edu.zut.aigcgal.common.tts;

import cn.edu.zut.aigcgal.DTO.TtsBatchRequestDto;
import cn.edu.zut.aigcgal.DTO.TtsBatchResponseDto;
import cn.edu.zut.aigcgal.DTO.TtsInputDto;
import cn.edu.zut.aigcgal.DTO.TtsResultDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

/**
 * 呼叫 Python 的 Qwen-Audio-TTS：文字 → 音频文件。
 *
 * 分工（契约「服务地址与音频文件存储约定」）：
 *   - Python **只做合成**，一律返回相对路径，不碰剧情图、不写库；
 *   - {@code Scene.audioUrl} 的唯一写入者是 Java。
 *
 * 放在 common 下而不是生成块里，是因为**播放块也要用它**：锚点场景（POST /plan/anchors
 * 手工写进来的）天生没有音频，播放端发现 audioUrl 为空时要补录一幕。
 */
@Component
public class PythonTtsClient {

    private final RestClient client;

    public PythonTtsClient(@Value("${python.base-url:http://localhost:8000}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        // 一次批量可能有几十幕，给足时间（Python 侧并发上限由 tts_max_concurrency 控制）
        factory.setReadTimeout(Duration.ofSeconds(180));

        this.client = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /**
     * 批量合成，返回结果**与入参同序**。
     *
     * 调用失败时不吞异常 —— 是否要让配音失败影响业务流程，由调用方决定
     * （生成流程选择"不阻断"，播放流程可以选择重试）。
     */
    public List<TtsResultDto> synthesizeBatch(List<TtsInputDto> inputs) {
        TtsBatchResponseDto resp = client.post()
                .uri("/api/ai/tts")
                .body(new TtsBatchRequestDto(inputs))
                .retrieve()
                .body(TtsBatchResponseDto.class);

        return resp == null || resp.getResults() == null ? List.of() : resp.getResults();
    }
}