package cn.edu.zut.aigcgal.export.client;

import cn.edu.zut.aigcgal.export.dto.AudioExportPayload;
import cn.edu.zut.aigcgal.export.dto.AudioExportResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 调 Python 混音服务的客户端。
 *
 * <p>契约里「export 块只依赖 dao / common.media / 只读 bgm + Python client」，
 * 所以这个客户端归属 export 包，不引用 plan 包。</p>
 */
@Component
public class PythonAudioClient {

    private final RestClient client;

    public PythonAudioClient(@Value("${python.base-url:http://localhost:8000}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        // 多段音频要下载 + 拼接，留足时间
        factory.setReadTimeout(Duration.ofSeconds(180));

        this.client = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    public AudioExportResult export(AudioExportPayload payload) {
        return client.post()
                .uri("/api/audio/export")
                .body(payload)
                .retrieve()
                .body(AudioExportResult.class);
    }
}
