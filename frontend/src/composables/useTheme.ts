/**
 * useTheme —— 主题机制统一入口（架构预留，不含界面控件）
 * ---------------------------------------------------------------
 * 本阶段只开发夜间模式：
 *   - 夜间主题定义在 `:root`（src/styles/themes/night.css），默认即生效；
 *     根元素上的 `data-theme="night"` 只是显式声明，便于后续区分主题。
 *   - 日间主题尚未制作，接入方式见 src/styles/themes/day.css。
 *
 * 本模块为后续主题切换预留**唯一入口**，而不是现在就实现切换功能：
 *   1. 统一决定「当前应生效哪个主题」（resolveTheme）；
 *   2. 统一负责把标识写到根元素（applyTheme）；
 *   3. 已接好系统偏好监听，日间取值补齐后即可自动跟随系统。
 *
 * 说明：
 *   - 当前**没有**主题切换按钮，也未新增任何导航或界面控件；
 *   - 用户偏好持久化（localStorage）等到日间模式正式开发时再引入，
 *     避免提前写入没有消费方的存储逻辑。
 */
import { computed } from 'vue'

/** 站点已实现的主题；日间模式完成后在此追加 'day' */
export type ResolvedTheme = 'night'

/** 根元素上的主题标识属性 */
const THEME_ATTRIBUTE = 'data-theme'

/**
 * 解析当前应生效的主题。
 * 夜间模式是当前唯一已实现的主题，因此恒定返回 'night'；
 * 日间模式完成后，这里改为依据系统偏好返回 'day' / 'night'。
 */
function resolveTheme(): ResolvedTheme {
  return 'night'
}

/** 把主题标识写入根元素，并同步浏览器界面配色 */
function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme)

  /*
   * 浏览器界面配色（地址栏 / 状态栏）跟随主题令牌，而不是在 JS 里再写一份颜色。
   * 令牌取不到值时保持 index.html 里的静态默认值，不做无依据的兜底。
   */
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const pageBackground = getComputedStyle(document.documentElement)
      .getPropertyValue('--nw-color-page-bg')
      .trim()

    if (pageBackground !== '') {
      meta.setAttribute('content', pageBackground)
    }
  }
}

function handleSystemColorSchemeChange(): void {
  // 当前只有夜间模式，系统偏好变化不改变结果；
  // 日间模式接入后，这里改为重新解析并应用即可。
  applyTheme(resolveTheme())
}

let initialized = false
let mediaQuery: MediaQueryList | null = null

/**
 * 初始化主题机制。应在应用挂载前调用一次（main.ts 中执行）。
 * 不读取、也不写入任何持久化偏好，避免为未实现的日间模式提前引入状态。
 */
export function initTheme(): void {
  if (initialized) {
    return
  }
  initialized = true

  applyTheme(resolveTheme())

  // 监听已就绪：接入日间取值后无需再补事件绑定
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleSystemColorSchemeChange)
}

/** 供组件读取当前主题；当前页面无需展示主题信息，仅保留读取接口 */
export function useTheme() {
  return {
    resolvedTheme: computed<ResolvedTheme>(() => resolveTheme()),
  }
}
