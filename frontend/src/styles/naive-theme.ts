/**
 * Naive UI 主题桥接
 * ---------------------------------------------------------------
 * 项目原有视觉体系是「原生 CSS + 语义化令牌（--nw-*）」，而 Naive UI 自带一套
 * JS 主题变量（common / Button / Card / Dialog / Modal …）。若不桥接，
 * 引入的组件会是 Naive 默认的深灰蓝，与站内的午夜蓝玻璃拟态明显不是一套东西。
 *
 * 本文件是**唯一的桥接点**，做法有两条硬约束：
 *   1. **取色一律引用站内令牌的取值**，不在这里另写一套色值。
 *      令牌的原文在 styles/themes/night.css，日间模式接入时只需改那里的取值，
 *      本文件跟着变，不需要改任何组件。
 *   2. **组件自身的材质交给 CSS 覆盖，而不是全部塞进 themeOverrides**。
 *      玻璃拟态依赖 backdrop-filter + 多层渐变（GlassPanel 的 .nw-glass-panel），
 *      这是 Naive 的 JS 主题变量表达不了的；因此 themeOverrides 只负责
 *      「颜色 / 圆角 / 字号」，材质由 styles/naive-overrides.css 用 --nw-* 令牌补。
 *
 * ⚠️ 为什么用 darkTheme 作为基底：Naive 的 light 基底里不少变量是深色文字
 *    （例如 textColorBase 接近纯黑），只覆盖一部分会漏出黑字。以 dark 为基底、
 *    再逐项改成站内取值，漏网的变量也是深色系，不会出现刺眼的反色。
 */
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

/**
 * 站内令牌取值（与 styles/themes/night.css 保持一致）。
 *
 * 这里导出成常量而不是直接内联在对象里，是为了让「哪些颜色来自主题」一目了然，
 * 也便于将来主题切换时只替换这一处来源。
 */
export const NW_NAIVE_COLORS = {
  /** --nw-color-page-bg：页面底色 */
  pageBg: '#04070f',
  /** --nw-color-text-primary */
  textPrimary: '#eef5fd',
  /** --nw-color-text-secondary */
  textSecondary: '#aebdd2',
  /** --nw-color-text-tertiary */
  textTertiary: '#7c8ba1',
  /** --nw-color-text-disabled */
  textDisabled: '#55637a',
  /** --nw-color-accent */
  accent: '#4a86d8',
  /** --nw-color-accent-strong */
  accentStrong: '#7fb2ea',
  /** --nw-color-accent-contrast */
  accentContrast: '#d6e8fb',
  /** --nw-color-border */
  border: 'rgb(126 163 214 / 18%)',
  /** --nw-color-border-strong */
  borderStrong: 'rgb(148 189 240 / 32%)',
  /** --nw-color-glass-fill */
  glassFill: 'rgb(18 34 62 / 46%)',
  /** --nw-color-glass-fill-strong */
  glassFillStrong: 'rgb(20 38 70 / 68%)',
  /** --nw-color-button-fill-secondary */
  buttonFill: 'rgb(14 26 48 / 52%)',
  /** --nw-color-button-fill-secondary-hover */
  buttonFillHover: 'rgb(20 38 70 / 60%)',
  /** --nw-color-hover */
  hover: 'rgb(122 176 246 / 14%)',
  /** --nw-color-focus */
  focus: '#8ec5ff',
  /** --nw-color-success */
  success: '#4fbf9a',
  /** --nw-color-warning */
  warning: '#d8b06a',
  /** --nw-color-error */
  error: '#e08585',
  /** --nw-color-info */
  info: '#4a86d8',
} as const

/**
 * 字号体系：与站内 --nw-font-size-* 对齐（Naive 只接受 px 数值）。
 * 站内用的是 rem 字号，这里按 16px 基准换算后写成 px —— Naive 的变量不支持 rem 字符串。
 */
const FONT_SIZE = {
  tiny: 12,
  small: 13,
  medium: 14,
  large: 16,
} as const

/** 圆角：与站内 --nw-radius-sm / md / lg / pill 对齐 */
const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const

/**
 * 全局主题覆盖。
 *
 * 分组顺序与 Naive 的变量命名一致（common → 各组件），便于按组件查找。
 * 只覆盖站内真正会用到的那几个组件：Modal（存读档 / 分支选择）、
 * Button、Input、Radio、Card、Tag、Empty —— 其余组件保持 Naive 默认，
 * 用到时再按同样的方式补，不做无消费方的提前覆盖。
 */
