<script setup lang="ts">
/**
 * AppButton —— 全站通用按钮
 * ---------------------------------------------------------------
 * 职责：统一的尺寸、变体、状态（悬停 / 按下 / 焦点 / 禁用）与槽形轮廓。
 * 不依赖任何页面 DOM 结构；`notched` 变体是本站欢迎页按钮的视觉基础。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { buildNotchOutline } from '@/utils/notchOutline'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    /** 视觉变体 */
    variant?: ButtonVariant
    /** 尺寸档位，xl 用于欢迎页的宽幅主按钮 */
    size?: ButtonSize
    /** 原生按钮类型 */
    nativeType?: 'button' | 'submit' | 'reset'
    /** 是否禁用 */
    disabled?: boolean
    /** 是否启用两侧内凹槽轮廓 */
    notched?: boolean
    /** 是否占满容器宽度 */
    block?: boolean
    /** 是否处于加载中：展示进度指示、拦截重复提交并播报状态 */
    loading?: boolean
    /** 加载中时给屏幕阅读器的说明文案 */
    loadingLabel?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    nativeType: 'button',
    disabled: false,
    notched: false,
    block: false,
    loading: false,
    loadingLabel: '处理中',
  },
)

const emit = defineEmits<{
  /** 用户点击（禁用状态不会触发） */
  click: [event: MouseEvent]
}>()

/** 描边宽度，与 CSS 中 --nw-app-button-stroke 保持一致 */
const STROKE_WIDTH = 1

const buttonElement = ref<HTMLButtonElement | null>(null)
const boxSize = ref({ width: 0, height: 0 })
let resizeObserver: ResizeObserver | null = null

function measure(): void {
  const element = buttonElement.value
  if (!element) {
    return
  }

  const rect = element.getBoundingClientRect()
  if (rect.width === boxSize.value.width && rect.height === boxSize.value.height) {
    return
  }

  boxSize.value = { width: rect.width, height: rect.height }
}

