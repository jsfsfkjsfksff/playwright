/**
 * 音频频谱模型
 * ---------------------------------------------------------------
 * 中央声音主体的核心数据：一组对称分布的频谱竖条。
 * 高度由“包络曲线 + 确定性微扰”生成，因此构图可复现，
 * 同时避免完全对称带来的机械感。
 */

import { round } from './math'
import { createSeededRandom } from './random'

/** 单根频谱柱 */
export interface SpectrumBar {
  /** 唯一键，用于列表渲染 */
  id: number
  /** SVG 用户坐标下的横坐标（柱体中心） */
  x: number
  /** 柱体宽度 */
  width: number
  /** 柱体高度 */
  height: number
  /** 柱体顶端圆角半径 */
  radius: number
  /** 基础不透明度（0–1），用于拉开层次 */
  opacity: number
}

/** 生成参数 */
export interface SpectrumOptions {
  /** 频谱柱数量，建议使用奇数以保证中轴对称 */
  count?: number
  /** SVG 用户坐标宽度 */
  width?: number
  /** 最高柱的高度 */
  maxHeight?: number
  /** 最低柱的高度 */
  minHeight?: number
  /** 控制边缘衰减速度，值越大边缘越矮 */
  falloff?: number
  /** 随机种子 */
  seed?: number
}

/** 频谱整体尺寸常量，供组件与样式共享 */
export const SPECTRUM_VIEW_BOX = { width: 400, height: 176 } as const

/**
 * 生成对称频谱。
 *
 * 包络采用 double-cosine 曲线：中间最高，向两侧平滑衰减，
 * 与参考图中“中央主峰 + 两侧递减排布”的结构一致。
 */
export function buildSpectrumBars(options: SpectrumOptions = {}): SpectrumBar[] {
  const {
    count = 19,
    width = SPECTRUM_VIEW_BOX.width,
    maxHeight = 142,
    minHeight = 16,
    falloff = 1.75,
    seed = 20240521,
  } = options

  const random = createSeededRandom(seed)
  const step = width / count
  const barWidth = Math.max(2, round(step * 0.13, 2))
  const center = (count - 1) / 2

  return Array.from({ length: count }, (_unused, index) => {
    const normalizedDistance = Math.abs(index - center) / center
    const envelope = Math.cos(normalizedDistance ** falloff * (Math.PI / 2)) ** 1.35

    // 高度微扰：让相邻柱体错落，但保持整体轮廓平滑
    const jitter = 0.8 + random() * 0.34
    const height = round(minHeight + (maxHeight - minHeight) * envelope * jitter, 2)

    return {
      id: index,
      x: round(step * (index + 0.5), 2),
      width: barWidth,
      height,
      radius: round(barWidth / 2, 2),
      opacity: round(0.36 + envelope * 0.58, 3),
    }
  })
}

/**
 * 生成每根柱体的呼吸动画参数。
 * 长周期（8–13s）、低幅度（±4% 高度），符合“低频、平滑”的动效要求。
 */
export interface SpectrumBreath {
  duration: number
  delay: number
}

export function buildSpectrumBreaths(bars: SpectrumBar[], seed = 90210): SpectrumBreath[] {
  const random = createSeededRandom(seed)

  return bars.map((bar) => {
    // 中间柱体幅度稍大，边缘更安静
    const isCentral = Math.abs(bar.id - (bars.length - 1) / 2) < 3
    return {
      duration: round(8.4 + random() * 4.6 + (isCentral ? 0 : 1.6), 2),
      delay: round(random() * -12, 2),
    }
  })
}
