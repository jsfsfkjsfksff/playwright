/**
 * 主题初始化（全站唯一入口）
 * ---------------------------------------------------------------
 * 产品决定：全站统一为**夜间主题**，主题切换功能已移除。
 *
 * 因此本文件不再包含任何「切换型」API：
 *   - 没有 resolveTheme / applyTheme / useTheme 之类的解析与写入方法；
 *   - 没有主题状态（ref / computed），也没有可供按钮调用的开关；
 *   - 不监听 `prefers-color-scheme` —— 系统偏好改变视觉属于「隐式切换」，同样移除。
 *
 * 夜间令牌定义在 `:root`（styles/themes/night.css），即使没有任何主题标识也生效；
 * index.html 里的 `data-theme="night"` 只是静态声明，不参与任何运行时判断。
 *
 * 日间主题如将来要做：在 styles/themes/day.css 补齐取值后，再在此处重新引入解析逻辑。
 */
export function initTheme(): void {
  /*
   * 浏览器界面配色（地址栏 / 状态栏）跟随夜间令牌，而不是在 JS 里再写一份颜色。
   * 令牌取不到值时保持 index.html 里的静态默认值，不做无依据的兜底。
   */
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    return
  }

  const pageBackground = getComputedStyle(document.documentElement)
    .getPropertyValue('--nw-color-page-bg')
    .trim()

  if (pageBackground !== '') {
    meta.setAttribute('content', pageBackground)
  }
}
