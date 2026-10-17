<script setup lang="ts">
/**
 * BackLink —— 返回上一层的图标按钮
 * ---------------------------------------------------------------
 * 职责：提供一个语义明确、可键盘访问的返回入口。
 * 站内目前有多个页面需要返回（功能选择页与两个占位页），因此抽为通用组件。
 * 视觉沿用夜间主题的玻璃材质令牌，与 FeaturePanel 的光影语言一致。
 *
 * 返回目标默认是首页（主界面）；调用方可用 `to` 指定其它目标，
 * 例如创作台的子页面返回故事选择页。
 */
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

import { ROUTE_NAMES } from '@/router/routes'

withDefaults(
  defineProps<{
    /** 返回目标的文案，用于无障碍标签 */
    label: string
    /** 返回目标；不传则回首页（主界面） */
    to?: RouteLocationRaw
  }>(),
  { label: '返回', to: () => ({ name: ROUTE_NAMES.home }) },
)
</script>

<template>
  <RouterLink class="nw-back-link" :to="to" :aria-label="label" :title="label">
    <svg class="nw-back-link__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M11.6 5.4 7 10l4.6 4.6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </RouterLink>
</template>

<style scoped>
.nw-back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: var(--nw-color-text-secondary);
  background-color: var(--nw-color-surface);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight) 0%, transparent 52%);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  box-shadow: var(--nw-shadow-inset-top);
  backdrop-filter: blur(var(--nw-blur-md));
  -webkit-backdrop-filter: blur(var(--nw-blur-md));
  transition: var(--nw-transition-interactive);
  -webkit-tap-highlight-color: transparent;
}

.nw-back-link__icon {
  width: 18px;
  height: 18px;
}

.nw-back-link:hover {
  color: var(--nw-color-accent-strong);
  border-color: var(--nw-color-border-strong);
  background-color: var(--nw-color-accent-hover);
  box-shadow: var(--nw-glow-accent-soft);
  transform: translateX(-2px);
}

.nw-back-link:active {
  transform: translateX(-2px) scale(0.97);
  transition-duration: var(--nw-duration-fast);
}

.nw-back-link:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 3px;
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-back-link {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-back-link {
    transition: none;
  }

  .nw-back-link:hover,
  .nw-back-link:active {
    transform: none;
  }
}
</style>
