/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明（前端接口配置）
 * 变量含义见 src/services/config.ts 与 .env.example
 */
interface ImportMetaEnv {
  /** 后端接口基址；留空表示后端尚未接入 */
  readonly VITE_API_BASE_URL?: string
  /** 是否使用本地模拟响应：'true' | 'false' */
  readonly VITE_API_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
