<script setup lang="ts">
/**
 * AudioWave —— 环形音波主体（功能选择页中央视觉焦点）
 * ---------------------------------------------------------------
 * 与首页 AudioOrb 的区别：
 *   首页是「球体 + 频谱柱」，本页是**圆周环绕**的声纹柱体与同心波纹，
 *   整体保持近似圆形轮廓，三个环以不同速度与方向缓慢旋转，形成连续、柔和的
 *   空间声场感，而不是生硬的机械跳动。
 *
 * 结构（全部为 SVG / CSS，无位图）：
 *   1. 内核柔光 + 同心波纹环（径向渐隐，避免硬边圆环）
 *   2. 三圈环绕声纹柱体（每圈 36 根，垂直中轴的一根更长，呼应首页频谱重心）
 *   3. 环绕光点
 * 颜色全部来自主题令牌（--nw-wave-*），因此日间主题接入时无需改动本组件。
 */
import { computed } from 'vue'

withDefaults(
  defineProps<{
    /** 是否启用旋转与呼吸动画 */
    animated?: boolean
  }>(),
  { animated: true },
)

/** 画布：正方形 viewBox，保证图形为严格的 1:1 圆形 */
const VIEW_BOX = 420
const CENTER = VIEW_BOX / 2

/**
 * 同心波纹环半径（最外圈 198，已在上限内留出余量）。
 *
 * 上限说明：画布内可用的最大半径 = viewBox 半径 210 减去描边余量（最粗 2.2）
 * 与光晕余量，取 204；环与柱体的外端点都不得超过它，否则图形会溢出画布、
 * 与外层方形布局盒不再重合，看上去就像被拉伸变形。
 */
const RING_RADII = [72, 104, 136, 168, 198] as const

/** 声纹柱体数量：每圈均匀分布 */
const BARS_PER_RING = 36

interface WaveBar {
  id: number
  /** 柱体中心角度（度） */
  angle: number
  /** 柱体内端点半径 */
  inner: number
  /** 柱体外端点半径 */
  outer: number
}

interface WaveRing {
  id: string
  /** 柱体基线半径 */
  baseRadius: number
  /** 柱体长度 */
  length: number
  /** 整圈旋转周期（秒），三圈不同以形成层次 */
  duration: number
  /** 反向旋转，制造交错感 */
  reverse: boolean
  /** 柱体描边宽度 */
  width: number
  bars: WaveBar[]
}

/**
 * 生成一圈声纹柱体。
 *
 * 每根柱体长度完全一致（不再对中轴柱加权、不再加随机微扰）：
 * 长度不一致会让圆形轮廓出现长短不齐的“锯齿”，是最容易被看成“变形”的原因。
 * 层次感改由三圈的基半径与柱长差、以及各自的旋转速度来体现。
 */
function buildRing(baseRadius: number, length: number): WaveBar[] {
  return Array.from({ length: BARS_PER_RING }, (_unused, index) => ({
    id: index,
    angle: (360 / BARS_PER_RING) * index,
    inner: baseRadius,
    outer: baseRadius + length,
  }))
}

/**
 * 三圈声纹：基半径 + 柱长均受画布可用半径 204 约束。
 *   外圈 186 + 18 = 204（正好贴到上限）
 *   中圈 152 + 22 = 174
 *   内圈 120 + 26 = 146
 */
const rings: WaveRing[] = [
  { id: 'outer', baseRadius: 186, length: 18, duration: 96, reverse: false, width: 2.2, bars: buildRing(186, 18) },
  { id: 'middle', baseRadius: 152, length: 22, duration: 128, reverse: true, width: 2, bars: buildRing(152, 22) },
  { id: 'inner', baseRadius: 120, length: 26, duration: 78, reverse: false, width: 1.8, bars: buildRing(120, 26) },
]

