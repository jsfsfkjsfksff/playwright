/**
 * 主界面（HomeView）视图类型
 * ---------------------------------------------------------------
 * 只声明主界面自身消费的**视图数据**结构：菜单项、NEWS 条目与中央动效层的
 * 装饰元素。后端接口契约统一放在 types/api.ts，不在此重复定义。
 *
 * 约定：所有字段全部 readonly —— 这些数据在运行时不会变化，
 * 声明为只读可以让「误改配置」在类型检查阶段就被拦下。
 */
import type { RouteLocationRaw } from 'vue-router'

/**
 * 左侧主菜单项。
 * `to` 与 `feedback` 二选一：
 *   - 已有对应页面 → 给出 `to`，渲染为 <RouterLink> 真实跳转；
 *   - 页面尚未开发 → 给出 `feedback`，渲染为 <button>，点击后仅播报提示，
 *     不制造无效跳转（与参考稿 app.js 的占位行为一致）。
 */
export interface HomeMenuItem {
  /** 稳定标识，同时用作 v-for 的 key */
  readonly id: string
  /** 按钮文案 */
  readonly label: string
  /** 图标路径（24×24 视口，按描边渲染） */
  readonly iconPaths: readonly string[]
  /** 跳转目标；与 feedback 互斥 */
  readonly to?: RouteLocationRaw
  /** 暂无页面时的提示文案；与 to 互斥 */
  readonly feedback?: string
}

/** 右侧 NEWS 条目 */
export interface HomeNewsItem {
  /** 稳定标识，同时用作 v-for 的 key */
  readonly id: number
  /** 日期，形如 1-4-2026 */
  readonly date: string
  /** 标题 */
  readonly title: string
}

/**
 * 中央动效层：笔墨浸染光斑。
 * 只承载「节奏」参数，几何位置与渐变留在样式中按修饰类定义 —— 五个光斑的
 * 形状互不相同，用类表达比塞进数据更易读。
 */
export interface HomeInkBlot {
  /** 修饰类后缀（对应样式中的 --a ~ --e），同时用作 v-for 的 key */
  readonly id: string
  /** 洇开周期（s） */
  readonly duration: number
  /** 相位延迟（s），错开五个光斑的呼吸节奏 */
  readonly delay: number
}

/** 中央动效层：环绕主体的倾斜光环 */
export interface HomeHaloRing {
  /** 修饰类后缀（a / b），决定倾斜方向与环绕方向 */
  readonly id: string
  /** 环绕周期（s） */
  readonly duration: number
}

/** 中央动效层：水面扩散的涟漪圈 */
export interface HomeWaveRing {
  /** 序号，同时用作 v-for 的 key */
  readonly id: number
  /** 扩散起始延迟（s） */
  readonly delay: number
}

/** 中央动效层：缓慢漂浮的光点 */
export interface HomeMote {
  /** 序号，同时用作 v-for 的 key */
  readonly id: number
  /** 相对容器中心的水平偏移（px） */
  readonly x: number
  /** 相对容器中心的垂直偏移（px） */
  readonly y: number
  /** 相位延迟（s） */
  readonly delay: number
  /** 漂浮周期（s） */
  readonly duration: number
  /** 直径（px） */
  readonly size: number
}
