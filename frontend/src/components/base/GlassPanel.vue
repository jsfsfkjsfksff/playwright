<script setup lang="ts">
/**
 * GlassPanel —— 通用玻璃面板容器
 * ---------------------------------------------------------------
 * 职责：为内容提供一致的深蓝半透明材质、描边与阴影。
 * 不限定内部结构，不承担布局定位职责。
 *
 * 主题：全部取值来自语义化主题令牌（surface / surface-elevated / border /
 * shadow-panel），因此日间模式接入时只需补充令牌取值，本组件无需改动。
 */
withDefaults(
  defineProps<{
    /** 材质强度 */
    tone?: 'soft' | 'strong'
  }>(),
  { tone: 'soft' },
)
</script>

<template>
  <div class="nw-glass-panel" :class="`nw-glass-panel--${tone}`">
    <slot />
  </div>
</template>

<style scoped>
.nw-glass-panel {
  position: relative;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-lg);
  box-shadow: var(--nw-shadow-panel);
  backdrop-filter: blur(var(--nw-blur-md));
  -webkit-backdrop-filter: blur(var(--nw-blur-md));
}

.nw-glass-panel--soft {
  background-color: var(--nw-color-surface);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight) 0%, transparent 46%);
}

.nw-glass-panel--strong {
  background-color: var(--nw-color-surface-elevated);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight) 0%, transparent 52%);
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-glass-panel--soft {
    background-color: var(--nw-color-glass-fallback);
  }

  .nw-glass-panel--strong {
    background-color: var(--nw-color-surface-elevated);
  }
}
</style>