/** 环上光点：固定角度，随环一起旋转 */
const nodes = computed(() =>
  [24, 132, 228, 312].map((angle, index) => ({
    id: index,
    angle,
    radius: 186 + 18 * 0.5 + (index % 2 === 0 ? 0 : -46),
  })),
)

/** 柱体的呼吸延迟：按角度错开，形成环绕流动感 */
function barDelay(ringIndex: number, barIndex: number): number {
  return -((barIndex / BARS_PER_RING) * 7 + ringIndex * 1.7)
}

/** 柱体呼吸周期：中外圈更慢，内圈略快 */
function barDuration(ringIndex: number): number {
  return [7.6, 9.4, 6.4][ringIndex]!
}
</script>

<template>
  <div class="nw-audio-wave" :class="{ 'nw-audio-wave--animated': animated }">
    <svg
      class="nw-audio-wave__canvas"
      :viewBox="`0 0 ${VIEW_BOX} ${VIEW_BOX}`"
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="nwWaveCore" cx="50%" cy="46%" r="58%">
          <stop offset="0%" stop-color="var(--nw-wave-core)" />
          <stop offset="68%" stop-color="var(--nw-wave-core-mid)" />
          <stop offset="100%" stop-color="var(--nw-wave-core-mid)" stop-opacity="0" />
        </radialGradient>

        <!--
          外围柔光改为 SVG 径向渐变圆，而不是盒子外的模糊图层：
          模糊图层实际绘制范围会超出方形布局盒（实测达 455px / 440px），
          导致“图形比圆形盒子更大”，视觉上就像圆被拉伸或裁切。
          放在 viewBox 内后，绘制范围严格等于布局盒。
        -->
        <radialGradient id="nwWaveHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--nw-wave-core-mid)" stop-opacity="0.9" />
          <stop offset="62%" stop-color="var(--nw-wave-ring-soft)" stop-opacity="0.5" />
          <stop offset="100%" stop-color="var(--nw-wave-ring-soft)" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 0. 外围柔光：严格收在 viewBox 内 -->
      <circle class="nw-audio-wave__halo" :cx="CENTER" :cy="CENTER" r="202" fill="url(#nwWaveHalo)" />

      <!-- 1. 内核柔光：让圆心不至于空旷，但不形成硬光圈 -->
      <circle :cx="CENTER" :cy="CENTER" r="128" fill="url(#nwWaveCore)" />

      <!-- 2. 同心波纹环：低对比、轻微径向变化 -->
      <g class="nw-audio-wave__rings">
        <circle
          v-for="(radius, index) in RING_RADII"
          :key="`ring-${radius}`"
          :class="['nw-audio-wave__ring', { 'nw-audio-wave__ring--soft': index % 2 === 1 }]"
          :cx="CENTER"
          :cy="CENTER"
          :r="radius"
          fill="none"
          :stroke="index % 2 === 1 ? 'var(--nw-wave-ring-soft)' : 'var(--nw-wave-ring)'"
          stroke-width="0.9"
        />
      </g>

      <!-- 3. 三圈环绕声纹柱体 -->
      <g
        v-for="(ring, ringIndex) in rings"
        :key="ring.id"
        class="nw-audio-wave__ring-group"
        :class="{ 'nw-audio-wave__ring-group--reverse': ring.reverse }"
        :style="{ '--nw-wave-cycle': `${ring.duration}s` }"
      >
        <line
          v-for="bar in ring.bars"
          :key="`${ring.id}-${bar.id}`"
          class="nw-audio-wave__bar"
          :x1="CENTER + Math.cos((bar.angle * Math.PI) / 180) * bar.inner"
          :y1="CENTER + Math.sin((bar.angle * Math.PI) / 180) * bar.inner"
          :x2="CENTER + Math.cos((bar.angle * Math.PI) / 180) * bar.outer"
          :y2="CENTER + Math.sin((bar.angle * Math.PI) / 180) * bar.outer"
          stroke-linecap="round"
          :stroke-width="ring.width"
          :style="{
            stroke: `var(--nw-wave-bar-${ringIndex + 1})`,
            '--nw-wave-bar-duration': `${barDuration(ringIndex)}s`,
            '--nw-wave-bar-delay': `${barDelay(ringIndex, bar.id)}s`,
          }"
        />
      </g>

      <!-- 4. 环绕光点：数量少而精 -->
      <g class="nw-audio-wave__nodes">
        <circle
          v-for="node in nodes"
          :key="`node-${node.id}`"
          :cx="CENTER + Math.cos((node.angle * Math.PI) / 180) * node.radius"
          :cy="CENTER + Math.sin((node.angle * Math.PI) / 180) * node.radius"
          r="2.2"
          fill="var(--nw-wave-node)"
          opacity="0.7"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
