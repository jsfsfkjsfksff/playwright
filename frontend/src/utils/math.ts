/**
 * 通用数值工具
 */

/** 将数值限制在 [min, max] 区间内 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 保留指定小数位，避免生成过长的 inline 属性值 */
export function round(value: number, fractionDigits = 2): number {
  const factor = 10 ** fractionDigits
  return Math.round(value * factor) / factor
}
