<script setup lang="ts">
/**
 * AudioSpectrum —— 音频频谱竖条
 * ---------------------------------------------------------------
 * 职责：把频谱数据渲染为 SVG 竖条，并附带低频呼吸动画。
 * 图形缩放交给父级（AudioOrb）的 viewBox 决定，本组件不感知页面尺寸。
 */
import { buildSpectrumBars, buildSpectrumBreaths, SPECTRUM_VIEW_BOX } from '@/utils/spectrum'

const props = withDefaults(
  defineProps<{
    /** 频谱柱数量，奇数可保证中轴对称 */
    bars?: number
    /** 是否启用呼吸动画 */
    animated?: boolean
    /** 内嵌 SVG 的横向定位（父级 SVG 坐标系） */
    x?: number
    /** 内嵌 SVG 的纵向定位（父级 SVG 坐标系） */
    y?: number
    /** 内嵌 SVG 宽度 */
    width?: number
    /** 内嵌 SVG 高度 */
    height?: number
  }>(),
  {
    bars: 19,
    animated: true,
    x: 0,
    y: 0,
    width: SPECTRUM_VIEW_BOX.width,
    height: SPECTRUM_VIEW_BOX.height,
  },
)

/** 静态图形数据：按柱数量生成一次，多个实例共享同一份数据 */
const spectrumBars = buildSpectrumBars({ count: props.bars })
const spectrumBreaths = buildSpectrumBreaths(spectrumBars)

const viewBoxWidth = SPECTRUM_VIEW_BOX.width
const viewBoxHeight = SPECTRUM_VIEW_BOX.height
const middleX = viewBoxWidth / 2
</script>

<template>
  <svg
    class="nw-audio-spectrum"
    :class="{ 'nw-audio-spectrum--animated': animated }"
    :x="x"
    :y="y"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
    role="presentation"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <!-- 中心亮、两端收暗的冷蓝渐变；取值随主题切换 -->
      <linearGradient id="nwSpectrumFill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="var(--nw-spectrum-1)" />
        <stop offset="22%" stop-color="var(--nw-spectrum-2)" />
        <stop offset="44%" stop-color="var(--nw-spectrum-3)" />
        <stop offset="50%" stop-color="var(--nw-spectrum-core)" />
        <stop offset="56%" stop-color="var(--nw-spectrum-3)" />
        <stop offset="78%" stop-color="var(--nw-spectrum-2)" />
        <stop offset="100%" stop-color="var(--nw-spectrum-1)" />
      </linearGradient>

      <!--
        纵向渐隐：柱体两端略微收淡，避免整齐的硬切边。
        这里的 #fff 是遮罩（mask）的亮度值，只用来表达「不透明度」，
        不是可见颜色，因此不走 --nw-* 令牌，也不随主题切换。
      -->
      <linearGradient id="nwSpectrumVertical" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.5" />
        <stop offset="16%" stop-color="#fff" stop-opacity="1" />
        <stop offset="84%" stop-color="#fff" stop-opacity="1" />
        <stop offset="100%" stop-color="#fff" stop-opacity="0.5" />
      </linearGradient>

      <mask id="nwSpectrumMask">
        <rect x="0" y="0" :width="viewBoxWidth" :height="viewBoxHeight" fill="url(#nwSpectrumVertical)" />
      </mask>

      <!-- 柔光：只做轻微外扩，不形成亮带 -->
      <filter id="nwSpectrumGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="5.5" />
      </filter>
    </defs>

    <!-- 柔光层：同一组柱体模糊后低透明度叠加 -->
    <g class="nw-audio-spectrum__glow" filter="url(#nwSpectrumGlow)" opacity="0.2">
      <rect
        v-for="bar in spectrumBars"
        :key="`glow-${bar.id}`"
        :x="bar.x - bar.width / 2"
        :y="(viewBoxHeight - bar.height) / 2"
        :width="bar.width"
        :height="bar.height"
        :rx="bar.radius"
        fill="url(#nwSpectrumFill)"
      />
    </g>

    <!-- 主体层 -->
    <g class="nw-audio-spectrum__bars" mask="url(#nwSpectrumMask)">
      <rect
        v-for="(bar, index) in spectrumBars"
        :key="bar.id"
        :class="['nw-audio-spectrum__bar', { 'nw-audio-spectrum__bar--animated': animated }]"
        :x="bar.x - bar.width / 2"
        :y="(viewBoxHeight - bar.height) / 2"
        :width="bar.width"
        :height="bar.height"
        :rx="bar.radius"
        fill="url(#nwSpectrumFill)"
        :opacity="bar.opacity"
        :style="{
          '--nw-spectrum-duration': `${spectrumBreaths[index]?.duration ?? 10}s`,
          '--nw-spectrum-delay': `${spectrumBreaths[index]?.delay ?? 0}s`,
        }"
      />
    </g>

    <!-- 中轴基准线：极细，用于稳定视觉重心 -->
    <line
      class="nw-audio-spectrum__axis"
      :x1="middleX"
      y1="4"
      :x2="middleX"
      :y2="viewBoxHeight - 4"
      stroke="var(--nw-spectrum-axis)"
      stroke-width="0.75"
      stroke-linecap="round"
      opacity="0.14"
    />
  </svg>
</template>

<style scoped>
.nw-audio-spectrum {
  display: block;
  overflow: visible;
}

.nw-audio-spectrum__bar--animated {
  transform-box: fill-box;
  transform-origin: center;
  animation: nw-spectrum-breathe var(--nw-spectrum-duration, 10s) var(--nw-ease-in-out)
    var(--nw-spectrum-delay, 0s) infinite;
}

/* 柔光层同样只在 animated=true 时呼吸：否则「静态」的球体里仍有光在起伏 */
.nw-audio-spectrum__glow {
  transform-box: fill-box;
  transform-origin: center;
}

.nw-audio-spectrum--animated .nw-audio-spectrum__glow {
  animation: nw-spectrum-glow var(--nw-duration-breathe) var(--nw-ease-in-out) infinite;
}

/* 极低频、低幅度的纵向伸缩：最高 ±4.5% 高度 */
@keyframes nw-spectrum-breathe {
  0%,
  100% {
    transform: scaleY(0.955);
  }

  50% {
    transform: scaleY(1);
  }
}

@keyframes nw-spectrum-glow {
  0%,
  100% {
    opacity: 0.15;
  }

  50% {
    opacity: 0.24;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-audio-spectrum__bar--animated,
  .nw-audio-spectrum--animated .nw-audio-spectrum__glow {
    animation: none;
  }
}
</style>
