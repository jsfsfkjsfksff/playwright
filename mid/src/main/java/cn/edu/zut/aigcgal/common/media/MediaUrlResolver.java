package cn.edu.zut.aigcgal.common.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 媒体地址解析器 —— 全站**唯一**的 audioUrl 生成入口。
 *
 * 规矩（契约「服务地址与音频文件存储约定」）：
 *   1. 所有对外可访问的 audioUrl 都必须经 {@link #url(String)} 拼出来，
 *      禁止各处手写 8080 / 8000，否则会出现"一半指向 Java、一半指向 Python"；
 *   2. Python 侧一律返回**相对路径**（如 static/audio/scene_abc.wav），
 *      由这里拼上 media.base-url。
 *
 * ⚠️ 本类签名已冻结：其余模块只允许 import 调用，不允许改行为。
 */
@Component
public class MediaUrlResolver {

    private final String baseUrl;

    public MediaUrlResolver(@Value("${media.base-url:}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * 相对路径 → 对外完整 URL。
     *
     * @param relativePath 相对媒体路径，如 static/audio/scene_abc.wav；空值返回 null（表示"没有音频"）
     */
    public String url(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return null;
        }

        String path = relativePath.trim();

        // 已经是完整 URL（历史数据，或尚未改成相对路径的 Python 返回值）：原样返回，
        // 否则会拼成 http://localhost:8000/http://... 这种一眼假的地址
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }

        String base = baseUrl == null ? "" : baseUrl.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (base.isEmpty()) {
            throw new IllegalStateException("media.base-url 未配置：所有 audioUrl 都必须由它拼出来");
        }

        return path.startsWith("/") ? base + path : base + "/" + path;
    }
}