onMounted(() => {
  measure()

  if (typeof ResizeObserver === 'undefined') {
    return
  }

  // 仅在尺寸真正变化时更新，避免无意义的重绘
  resizeObserver = new ResizeObserver(measure)
  if (buttonElement.value) {
    resizeObserver.observe(buttonElement.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

/** 外轮廓与内轮廓：尺寸未测量完成前不下发 clip-path，避免闪现错误形状 */
const outerClipPath = computed(() => {
  if (!props.notched || boxSize.value.width === 0) {
    return undefined
  }
  return buildNotchOutline({ ...boxSize.value, inset: 0 })
})

const innerClipPath = computed(() => {
  if (!props.notched || boxSize.value.width === 0) {
    return undefined
  }
  return buildNotchOutline({ ...boxSize.value, inset: STROKE_WIDTH })
})

const rootClasses = computed(() => [
  'nw-app-button',
  `nw-app-button--${props.variant}`,
  `nw-app-button--${props.size}`,
  {
    'nw-app-button--notched': props.notched,
    'nw-app-button--block': props.block,
    'nw-app-button--loading': props.loading,
  },
])

/** 加载中视为不可交互，避免重复提交 */
const isInteractionBlocked = computed(() => props.disabled || props.loading)

function handleClick(event: MouseEvent): void {
  if (isInteractionBlocked.value) {
    event.preventDefault()
    return
  }
  emit('click', event)
}

defineExpose({ focus: () => buttonElement.value?.focus() })
</script>

<template>
  <button
    ref="buttonElement"
    :type="nativeType"
    :class="rootClasses"
    :disabled="disabled"
    :aria-disabled="disabled || undefined"
    :aria-busy="loading || undefined"
    @click="handleClick"
  >
    <span class="nw-app-button__shape" :style="{ clipPath: outerClipPath }" aria-hidden="true">
      <span class="nw-app-button__inner" :style="{ clipPath: innerClipPath }" />
    </span>

    <span class="nw-app-button__label">
      <span v-if="$slots.leading" class="nw-app-button__affix nw-app-button__affix--leading">
        <slot name="leading" />
      </span>

      <!-- 加载指示：不改变按钮尺寸，仅替换图标位置的内容 -->
      <span v-if="loading" class="nw-app-button__spinner" aria-hidden="true" />

      <!--
        加载中把按钮文案换成 loadingLabel（如「生成中」「保存中」），
        让「正在处理」这件事在视觉上成立，而不是只有一个转圈。
        文案本身对屏幕阅读器可见，因此不再另加 visually-hidden 副本。
      -->
      <span class="nw-app-button__text">
        <template v-if="loading">{{ loadingLabel }}</template>
        <slot v-else />
      </span>

      <span v-if="$slots.trailing" class="nw-app-button__affix nw-app-button__affix--trailing">
        <slot name="trailing" />
      </span>
    </span>
  </button>
</template>

<style scoped>
/* =============================================================
 * 块：nw-app-button
 * ============================================================= */
.nw-app-button {
  --nw-app-button-stroke: 1px;
  --nw-app-button-fill: var(--nw-color-surface);
  --nw-app-button-stroke-color: var(--nw-color-glass-edge);
  --nw-app-button-text-color: var(--nw-color-text-primary);
  --nw-app-button-glow: none;

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  padding: 0 var(--nw-space-xl);
  color: var(--nw-app-button-text-color);
  font-family: inherit;
  font-weight: var(--nw-font-weight-medium);
  line-height: 1;
  text-align: center;
  border-radius: var(--nw-radius-sm);
  background: none;
  cursor: pointer;
  transition: var(--nw-transition-interactive);
  -webkit-tap-highlight-color: transparent;
}

.nw-app-button--block {
  display: flex;
  width: 100%;
}

/* 形状层：外层为描边色块，内层为玻璃填充 */
.nw-app-button__shape {
  position: absolute;
  inset: 0;
  z-index: var(--nw-z-base);
  overflow: hidden;
  border-radius: inherit;
  background-color: var(--nw-app-button-stroke-color);
  transition: background-color var(--nw-duration-base) var(--nw-ease-out);
}

.nw-app-button__shape::after {
  /* 顶部斜向高光：控制面积，仅占上沿一小条 */
  position: absolute;
  inset: 0;
  content: '';
  background-image: linear-gradient(
    168deg,
    var(--nw-color-glass-highlight) 0%,
    var(--nw-color-glass-sheen) 26%,
    transparent 52%
  );
  opacity: 0.9;
  pointer-events: none;
}

.nw-app-button__inner {
  position: absolute;
  inset: 0;
  background-color: var(--nw-app-button-fill);
  background-image: linear-gradient(
    180deg,
    var(--nw-color-button-fill-primary-top) 0%,
    var(--nw-color-button-fill-primary-bottom) 100%
  );
  backdrop-filter: blur(var(--nw-blur-md)) saturate(118%);
  -webkit-backdrop-filter: blur(var(--nw-blur-md)) saturate(118%);
  transition: background-color var(--nw-duration-base) var(--nw-ease-out);
}

/* 内容层 */
.nw-app-button__label {
  position: relative;
  z-index: var(--nw-z-content);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--nw-space-sm);
  pointer-events: none;
}

.nw-app-button__text {
  display: inline-block;
}

.nw-app-button__affix {
  display: inline-flex;
  align-items: center;
  color: var(--nw-color-accent-strong);
  opacity: 0.68;
  transition: opacity var(--nw-duration-base) var(--nw-ease-out);
}

/* =============================================================
 * 尺寸档位：横向宽幅，高宽比稳定
 * ============================================================= */
.nw-app-button--md {
  min-height: 44px;
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-app-button--lg {
  min-height: 52px;
  padding-inline: clamp(1.75rem, 3vw, 2.75rem);
  font-size: var(--nw-font-size-md);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-app-button--xl {
  min-height: clamp(48px, 5.4vh, 70px);
  padding-inline: clamp(2rem, 4vw, 3.5rem);
  font-size: clamp(0.9375rem, 0.72rem + 0.5vw, 1.1875rem);
  letter-spacing: var(--nw-letter-spacing-widest);
  border-radius: var(--nw-radius-sm);
}

/* =============================================================
 * 变体
 * ============================================================= */
.nw-app-button--primary {
  --nw-app-button-glow: var(--nw-glow-accent-soft);
}

.nw-app-button--secondary {
  --nw-app-button-fill: var(--nw-color-button-fill-secondary);
  --nw-app-button-stroke-color: var(--nw-color-border);
  --nw-app-button-text-color: var(--nw-color-text-secondary);
}

.nw-app-button--secondary .nw-app-button__inner {
  background-image: linear-gradient(
    180deg,
    var(--nw-color-button-fill-secondary-top) 0%,
    var(--nw-color-button-fill-secondary-bottom) 100%
  );
}

.nw-app-button--ghost {
  --nw-app-button-fill: transparent;
  --nw-app-button-stroke-color: transparent;
  --nw-app-button-text-color: var(--nw-color-text-tertiary);
}

.nw-app-button--ghost .nw-app-button__shape::after {
  opacity: 0;
}

/* =============================================================
 * 交互状态
 * ============================================================= */
.nw-app-button:hover:not(:disabled) {
  --nw-app-button-stroke-color: var(--nw-color-border-strong);
  --nw-app-button-text-color: var(--nw-color-accent-contrast);

  box-shadow: var(--nw-app-button-glow);
  transform: translateY(-1px);
}

.nw-app-button--primary:hover:not(:disabled) .nw-app-button__inner {
  background-color: var(--nw-color-button-fill-primary-hover);
}

.nw-app-button--secondary:hover:not(:disabled) .nw-app-button__inner {
  background-color: var(--nw-color-button-fill-secondary-hover);
}

.nw-app-button:hover:not(:disabled) .nw-app-button__affix {
  opacity: 0.92;
}

.nw-app-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
  transition-duration: var(--nw-duration-fast);
}

.nw-app-button:active:not(:disabled) .nw-app-button__inner {
  background-color: var(--nw-color-button-fill-active);
}

/* 键盘焦点：清晰但克制的双层光环 */
.nw-app-button:focus-visible {
  outline: none;
}

.nw-app-button:focus-visible::after {
  position: absolute;
  inset: -4px;
  z-index: var(--nw-z-behind);
  content: '';
  border: var(--nw-border-width-strong) solid var(--nw-color-focus-ring);
  border-radius: calc(var(--nw-radius-sm) + 4px);
  box-shadow: 0 0 0 4px var(--nw-color-accent-hover);
  pointer-events: none;
}

/*
 * 禁用与加载共用同一套「置灰」观感：
 * 加载中不设原生 disabled（避免键盘焦点被丢掉），只由 --loading 类承担视觉，
 * 点击仍由 handleClick 拦截，不会重复提交。
 */
.nw-app-button:disabled,
.nw-app-button--loading {
  --nw-app-button-stroke-color: var(--nw-color-border-subtle);
  --nw-app-button-text-color: var(--nw-color-text-disabled);

  opacity: 0.72;
  transform: none;
  box-shadow: none;
}

.nw-app-button:disabled {
  cursor: not-allowed;
}

.nw-app-button:disabled .nw-app-button__affix,
.nw-app-button--loading .nw-app-button__affix {
  opacity: 0.4;
}

/* =============================================================
 * 加载中：保持尺寸不变，仅附加进度指示
 * ============================================================= */
.nw-app-button--loading {
  cursor: progress;
}

.nw-app-button--loading:hover {
  --nw-app-button-stroke-color: var(--nw-color-border-subtle);
  --nw-app-button-text-color: var(--nw-color-text-disabled);

  box-shadow: none;
  transform: none;
}

.nw-app-button__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid var(--nw-color-border-strong);
  border-top-color: var(--nw-color-accent-strong);
  border-radius: var(--nw-radius-circle);
  animation: nw-app-button-spin 880ms linear infinite;
}

@keyframes nw-app-button-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 不支持 backdrop-filter 时退化为不透明填充，保证文字可读性 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-app-button__inner {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-app-button,
  .nw-app-button__shape,
  .nw-app-button__inner,
  .nw-app-button__affix {
    transition: none;
  }

  .nw-app-button:hover:not(:disabled),
  .nw-app-button:active:not(:disabled) {
    transform: none;
  }

  /* 减少动效时不再旋转，改为静态指示环，避免持续动画 */
  .nw-app-button__spinner {
    animation: none;
    border-top-color: var(--nw-color-border-strong);
    border-left-color: var(--nw-color-accent-strong);
  }
}
</style>
