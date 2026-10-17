import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    /**
     * 联调代理：前端请求 /api/v1/* 与前端同源，由 Vite 转发到 Spring Boot（默认 8080）。
     * 这样前端不需要写后端域名，也绕开了跨域（后端当前没有配 CORS）。
     * 后端若改了 server.port，这里同步改。
     */
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