export const NW_NAIVE_THEME_OVERRIDES: GlobalThemeOverrides = {
  common: {
    // 字体：站内 --nw-font-sans 的具体取值
    fontFamily:
      '"Inter", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',

    fontSize: `${FONT_SIZE.medium}px`,
    fontSizeMini: `${FONT_SIZE.tiny}px`,
    fontSizeTiny: `${FONT_SIZE.tiny}px`,
    fontSizeSmall: `${FONT_SIZE.small}px`,
    fontSizeMedium: `${FONT_SIZE.medium}px`,
    fontSizeLarge: `${FONT_SIZE.large}px`,
    fontSizeHuge: '18px',

    borderRadius: `${RADIUS.md}px`,
    borderRadiusSmall: `${RADIUS.sm}px`,

    // 文字
    textColorBase: NW_NAIVE_COLORS.textPrimary,
    textColor1: NW_NAIVE_COLORS.textPrimary,
    textColor2: NW_NAIVE_COLORS.textSecondary,
    textColor3: NW_NAIVE_COLORS.textTertiary,
    textColorDisabled: NW_NAIVE_COLORS.textDisabled,
    placeholderColor: NW_NAIVE_COLORS.textDisabled,
    placeholderColorDisabled: NW_NAIVE_COLORS.textDisabled,

    // 图标
    iconColor: NW_NAIVE_COLORS.textTertiary,
    iconColorHover: NW_NAIVE_COLORS.accentStrong,
    iconColorPressed: NW_NAIVE_COLORS.accent,
    iconColorDisabled: NW_NAIVE_COLORS.textDisabled,

    // 容器底色：统一走半透明，真正的玻璃材质由 CSS 覆盖补 backdrop-filter
    bodyColor: NW_NAIVE_COLORS.pageBg,
    cardColor: NW_NAIVE_COLORS.glassFillStrong,
    modalColor: NW_NAIVE_COLORS.glassFillStrong,
    popoverColor: NW_NAIVE_COLORS.glassFillStrong,
    tableColor: 'transparent',
    inputColor: NW_NAIVE_COLORS.buttonFill,
    inputColorDisabled: 'rgb(14 26 48 / 32%)',
    actionColor: NW_NAIVE_COLORS.buttonFill,

    // 描边
    borderColor: NW_NAIVE_COLORS.border,
    dividerColor: NW_NAIVE_COLORS.border,

    // 主色
    primaryColor: NW_NAIVE_COLORS.accent,
    primaryColorHover: NW_NAIVE_COLORS.accentStrong,
    primaryColorPressed: NW_NAIVE_COLORS.accent,
    primaryColorSuppl: NW_NAIVE_COLORS.accentStrong,

    infoColor: NW_NAIVE_COLORS.info,
    infoColorHover: NW_NAIVE_COLORS.accentStrong,
    infoColorPressed: NW_NAIVE_COLORS.accent,
    infoColorSuppl: NW_NAIVE_COLORS.accentStrong,

    successColor: NW_NAIVE_COLORS.success,
    successColorHover: NW_NAIVE_COLORS.success,
    successColorPressed: NW_NAIVE_COLORS.success,
    successColorSuppl: NW_NAIVE_COLORS.success,

    warningColor: NW_NAIVE_COLORS.warning,
    warningColorHover: NW_NAIVE_COLORS.warning,
    warningColorPressed: NW_NAIVE_COLORS.warning,
    warningColorSuppl: NW_NAIVE_COLORS.warning,

    errorColor: NW_NAIVE_COLORS.error,
    errorColorHover: NW_NAIVE_COLORS.error,
    errorColorPressed: NW_NAIVE_COLORS.error,
    errorColorSuppl: NW_NAIVE_COLORS.error,

    // 悬停 / 选中底色
    hoverColor: NW_NAIVE_COLORS.hover,
    pressedColor: NW_NAIVE_COLORS.buttonFillHover,

    // 阴影：站内 --nw-shadow-panel 的近似取法（Naive 只接受完整 box-shadow 字符串）
    boxShadow1: '0 6px 18px rgb(2 6 14 / 42%)',
    boxShadow2: '0 14px 36px rgb(2 6 14 / 52%)',
    boxShadow3: '0 22px 56px rgb(2 6 14 / 62%)',
  },

  // Modal：− 存读档弹窗与分支选择弹窗都用它
  Modal: {
    color: NW_NAIVE_COLORS.glassFillStrong,
    textColor: NW_NAIVE_COLORS.textPrimary,
    titleTextColor: NW_NAIVE_COLORS.textPrimary,
    boxShadow: '0 22px 56px rgb(2 6 14 / 62%)',
  },

  Dialog: {
    color: NW_NAIVE_COLORS.glassFillStrong,
    textColor: NW_NAIVE_COLORS.textSecondary,
    titleTextColor: NW_NAIVE_COLORS.textPrimary,
  },

  Button: {
    // 主按钮：站内是「深蓝渐变 + 亮边」，渐变由 CSS 覆盖，这里给基色
    colorPrimary: NW_NAIVE_COLORS.accent,
    colorHoverPrimary: NW_NAIVE_COLORS.accentStrong,
    colorPressedPrimary: NW_NAIVE_COLORS.accent,
    colorFocusPrimary: NW_NAIVE_COLORS.accentStrong,
    textColorPrimary: '#f2f8ff',
    textColorHoverPrimary: '#f2f8ff',
    textColorPressedPrimary: '#f2f8ff',
    textColorFocusPrimary: '#f2f8ff',
    borderPrimary: `1px solid ${NW_NAIVE_COLORS.borderStrong}`,

    // 次级按钮
    color: NW_NAIVE_COLORS.buttonFill,
    colorHover: NW_NAIVE_COLORS.buttonFillHover,
    colorPressed: NW_NAIVE_COLORS.buttonFillHover,
    textColor: NW_NAIVE_COLORS.textSecondary,
    textColorHover: NW_NAIVE_COLORS.textPrimary,
    textColorPressed: NW_NAIVE_COLORS.textPrimary,
    border: `1px solid ${NW_NAIVE_COLORS.border}`,
    borderHover: `1px solid ${NW_NAIVE_COLORS.borderStrong}`,
    borderPressed: `1px solid ${NW_NAIVE_COLORS.borderStrong}`,

    borderRadiusMedium: `${RADIUS.md}px`,
    borderRadiusLarge: `${RADIUS.md}px`,
    borderRadiusSmall: `${RADIUS.sm}px`,
    fontWeight: '500',
  },

  Input: {
    color: NW_NAIVE_COLORS.buttonFill,
    colorFocus: NW_NAIVE_COLORS.buttonFill,
    textColor: NW_NAIVE_COLORS.textPrimary,
    border: `1px solid ${NW_NAIVE_COLORS.border}`,
    borderHover: `1px solid ${NW_NAIVE_COLORS.borderStrong}`,
    borderFocus: `1px solid ${NW_NAIVE_COLORS.focus}`,
    boxShadowFocus: `0 0 0 3px rgb(122 176 246 / 20%)`,
    caretColor: NW_NAIVE_COLORS.focus,
    borderRadius: `${RADIUS.sm}px`,
  },

  Radio: {
    buttonColor: NW_NAIVE_COLORS.buttonFill,
    buttonColorActive: NW_NAIVE_COLORS.accentStrong,
    buttonTextColor: NW_NAIVE_COLORS.textSecondary,
    buttonTextColorActive: '#f2f8ff',
    buttonBorderColor: NW_NAIVE_COLORS.border,
    buttonBorderColorActive: NW_NAIVE_COLORS.accentStrong,
    dotColorActive: NW_NAIVE_COLORS.accentStrong,
    textColor: NW_NAIVE_COLORS.textSecondary,
    borderRadius: `${RADIUS.pill}px`,
  },

  Card: {
    color: NW_NAIVE_COLORS.glassFill,
    borderColor: NW_NAIVE_COLORS.border,
    titleTextColor: NW_NAIVE_COLORS.textPrimary,
    textColor: NW_NAIVE_COLORS.textSecondary,
    borderRadius: `${RADIUS.md}px`,
  },

  Tag: {
    color: NW_NAIVE_COLORS.buttonFill,
    textColor: NW_NAIVE_COLORS.textSecondary,
    border: `1px solid ${NW_NAIVE_COLORS.border}`,
    borderRadius: `${RADIUS.pill}px`,
  },

  Empty: {
    textColor: NW_NAIVE_COLORS.textTertiary,
    iconColor: NW_NAIVE_COLORS.textDisabled,
  },
}

/**
 * 传给 `<n-config-provider>` 的完整主题对象。
 * 单独导出成对象，页面里只需 `:theme="NW_NAIVE_THEME"` + `:theme-overrides="..."`，
 * 避免每个页面各写一遍 darkTheme。
 */
export const NW_NAIVE_THEME = darkTheme
