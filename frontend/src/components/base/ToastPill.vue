<script setup lang="ts">
/**
 * ToastPill —— 页面级轻提示
 * ---------------------------------------------------------------
 * 职责：呈现一条短提示，并在显示期间对辅助技术播报。
 * 不自行管理定时器：显隐时机由调用方决定，本组件只负责「显示 / 隐藏」两种视觉状态，
 * 避免同一页面出现多个互不知情的计时器。
 *
 * 主题：颜色、描边、模糊、阴影全部来自语义化令牌，日间模式接入后无需改动本组件。
 */
withDefaults(
  defineProps<{
    /** 提示文案；为空时本组件不占位、不播报 */
    message: string
    /** 是否显示 */
    visible?: boolean
  }>(),
  { visible: false },
)
</script>

<template>
  <div
    class="nw-toast"
    :class="{ 'nw-toast--show': visible && message !== '' }"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>

<style scoped>
.nw-toast {
  position: fixed;
  left: 50%;
  bottom: clamp(1rem, 3.2vh, 1.75rem);
  z-index: var(--nw-z-toast);
  max-width: min(90vw, 46rem);
  padding: 11px 22px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-surface-elevated);
  background-image: linear-gradient(
    96deg,
    var(--nw-color-glass-highlight),
    var(--nw-color-glass-sheen)
  );
  box-shadow: var(--nw-shadow-md);
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-align: center;
  backdrop-filter: blur(var(--nw-blur-md)) saturate(112%);
  opacity: 0;
  transform: translate(-50%, 14px);
  pointer-events: none;
  transition:
    opacity var(--nw-duration-base) var(--nw-ease-out),
    transform var(--nw-duration-base) var(--nw-ease-out);
}

.nw-toast--show {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* 不支持 backdrop-filter 时退化为不透明填充，保证文字可读 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-toast {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-toast {
    transition: none;
  }
}
</style>
