/**
 * 路由实例
 * ---------------------------------------------------------------
 * 使用 HTML5 History 模式。开发环境由 Vite 自动回退到 index.html；
 * 生产环境若部署到静态服务器，需要为未知路径配置 index.html 回退。
 */
import { createRouter, createWebHistory } from 'vue-router'

import { ROUTES } from './routes'

/** 站名：与 index.html 的初始标题保持一致 */
const APP_TITLE = '夜间电台'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [...ROUTES],
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * 让网页标题跟随路由配置的 meta.title。
 * 没有 meta.title 的路由（例如临时的中间态）回落到站名本身，
 * 避免出现「夜间电台 · undefined」这种标题。
 */
router.afterEach((to) => {
  document.title = to.meta.title ? `${APP_TITLE} · ${to.meta.title}` : APP_TITLE
})

export { ROUTE_NAMES } from './routes'
