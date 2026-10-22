package cn.edu.zut.aigcgal.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 调试用：把**返回给前端的响应体**原样打到日志。
 *
 * 为什么需要它：请求体日志只能证明「后端收到了什么」，证明不了「前端拿到了什么」。
 * 两者不一致的典型场景 —— 序列化时字段被改成 null、返回的 DTO 漏了字段、
 * 信封里的 code 是 200 而 HTTP 状态是别的、甚至响应体根本是空的。
 *
 * 覆盖范围：仅 /api/v1 下的请求（含 GET，方便看列表接口到底回了什么）。
 * 只打印 JSON 响应体；非 JSON（如 HTML 错误页）只记状态码与字节数，避免刷屏。
 * 响应体超过 {@value #MAX_CHARS} 字符会截断。
 *
 * 用法：正常调用接口后，在启动日志里搜 `[返回前端响应]` 即可。
 * 调试完直接删掉本类（它对业务没有任何影响）。
 */
@Slf4j
@Component
public class ResponseBodyLoggingFilter extends OncePerRequestFilter {

    private static final String PREFIX = "/api/v1/";
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

        // 包装一层，下游写出去的响应体会被缓存下来，供 finally 里回读
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        try {
            chain.doFilter(request, wrapped);
        } finally {
            // 放在 finally：请求即使抛异常（400 / 500），也要看到前端到底收到了什么
            logBody(request, wrapped);
            // 关键一步：把缓存的内容写回真实响应流。
            // 漏掉这句，前端会收到一个空响应体 —— 包装器把内容吞掉了。
            wrapped.copyBodyToResponse();
        }
    }

    private static boolean shouldLog(HttpServletRequest request) {
        return request.getRequestURI() != null && request.getRequestURI().startsWith(PREFIX);
    }

    private void logBody(HttpServletRequest request, ContentCachingResponseWrapper response) {
        String where = describe(request);
        int status = response.getStatus();
        byte[] body = response.getContentAsByteArray();

        String contentType = response.getContentType();
        if (contentType == null || !contentType.contains("json")) {
            log.info("[返回前端响应] {} -> HTTP {} （非 JSON 响应，{} 字节，不打印内容）",
                    where, status, body.length);
            return;
        }

        if (body.length == 0) {
            log.info("[返回前端响应] {} -> HTTP {} （空响应体）", where, status);
            return;
        }

        String text = new String(body, StandardCharsets.UTF_8);
        if (text.length() > MAX_CHARS) {
            text = text.substring(0, MAX_CHARS) + "…（已截断显示，实际更长）";
        }
        log.info("[返回前端响应] {} -> HTTP {}\n{}", where, status, text);
    }

    /** 带上查询串 —— GET 接口的调试信息全在 query 里 */
    private static String describe(HttpServletRequest request) {
        String query = request.getQueryString();
        return request.getMethod() + " " + request.getRequestURI() + (query == null ? "" : "?" + query);
    }
}