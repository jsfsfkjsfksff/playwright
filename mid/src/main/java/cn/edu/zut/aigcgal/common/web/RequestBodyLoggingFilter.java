package cn.edu.zut.aigcgal.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * 调试用：把前端提交的**原始请求体**原样打到日志。
 *
 * 为什么是原始报文而不是反序列化后的对象：
 *   Jackson 遇到实体里没有的字段（例如前端多发的 cardName / x / y / edges）是**静默丢弃**的。
 *   只打对象就会变成「前端说发了、后端说没收到」，这种问题最难查；
 *   原始报文一字不差，谁多发了什么、字段名拼错了什么，一眼就能看出来。
 *
 * 覆盖范围：仅 /api/v1 下的写请求（POST / PUT / PATCH）。
 *   GET 与静态资源不打印，避免刷屏；请求体超过 {@value #MAX_CHARS} 字符会截断。
 *
 * 用法：正常调用接口后，在启动日志里搜 `[前端请求体]` 即可。
 * 调试完直接删掉本类（它对业务没有任何影响）。
 */
@Slf4j
@Component
public class RequestBodyLoggingFilter extends OncePerRequestFilter {

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH");
    private static final String PREFIX = "/api/v1/";
    /** 一次性最多缓存 64KB，足够装下锚点数组；超长请求体不会被完整缓存 */
    private static final int CACHE_LIMIT_BYTES = 64 * 1024;
    /** 日志里最多显示 4000 字符，避免刷屏 */
    private static final int MAX_CHARS = 4000;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!shouldLog(request)) {
            chain.doFilter(request, response);
            return;
        }

        // 包装一层，下游（Spring 的消息转换器）读取 body 时会被缓存下来，供 finally 里回读
        ContentCachingRequestWrapper wrapped =
                new ContentCachingRequestWrapper(request, CACHE_LIMIT_BYTES);
        try {
            chain.doFilter(wrapped, response);
        } finally {
            // 放在 finally：请求即使抛异常（400 / 500），也要看到前端到底发了什么
            logBody(wrapped);
        }
    }

    private static boolean shouldLog(HttpServletRequest request) {
        return WRITE_METHODS.contains(request.getMethod())
                && request.getRequestURI() != null
                && request.getRequestURI().startsWith(PREFIX);
    }

    private void logBody(ContentCachingRequestWrapper request) {
        byte[] body = request.getContentAsByteArray();
        String where = request.getMethod() + " " + request.getRequestURI();
        if (body.length == 0) {
            log.info("[前端请求体] {} （无请求体）", where);
            return;
        }

        String text = new String(body, StandardCharsets.UTF_8);
        if (text.length() > MAX_CHARS) {
            text = text.substring(0, MAX_CHARS) + "…（已截断显示，实际更长）";
        }
        log.info("[前端请求体] {}\n{}", where, text);
    }
}