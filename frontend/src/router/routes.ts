/**
 * 路由表（唯一来源）
 * ---------------------------------------------------------------
 * 项目自本页起引入官方 vue-router；页面组件本身不写死路径，
 * 统一通过 ROUTE_NAMES 引用，避免字符串散落。
 *
 * 说明：资源浏览页尚未开发，这里先给出**清晰的路由占位**，
 * 保证「资源」入口可点击、可键盘访问，不出现失效按钮。
 *
 * 本次变更（创作台拆成「入口 + 两个子页」）：
 *   - `/studio`             → StudioView（**故事选择页**，创作台的入口）
 *   - `/studio/resources`   → StudioResourcesView（资源管理）
 *   - `/studio/operations`  → StudioOperationsView（操作编辑）
 *   原来把「资源 / 操作」做成同一页里的两个 Tab；现在改为独立页面 + 路由，
 *   子页面各自带「返回选择页」，选择页负责总览与「一键生成」。
 *   - 原 `/create` 重定向到 `/studio` 保持不变；`/`、`/welcome`、`/features`、`/resources` 未改动。
 *
 * 注意：BackLink 的「返回首页」默认目标是 ROUTE_NAMES.home（`/`）；
 * 创作台子页面通过 `to` 显式指向 ROUTE_NAMES.studio。
 */
import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由元信息类型扩展。
 *   - `title`   页面标题：由 router/index.ts 的 afterEach 读取并写入 document.title；
 *   - `pending` 标记该路由的内容尚未开发（占位页），便于将来统一排查。
 */
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    pending?: boolean
  }
}

export const ROUTE_NAMES = {
  /** 首页 = 主界面（左侧主菜单 + 右侧公告） */
  home: 'home',
  /** 欢迎页，保留可用，不再是默认入口 */
  welcome: 'welcome',
  features: 'features',
  /** 创作台入口：故事选择页 */
  studio: 'studio',
  /** 创作台 · 资源管理（角色 / 规则 / 实体） */
  studioResources: 'studio-resources',
  /** 创作台 · 操作编辑（剧情锚点与生成参数） */
  studioOperations: 'studio-operations',
  /** 消费播放页（/player/:sceneId），由生成成功后跳转进入 */
  player: 'player',
  resources: 'resources',
} as const

export const ROUTES: readonly RouteRecordRaw[] = [
  {
    // 默认入口：主界面
    path: '/',
    name: ROUTE_NAMES.home,
    component: () => import('@/pages/HomeView.vue'),
    meta: { title: '主界面' },
  },
  {
    // 欢迎页：与主界面并列存在，可通过 /welcome 直接访问
    path: '/welcome',
    name: ROUTE_NAMES.welcome,
    component: () => import('@/pages/WelcomeView.vue'),
    meta: { title: '欢迎' },
  },
  {
    path: '/features',
    name: ROUTE_NAMES.features,
    component: () => import('@/pages/FeatureView.vue'),
    meta: { title: '功能选择' },
  },
  {
    // 创作台入口：先选故事，再进「资源管理」或「操作编辑」
    path: '/studio',
    name: ROUTE_NAMES.studio,
    component: () => import('@/pages/StudioView.vue'),
    meta: { title: '选择故事' },
  },
  {
    path: '/studio/resources',
    name: ROUTE_NAMES.studioResources,
    component: () => import('@/pages/StudioResourcesView.vue'),
    meta: { title: '资源管理' },
  },
  {
    path: '/studio/operations',
    name: ROUTE_NAMES.studioOperations,
    component: () => import('@/pages/StudioOperationsView.vue'),
    meta: { title: '操作编辑' },
  },
  {
    /*
     * 消费播放页：由「一键生成（插值）」成功后跳转进入。
     * 场景数据来自 GET /api/v1/play/scene/{sceneId}（见 services/studio.ts 的 getPlayScene）；
     * 点分支时用后端已经嵌在 edges[].targetScene 里的数据直接开播，因此不需要二次等待网络
     * —— 实现与取舍写在 pages/PlayerView.vue 与 stores/player.ts 的头部注释里。
     *
     * 路由守卫：sceneId 是这一页的唯一入口参数，空值（`/player/`、`/player/%20`）在类型上
     * 能通过路由匹配但拿不到任何场景。此时不留空白页、也不回首页，而是退回创作台 ——
     * 用户是从「一键生成」过来的，回创作台才能重来一次。
     */
    path: '/player/:sceneId',
    name: ROUTE_NAMES.player,
    component: () => import('@/pages/PlayerView.vue'),
    beforeEnter: (to) => {
      const raw = to.params.sceneId
      const sceneId = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
      return sceneId === '' ? { name: ROUTE_NAMES.studio } : true
    },
    meta: { title: '播放' },
  },
  {
    // 完全没有 sceneId 的路径（/player、/player/）：同样退回创作台，而不是落到通配路由回首页
    path: '/player',
    redirect: { name: ROUTE_NAMES.studio },
  },
  {
    // 旧的「创作」占位路径：保留以免既有链接失效，直接转到创作台入口
    path: '/create',
    redirect: { name: ROUTE_NAMES.studio },
  },
  {
    // 首页菜单「我的故事库」的落点
    path: '/resources',
    name: ROUTE_NAMES.resources,
    component: () => import('@/pages/ResourcesView.vue'),
    // 待开发：故事库内容（当前是带明确说明的占位页，不是空白页）
    meta: { title: '我的故事库', pending: true },
  },
  {
    // 未匹配路径回到首页（主界面），避免空白页
    path: '/:pathMatch(.*)*',
    redirect: { name: ROUTE_NAMES.home },
  },
]
