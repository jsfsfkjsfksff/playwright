<script setup lang="ts">
/**
 * PageHeader —— 页面标题区域
 * ---------------------------------------------------------------
 * 职责：只负责“标题 + 两侧装饰线”的呈现与语义。
 * 不包含导航、返回、操作按钮等任何未被要求的元素。
 *
 * 主题：颜色、字号、光晕均来自语义化主题令牌，日间模式接入时无需改动本组件。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 标题文本 */
    title: string
    /** 是否显示两侧装饰线 */
    decorated?: boolean
  }>(),
  { decorated: true },
)

const rootClasses = computed(() => [
  'nw-page-header',
  { 'nw-page-header--decorated': props.decorated },
])
</script>

<template>
  <header :class="rootClasses">
    <span class="nw-page-header__rule" aria-hidden="true">
      <span class="nw-page-header__dot" />
    </span>

    <h1 class="nw-page-header__title">{{ title }}</h1>

    <span class="nw-page-header__rule nw-page-header__rule--trailing" aria-hidden="true">
      <span class="nw-page-header__dot" />
    </span>
  </header>
</template>

<style scoped>
.nw-page-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 1.6vw, 1.5rem);
  width: 100%;
}

/* ---------- 装饰线 ---------- */
.nw-page-header__rule {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: clamp(3.5rem, 11vw, 10.5rem);
  height: 1px;
  background-image: linear-gradient(90deg, transparent, var(--nw-color-border-strong));
}

.nw-page-header__rule--trailing {
  justify-content: flex-start;
  background-image: linear-gradient(90deg, var(--nw-color-border-strong), transparent);
}

/* 几何光点：小块菱形，亮度克制 */
.nw-page-header__dot {
  width: 5px;
  height: 5px;
  background-color: var(--nw-color-accent-strong);
  box-shadow: 0 0 10px var(--nw-color-focus-ring);
  opacity: 0.8;
  transform: rotate(45deg);
}

/* ---------- 标题 ---------- */
.nw-page-header__title {
  flex-shrink: 0;
  margin: 0;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-display);
  font-weight: var(--nw-font-weight-medium);
  line-height: var(--nw-line-height-tight);
  letter-spacing: var(--nw-letter-spacing-display);
  /* 字距会在末尾多出一份空隙，向左补偿以保持视觉居中 */
  text-indent: var(--nw-letter-spacing-display);
  white-space: nowrap;
  text-shadow: var(--nw-glow-accent);
}

@media (prefers-reduced-motion: reduce) {
  .nw-page-header__dot {
    box-shadow: none;
  }
}
</style>
