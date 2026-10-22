/**
 * 路由表（唯一来源）
 * ---------------------------------------------------------------
 * 项目自本页起引入官方 vue-router；页面组件本身不写死路径，
 * 统一通过 ROUTE_NAMES 引用，避免字符串散落。
 *
 * 说明：资源浏览页尚未开发，这里先给出**清晰的路由占位**，
 * 保证「资源」入口可点击、可键盘访问，不出现失效按钮。
 *
 * 本次变更（删除废弃页面）：
 *   - 删除 `/welcome`（WelcomeView 欢迎页）与 `/features`（FeatureView 功能选择页）——
 *     两页是旧版流程的中间态，现在的入口链路是「主界面 → 创作台 → 播放页」，
 *     没有任何页面链接到它们，保留只会让人以为还有一条走不通的路。
 *   - `ROUTE_NAMES` 里对应的 `welcome` / `features` 一并移除：没有任何消费方引用它们。
 *   - 两条旧地址**不写重定向**：它们会落到下面的通配路由（→ 首页），
 *     与「已删除的页面」语义一致，也避免在路由表里留下两行没人访问的记录。
 *   - 欢迎域接口（`/api/v1/welcome/*`）随页面一起删除，见 services/studio.ts 头部说明。
 *
 * 创作台的入口结构没有变化：
 *   - `/studio`             → StudioView（**故事选择页**，创作台的入口）
 *   - `/studio/resources`   → StudioResourcesView（资源管理）
 *   - `/studio/operations`  → StudioOperationsView（操作编辑）
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
