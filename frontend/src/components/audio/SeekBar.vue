<script setup lang="ts">
/**
 * SeekBar —— 自定义播放进度条（点击 / 拖拽 / 键盘三向跳转）
 * ---------------------------------------------------------------
 * 为什么不用 `<input type="range">`：
 *   range 的滑块样式在各内核下不一致，而且无法稳定画出「已播 / 缓冲 / 悬停预览」
 *   三层叠加的视觉。这里用 div + 指针事件自己实现，尺寸与视觉完全可控。
 *
 * 交互约定：
 *   1. **点击轨道任意位置** → 立刻跳到该位置（单击即 seek，不是只拖动滑块）；
 *   2. **按住拖动** → 拇指跟随手指 / 鼠标（pointer capture，移出轨道也不丢事件）；
 *   3. 拖动过程中**只预览**（emit preview，父级显示时间气泡），
 *      松手才真正 emit seek —— 避免拖动时疯狂改 currentTime 导致音频爆音；
 *   4. 键盘：←/→ ±step，Home/End 到两端，PageUp/PageDown ±10step；
 *   5. 拖动期间父级应暂停「用 currentTime 覆盖滑块位置」（见 PlayerView 的 isSeeking）。
 *
 * 无障碍：role="slider" + aria-valuemin/max/now/text，可聚焦、可用键盘操作。
 */
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 当前播放位置（秒） */
    currentTime: number
    /** 总时长（秒）；未知时传 0 */
    duration: number
    /** 已缓冲到的时间（秒），没有缓冲信息时传 0 */
    buffered?: number
    /** 禁用（没有音频地址时） */
    disabled?: boolean
    /** 键盘单步（秒） */
    step?: number
  }>(),
  { buffered: 0, disabled: false, step: 5 },
)

const emit = defineEmits<{
  /** 松手后真正跳转 */
  (event: 'seek', seconds: number): void
  /** 拖动过程中的预览（用于时间气泡） */
  (event: 'preview', seconds: number | null): void
}>()

const trackRef = ref<HTMLElement | null>(null)

/** 是否正在拖动 */
const dragging = ref(false)

/** 拖动中的临时位置（秒）；null 表示没在拖动 */
const dragTime = ref<number | null>(null)

/** 悬停位置（用于轨道上的预览点） */
const hoverTime = ref<number | null>(null)

const maxSeconds = computed(() => (props.duration > 0 ? props.duration : 0))

/** 拖动中显示拖动位置，否则显示真实播放位置 */
const displayTime = computed(() => dragTime.value ?? props.currentTime)

const playedPercent = computed(() => toPercent(displayTime.value))
const bufferedPercent = computed(() => toPercent(props.buffered))
const hoverPercent = computed(() => (hoverTime.value === null ? null : toPercent(hoverTime.value)))

function toPercent(seconds: number): number {
  if (maxSeconds.value <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (seconds / maxSeconds.value) * 100))
}

/** 指针位置 → 秒（用轨道自身的 rect，天然适配窗口缩放 / 布局变化） */
function timeAt(clientX: number): number {
  const element = trackRef.value
  if (element === null || maxSeconds.value <= 0) {
    return 0
  }

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0) {
    return 0
  }

  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return ratio * maxSeconds.value
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--'
  }

  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/* =============================================================
 * 指针交互
 * ============================================================= */

function handlePointerDown(event: PointerEvent): void {
  if (props.disabled) {
    return
  }

  // 点击即跳：按下位置就是目标时间
  dragging.value = true
  const target = timeAt(event.clientX)
  dragTime.value = target
  emit('preview', target)

  // 指针捕获：手指 / 鼠标移出轨道也不丢事件
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function handlePointerMove(event: PointerEvent): void {
  if (props.disabled) {
    return
  }

  const target = timeAt(event.clientX)
  hoverTime.value = target

  if (!dragging.value) {
    return
  }

  dragTime.value = target
  emit('preview', target)
}

function handlePointerUp(event: PointerEvent): void {
  hoverTime.value = timeAt(event.clientX)

  if (!dragging.value) {
    return
  }

  const target = dragTime.value ?? timeAt(event.clientX)

  dragging.value = false
  dragTime.value = null
  emit('preview', null)
  emit('seek', target)

  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId)
  }
}

/** 指针离开：清掉悬停预览（拖动中不清，否则气泡会闪） */
function handlePointerLeave(): void {
  if (!dragging.value) {
    hoverTime.value = null
  }
}

