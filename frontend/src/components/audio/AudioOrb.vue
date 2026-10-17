<script setup lang="ts">
/**
 * AudioOrb —— 中央声音主体
 * ---------------------------------------------------------------
 * 由三部分构成，全部以 SVG / CSS 绘制，不使用位图：
 *   1. 半透明球体：表达声音传播的空间介质
 *   2. 轨道环与节点：表达声场轨迹与回响
 *   3. 频谱柱体（AudioSpectrum）：表达音频本身
 * 构图重心固定在球心，向外自然衰减，不产生硬边光圈。
 */
import AudioSpectrumBars from './AudioSpectrumBars.vue'

withDefaults(
  defineProps<{
    /** 是否启用缓慢的轨道旋转与频谱呼吸 */
    animated?: boolean
  }>(),
  { animated: true },
)

/** 画布与几何常量 */
const VIEW_BOX = 520
const CENTER = VIEW_BOX / 2
const SPHERE_RADIUS = 186

/** 轨道环：半长轴 / 半短轴 / 倾斜角，数值取自参考图的空间关系 */
const ORBITS = [
  { id: 'outer', rx: 246, ry: 84, rotate: -13, duration: 96, nodes: [0.16, 0.63] },
  { id: 'inner', rx: 208, ry: 68, rotate: 11, duration: 132, nodes: [0.38] },
] as const

/** 轨道节点半径 */
const NODE_RADIUS = 4.5
</script>

