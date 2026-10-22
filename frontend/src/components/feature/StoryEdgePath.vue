<script setup lang="ts">
/**
 * StoryEdgePath —— 画布连线（霓虹发光贝塞尔）
 * ---------------------------------------------------------------
 * 需求：卡片之间的连线用平滑贝塞尔曲线 + 霓虹发光；拖动卡片时实时跟随。
 *
 * 坐标从哪来：
 *   Vue Flow 会把两端节点的连接点坐标（sourceX / sourceY / targetX / targetY）算好后
 *   通过 EdgeProps 传给自定义边 —— 也就是说，拖拽时库自己在重算，我们只负责画。
 *   （如果不用库，就得自己 getBoundingClientRect + 监听 scroll/resize/rAF，这正是
 *     本项目选择引入 @vue-flow/core 的原因。）
 *
 * 三层结构：
 *   1. glow：粗、低透明度、blur 过滤 —— 霓虹光晕；
 *   2. core：细、实色、带箭头 —— 清晰的线体；
 *   3. hit：透明但很粗，只为扩大点击热区（点它 = 删除这条边）。
 */
import { computed } from 'vue'
import { getBezierPath, type Position } from '@vue-flow/core'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  selected: boolean
}>()

const emit = defineEmits<{
  (event: 'remove', edgeId: string): void
}>()

/**
 * 三次贝塞尔路径。
 * curvature 取 0.25：两端是水平连接点时曲线最自然（库的默认值也是 0.25）。
 */
const path = computed(
  () =>
    getBezierPath({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
      curvature: 0.25,
    })[0],
)
</script>

<template>
  <g class="nw-story-edge" :class="{ 'nw-story-edge--selected': selected }">
    <!-- 1. 光晕 -->
    <path class="nw-story-edge__glow" :d="path" aria-hidden="true" />

    <!-- 2. 线体 + 箭头 -->
    <path class="nw-story-edge__core" :d="path" marker-end="url(#nw-story-arrow)" aria-hidden="true" />

    <!-- 3. 点击热区（视觉透明） -->
    <path
      class="nw-story-edge__hit"
      :d="path"
      role="button"
      tabindex="0"
      :aria-label="`删除连线 ${id}`"
      @click.stop="emit('remove', id)"
      @keydown.enter.stop="emit('remove', id)"
      @keydown.space.stop.prevent="emit('remove', id)"
    />
  </g>
</template>

<style scoped>
.nw-story-edge__glow,
.nw-story-edge__core,
.nw-story-edge__hit {
  fill: none;
  stroke-linecap: round;
  transition: stroke var(--nw-duration-fast) var(--nw-ease-out);
}

/* 光晕：粗、虚、带模糊 */
.nw-story-edge__glow {
  stroke: var(--nw-color-accent);
  stroke-width: 9;
  opacity: 0.38;
  filter: blur(5px);
}

/* 线体：细、实、带少量发光 */
.nw-story-edge__core {
  stroke: var(--nw-color-accent-contrast);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 7px var(--nw-color-focus-ring));
}

/* 悬停 / 选中：整体提亮 */
.nw-story-edge:hover .nw-story-edge__glow,
.nw-story-edge--selected .nw-story-edge__glow {
  stroke: var(--nw-color-accent-contrast);
  opacity: 0.45;
}

.nw-story-edge:hover .nw-story-edge__core,
.nw-story-edge--selected .nw-story-edge__core {
  stroke: var(--nw-color-accent-contrast);
  stroke-width: 2.6;
}

/* 点击热区：视觉不可见，但足够粗，便于点中 */
.nw-story-edge__hit {
  stroke: transparent;
  stroke-width: 22;
  cursor: pointer;
  pointer-events: stroke;
  outline: none;
}

.nw-story-edge__hit:focus-visible {
  stroke: var(--nw-color-focus-ring);
  stroke-width: 22;
  opacity: 0.35;
}

@media (prefers-reduced-motion: reduce) {
  .nw-story-edge__glow,
  .nw-story-edge__core,
  .nw-story-edge__hit {
    transition: none;
  }
}
</style>