/* =============================================================
 * 键盘
 * ============================================================= */

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled || maxSeconds.value <= 0) {
    return
  }

  const current = props.currentTime
  let target: number | null = null

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      target = current - props.step
      break
    case 'ArrowRight':
    case 'ArrowUp':
      target = current + props.step
      break
    case 'PageDown':
      target = current - props.step * 10
      break
    case 'PageUp':
      target = current + props.step * 10
      break
    case 'Home':
      target = 0
      break
    case 'End':
      target = maxSeconds.value
      break
    default:
      return
  }

  event.preventDefault()
  emit('seek', Math.min(maxSeconds.value, Math.max(0, target)))
}

const ariaNow = computed(() => Math.round(displayTime.value))
const ariaMax = computed(() => Math.round(maxSeconds.value))
const ariaText = computed(
  () => `${formatTime(displayTime.value)} / ${maxSeconds.value > 0 ? formatTime(maxSeconds.value) : '--:--'}`,
)
</script>

<template>
  <div class="nw-seekbar" :class="{ 'nw-seekbar--disabled': disabled, 'nw-seekbar--dragging': dragging }">
    <span class="nw-seekbar__time">{{ formatTime(displayTime) }}</span>

    <div
      ref="trackRef"
      class="nw-seekbar__track"
      role="slider"
      :tabindex="disabled ? -1 : 0"
      :aria-valuemin="0"
      :aria-valuemax="ariaMax"
      :aria-valuenow="ariaNow"
      :aria-valuetext="ariaText"
      aria-label="播放进度"
      :aria-disabled="disabled"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="handlePointerLeave"
      @keydown="handleKeydown"
    >
      <!-- 轨道底：未播放 -->
      <span class="nw-seekbar__rail" aria-hidden="true" />

      <!-- 已缓冲 -->
      <span
        class="nw-seekbar__buffered"
        :style="{ width: `${bufferedPercent}%` }"
        aria-hidden="true"
      />

      <!-- 已播放 -->
      <span class="nw-seekbar__played" :style="{ width: `${playedPercent}%` }" aria-hidden="true" />

      <!-- 悬停预览点 -->
      <span
        v-if="hoverPercent !== null && maxSeconds > 0"
        class="nw-seekbar__hover"
        :style="{ left: `${hoverPercent}%` }"
        aria-hidden="true"
      />

      <!-- 拇指 -->
      <span class="nw-seekbar__thumb" :style="{ left: `${playedPercent}%` }" aria-hidden="true" />
    </div>

    <span class="nw-seekbar__time">
      {{ maxSeconds > 0 ? formatTime(maxSeconds) : '--:--' }}
    </span>
  </div>
</template>

<style scoped>
.nw-seekbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--nw-space-sm);
  width: 100%;
}

.nw-seekbar__time {
  color: var(--nw-color-text-secondary);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--nw-letter-spacing-wide);
}

/* ---------- 轨道 ---------- */
.nw-seekbar__track {
  position: relative;
  display: block;
  height: 1.5rem;
  cursor: pointer;
  touch-action: none; /* 拖动时不要触发页面滚动 */
  outline: none;
}

.nw-seekbar__rail,
.nw-seekbar__buffered,
.nw-seekbar__played {
  position: absolute;
  top: 50%;
  left: 0;
  height: 4px;
  border-radius: var(--nw-radius-pill);
  transform: translateY(-50%);
  pointer-events: none;
}

.nw-seekbar__rail {
  width: 100%;
  background-color: var(--nw-color-border);
  box-shadow: var(--nw-shadow-inset-top);
}

.nw-seekbar__buffered {
  background-color: var(--nw-color-border-strong);
  opacity: 0.55;
}

.nw-seekbar__played {
  background-image: linear-gradient(90deg, var(--nw-color-accent), var(--nw-color-accent-contrast));
  box-shadow: 0 0 12px var(--nw-color-accent-hover);
}

/* ---------- 悬停预览点 ---------- */
.nw-seekbar__hover {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 12px;
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-text-tertiary);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* ---------- 拇指 ---------- */
.nw-seekbar__thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border: var(--nw-border-width-strong) solid var(--nw-color-accent-contrast);
  border-radius: 50%;
  background-color: var(--nw-color-surface-elevated);
  box-shadow: var(--nw-glow-accent);
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: transform var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-seekbar:hover .nw-seekbar__thumb,
.nw-seekbar--dragging .nw-seekbar__thumb,
.nw-seekbar__track:focus-visible .nw-seekbar__thumb {
  transform: translate(-50%, -50%) scale(1.25);
}

/* 键盘焦点环画在轨道上 */
.nw-seekbar__track:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 6px;
  border-radius: var(--nw-radius-pill);
}

/* ---------- 禁用 ---------- */
.nw-seekbar--disabled {
  opacity: 0.55;
}

.nw-seekbar--disabled .nw-seekbar__track {
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .nw-seekbar__thumb {
    transition: none;
  }
}
</style>
