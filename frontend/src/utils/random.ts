/**
 * 确定性伪随机数
 * ---------------------------------------------------------------
 * 星点、粒子等装饰元素的随机参数必须可复现：同一 seed 永远得到同一结果，
 * 保证刷新、缩放与重复访问时构图稳定，不会出现位置跳动。
 */

export type RandomSource = () => number

/**
 * mulberry32：轻量、分布均匀，适合装饰性随机。
 * @param seed 任意整数种子
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 在 [min, max] 区间内取随机值。
 * @param random 随机源
 */
export function randomBetween(random: RandomSource, min: number, max: number): number {
  return min + random() * (max - min)
}
