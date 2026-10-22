package cn.edu.zut.aigcgal.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 开发期跨域放行（CORS）。
 *
 * 背景：前端 dev server 跑在 http://127.0.0.1:5173，而 frontend/.env.local 把
 * VITE_API_BASE_URL 直接指向 http://127.0.0.1:8080 —— 端口不同即跨域；
 * 后端此前没有任何 CORS 配置，浏览器会把响应拦下（无 Access-Control-Allow-Origin），
 * fetch 抛 TypeError: Failed to fetch，表现为「后端有数据、前端却说连不上」。
 *
 * 只放行本机开发来源，不用 "*"，也不开 allowCredentials
 * （前端用的是 credentials: 'same-origin'，跨域时不带凭证，无需开放）。
 */
@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://127.0.0.1:[*]", "http://localhost:[*]")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}