/*
 * 布局与图形严格分离：
 *   .nw-audio-wave  —— 只负责正方形布局盒（1:1）
 *   __canvas        —— 只负责在盒内等比绘制，不做任何非等比缩放
 * 全部图形（含外围柔光）都限制在 viewBox 内，因此不需要 overflow: visible；
 * 一旦允许溢出，元素的实际绘制范围会大于方形布局盒，视觉上就会被看成“变形”。
 */
.nw-audio-wave {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  /* 兜底：父级尺寸异常时也不允许被压成非正方形 */
  min-width: 0;
}

.nw-audio-wave__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* 外围柔光：SVG 元素，仅做氛围 */
.nw-audio-wave__halo {
  animation: nw-wave-halo-breathe var(--nw-duration-breathe) var(--nw-ease-in-out) infinite;
}

/* 同心波纹：极弱的呼吸，只改透明度 */
.nw-audio-wave__ring {
  animation: nw-wave-ring-breathe 11s var(--nw-ease-in-out) infinite;
}

.nw-audio-wave__ring:nth-child(2) {
  animation-delay: -2.8s;
}

.nw-audio-wave__ring:nth-child(3) {
  animation-delay: -5.6s;
}

.nw-audio-wave__ring:nth-child(4) {
  animation-delay: -8.4s;
}

/* 环绕声纹：整圈缓慢旋转 */
.nw-audio-wave__ring-group {
  transform-box: view-box;
  transform-origin: center;
  animation: nw-wave-spin var(--nw-wave-cycle, 100s) linear infinite;
}

.nw-audio-wave__ring-group--reverse {
  animation-direction: reverse;
}

/* 单根柱体：沿自身方向轻轻伸缩，看起来像声波在圆周上流动 */
.nw-audio-wave__bar {
  transform-box: fill-box;
  transform-origin: center;
  animation: nw-wave-bar-breathe var(--nw-wave-bar-duration, 8s) var(--nw-ease-in-out)
    var(--nw-wave-bar-delay, 0s) infinite;
}

.nw-audio-wave__nodes {
  transform-box: view-box;
  transform-origin: center;
  animation: nw-wave-spin 150s linear infinite reverse;
}

@keyframes nw-wave-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes nw-wave-bar-breathe {
  0%,
  100% {
    transform: scaleX(0.72);
  }

  50% {
    transform: scaleX(1);
  }
}

@keyframes nw-wave-ring-breathe {
  0%,
  100% {
    opacity: 0.62;
  }

  50% {
    opacity: 1;
  }
}

@keyframes nw-wave-halo-breathe {
  0%,
  100% {
    opacity: 0.42;
  }

  50% {
    opacity: 0.58;
  }
}

/* 减少动态效果：全部静态化，仅保留图形本身 */
@media (prefers-reduced-motion: reduce) {
  .nw-audio-wave--animated .nw-audio-wave__halo,
  .nw-audio-wave--animated .nw-audio-wave__ring,
  .nw-audio-wave--animated .nw-audio-wave__ring-group,
  .nw-audio-wave--animated .nw-audio-wave__bar,
  .nw-audio-wave--animated .nw-audio-wave__nodes {
    animation: none;
  }
}
</style>
