/**
 * 槽形（两侧内凹切角）轮廓几何
 * ---------------------------------------------------------------
 * 用两段 polygon 协同模拟“内凹槽 + 细描边”：
 *   - 外层 polygon 作为描边色块
 *   - 内层 polygon 向内偏移一个描边宽度，露出外侧边线
 * 几何常量属于本组件族专有的表现细节（非全站设计令牌），故就近定义。
 */

/** 切角之外的基础圆角，避免尖角过于生硬（px） */
const BASE_CORNER = 6

/** 凹槽深度（px） */
const NOTCH_DEPTH = 15

/** 凹槽横向内收比例，决定槽口尖锐程度 */
const NOTCH_SPREAD = 0.62

export interface NotchOutlineInput {
  /** 按钮实际宽度（px，含边框盒） */
  width: number
  /** 按钮实际高度（px，含边框盒） */
  height: number
  /** 向内的偏移量（px），0 表示最外层轮廓 */
  inset: number
}

/**
 * 生成左右对称、带内凹槽的八边形轮廓。
 * 尺寸足够小时自动退化为圆角矩形，避免布局挤压时形状崩坏。
 */
export function buildNotchOutline({ width, height, inset }: NotchOutlineInput): string {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)

  // 空间不足时完全退化为圆角矩形
  const notchFits = safeWidth > NOTCH_DEPTH * 5 && safeHeight > 18
  const radius = Math.max(BASE_CORNER - inset, 0)
  const depth = notchFits ? Math.max(NOTCH_DEPTH - inset, 0) : 0
  const spread = depth * NOTCH_SPREAD

  const left = inset
  const right = safeWidth - inset
  const top = inset
  const bottom = safeHeight - inset
  const middle = (top + bottom) / 2

  const points: Array<[number, number]> = depth
    ? [
        [left + radius + spread, top],
        [right - radius - spread, top],
        [right - spread, top + radius],
        [right - depth, middle],
        [right - spread, bottom - radius],
        [right - radius - spread, bottom],
        [left + radius + spread, bottom],
        [left + spread, bottom - radius],
        [left + depth, middle],
        [left + spread, top + radius],
      ]
    : [
        [left + radius, top],
        [right - radius, top],
        [right, top + radius],
        [right, bottom - radius],
        [right - radius, bottom],
        [left + radius, bottom],
        [left, bottom - radius],
        [left, top + radius],
      ]

  const formatted = points.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
  return `polygon(${formatted.join(', ')})`
}