<template>
  <div class="nw-audio-orb" :class="{ 'nw-audio-orb--animated': animated }">
    <svg
      class="nw-audio-orb__canvas"
      :viewBox="`0 0 ${VIEW_BOX} ${VIEW_BOX}`"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <!--
          说明：以下渐变与描边的色值全部来自主题令牌（--nw-orb-* / --nw-spectrum-*）。
          SVG 的 stop-color 可以解析 var()，因此日间 / 夜间只换令牌取值，
          球体、轨道、频谱的形状与尺寸完全不变。
        -->
        <!-- 球体玻璃填充：左上偏亮，右下收暗，形成自然体积感 -->
        <radialGradient id="nwOrbBody" cx="42%" cy="34%" r="74%">
          <stop offset="0%" stop-color="var(--nw-orb-body-inner)" />
          <stop offset="46%" stop-color="var(--nw-orb-body-mid)" />
          <stop offset="100%" stop-color="var(--nw-orb-body-outer)" />
        </radialGradient>

        <!-- 球体边缘光：只在边缘出现，中心完全透明 -->
        <radialGradient id="nwOrbRim" cx="50%" cy="50%" r="50%">
          <stop offset="82%" stop-color="var(--nw-orb-rim-inner)" />
          <stop offset="95%" stop-color="var(--nw-orb-rim-mid)" />
          <stop offset="100%" stop-color="var(--nw-orb-rim-edge)" />
        </radialGradient>

        <!-- 球心柔光 -->
        <radialGradient id="nwOrbCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--nw-orb-core-inner)" />
          <stop offset="60%" stop-color="var(--nw-orb-core-mid)" />
          <stop offset="100%" stop-color="var(--nw-orb-body-outer)" stop-opacity="0" />
        </radialGradient>

        <!-- 轨道环描边渐变：两端淡出，避免闭合硬环 -->
        <linearGradient id="nwOrbitStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--nw-orb-orbit-inner)" />
          <stop offset="28%" stop-color="var(--nw-orb-orbit-mid)" />
          <stop offset="72%" stop-color="var(--nw-orb-orbit-mid)" />
          <stop offset="100%" stop-color="var(--nw-orb-orbit-inner)" />
        </linearGradient>

        <!-- 水平声场基准线 -->
        <linearGradient id="nwAxisStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--nw-orb-axis-inner)" />
          <stop offset="22%" stop-color="var(--nw-orb-axis-mid)" />
          <stop offset="50%" stop-color="var(--nw-orb-axis-center)" />
          <stop offset="78%" stop-color="var(--nw-orb-axis-mid)" />
          <stop offset="100%" stop-color="var(--nw-orb-axis-inner)" />
        </linearGradient>

        <filter id="nwOrbSoftGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>

        <filter id="nwOrbNodeGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <!-- ============ 1. 球体背后的一段轨道，制造前后穿插 ============ -->
      <g class="nw-audio-orb__orbit nw-audio-orb__orbit--behind" :transform="`rotate(${ORBITS[0].rotate} ${CENTER} ${CENTER})`">
        <ellipse
          :cx="CENTER"
          :cy="CENTER"
          :rx="ORBITS[0].rx"
          :ry="ORBITS[0].ry"
          fill="none"
          stroke="url(#nwOrbitStroke)"
          stroke-width="1"
        />
      </g>

      <!-- ============ 2. 球体本体 ============ -->
      <g class="nw-audio-orb__sphere">
        <circle :cx="CENTER" :cy="CENTER" :r="SPHERE_RADIUS" fill="url(#nwOrbBody)" />

        <!-- 内部柔光：制造“玻璃球内部有光”的错觉，但不形成硬边 -->
        <circle
          class="nw-audio-orb__core"
          :cx="CENTER"
          :cy="CENTER"
          :r="SPHERE_RADIUS * 0.86"
          fill="url(#nwOrbCore)"
        />

        <!-- 边缘光 -->
        <circle :cx="CENTER" :cy="CENTER" :r="SPHERE_RADIUS" fill="url(#nwOrbRim)" />

        <!-- 极细的球体轮廓，圆润无锐角 -->
        <circle
          :cx="CENTER"
          :cy="CENTER"
          :r="SPHERE_RADIUS"
          fill="none"
          stroke="var(--nw-orb-edge)"
          stroke-width="0.9"
          opacity="0.26"
        />

        <!-- 下半部反射弧：克制的局部高光 -->
        <path
          :d="`M ${CENTER - 116} ${CENTER + 140} A ${SPHERE_RADIUS} ${SPHERE_RADIUS} 0 0 0 ${CENTER + 116} ${CENTER + 140}`"
          fill="none"
          stroke="var(--nw-orb-sheen)"
          stroke-width="1.4"
          stroke-linecap="round"
          opacity="0.16"
          filter="url(#nwOrbSoftGlow)"
        />
      </g>

      <!-- ============ 3. 水平声场基准线（位于频谱之后） ============ -->
      <g class="nw-audio-orb__axis">
        <line
          :x1="CENTER - 232"
          :y1="CENTER"
          :x2="CENTER + 232"
          :y2="CENTER"
          stroke="url(#nwAxisStroke)"
          stroke-width="0.9"
          stroke-linecap="round"
          opacity="0.6"
        />
        <!-- 中心亮点 -->
        <circle :cx="CENTER" :cy="CENTER" r="7" fill="var(--nw-orb-core-light)" opacity="0.2" filter="url(#nwOrbSoftGlow)" />
        <circle :cx="CENTER" :cy="CENTER" r="2.1" fill="var(--nw-orb-center)" opacity="0.74" />
      </g>

      <!-- ============ 4. 频谱柱体（内嵌 SVG，按 viewBox 等比缩放） ============ -->
      <g class="nw-audio-orb__spectrum">
        <AudioSpectrumBars
          :x="CENTER - 200"
          :y="CENTER - 88"
          :width="400"
          :height="176"
          :animated="animated"
        />
      </g>

      <!-- ============ 5. 前方轨道环与节点 ============ -->
      <g
        v-for="orbit in ORBITS"
        :key="orbit.id"
        class="nw-audio-orb__orbit"
        :class="`nw-audio-orb__orbit--${orbit.id}`"
        :style="{ '--nw-orbit-duration': `${orbit.duration}s` }"
        :transform="`rotate(${orbit.rotate} ${CENTER} ${CENTER})`"
      >
        <ellipse
          :cx="CENTER"
          :cy="CENTER"
          :rx="orbit.rx"
          :ry="orbit.ry"
          fill="none"
          stroke="url(#nwOrbitStroke)"
          stroke-width="1"
        />

        <g v-for="(nodePosition, index) in orbit.nodes" :key="`${orbit.id}-node-${index}`">
          <circle
            :cx="CENTER + Math.cos(nodePosition * Math.PI * 2) * orbit.rx"
            :cy="CENTER + Math.sin(nodePosition * Math.PI * 2) * orbit.ry"
            :r="NODE_RADIUS * 2.1"
            fill="var(--nw-orb-node)"
            opacity="0.22"
            filter="url(#nwOrbNodeGlow)"
          />
          <circle
            :cx="CENTER + Math.cos(nodePosition * Math.PI * 2) * orbit.rx"
            :cy="CENTER + Math.sin(nodePosition * Math.PI * 2) * orbit.ry"
            :r="NODE_RADIUS * 0.78"
            fill="var(--nw-orb-node-core)"
            opacity="0.72"
          />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.nw-audio-orb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  /* 柔和外扩的冷蓝辉光，面积控制在整个主体的外围 */
  filter: var(--nw-glow-subject);
}

.nw-audio-orb__canvas {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* 频谱作为内嵌 SVG 承载，位置与尺寸由父级 SVG 坐标系决定 */
.nw-audio-orb__spectrum {
  overflow: visible;
}

.nw-audio-orb__core {
  animation: nw-orb-core-breathe var(--nw-duration-breathe) var(--nw-ease-in-out) infinite;
}

.nw-audio-orb__orbit {
  transform-box: view-box;
  transform-origin: center;
  animation: nw-orbit-drift var(--nw-orbit-duration, 96s) linear infinite;
}

.nw-audio-orb__orbit--behind {
  animation-duration: 118s;
}

/* 轨道极缓慢的往返摆动，而不是持续单向旋转，观感更安静 */
@keyframes nw-orbit-drift {
  0% {
    transform: rotate(-3.2deg);
  }

  50% {
    transform: rotate(3.2deg);
  }

  100% {
    transform: rotate(-3.2deg);
  }
}

@keyframes nw-orb-core-breathe {
  0%,
  100% {
    opacity: 0.82;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-audio-orb {
    filter: none;
  }

  .nw-audio-orb__orbit,
  .nw-audio-orb__core {
    animation: none;
  }
}
</style>
