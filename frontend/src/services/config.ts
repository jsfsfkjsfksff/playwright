/**
 * 前端接口配置
 * ---------------------------------------------------------------
 * 仅前端职责：集中管理接口基址与开关，供 services 层使用。
 * 不包含任何服务端实现。
 *
 * 环境变量（可选，写在 .env.local 中）：
 *   VITE_API_MOCK       是否使用本地模拟响应：'true' | 'false'，默认 true。
 *   VITE_API_BASE_URL   后端接口基址（可选）。留空表示**与前端同源**：
 *                       开发态由 vite.config.ts 的 /api 代理转发到本机 8080，
 *                       生产态由同域部署（Nginx / 网关）承担。
 *
 * 两种运行状态（判定只发生在本文件，其它模块不许自己拼条件）：
 *   1. **真实后端**：VITE_API_MOCK=false
 *      → services 层发真实请求；后端尚未实现的接口仍走 Mock（见 services/studio.ts 的 NO_BACKEND）。
 *   2. **演示模式（Mock）**：其余情况（含「什么都没配置」这个默认状态）
 *      → services 层返回本地 Mock 数据，界面链路可以完整走通。
 *
 * ⚠️ 唯一的开关是 VITE_API_MOCK=false。base URL 只在前后端不同源时才需要填 ——
 *    同源（含开发态走 Vite 代理）时留空即可，此时请求路径就是 /api/v1/*。
 */

function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback
  }
  return value === 'true'
}

/** 接口基址（去掉结尾斜杠，避免拼接出双斜杠）；留空 = 同源 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** 是否启用本地模拟响应 */
export const API_USE_MOCK: boolean = readBooleanFlag(import.meta.env.VITE_API_MOCK, true)

/** 是否按真实后端运行（唯一判定入口）：VITE_API_MOCK=false 即为真 */
export const API_IS_CONFIGURED: boolean = !API_USE_MOCK

/**
 * 是否处于「演示模式（Mock 数据）」。
 * 为 true 时 services 层不发出任何真实网络请求，返回 src/services/mock/ 里的假数据。
 */
export const API_DEMO_MODE: boolean = !API_IS_CONFIGURED

/** 模拟响应延迟（毫秒），仅用于本地联调时呈现真实加载态 */
export const API_MOCK_LATENCY = 620

/**
 * 拼接完整接口地址。
 * @param path 以 `/` 开头的接口路径
 */
export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
