<script setup lang="ts">
/**
 * ResourcePanel —— 左侧「资源」功能入口
 * ---------------------------------------------------------------
 * 职责：把「资源」入口的文案与跳转目标映射到通用的 FeaturePanel 底型上。
 * 轮廓、材质、交互状态全部由 FeaturePanel 提供，本组件不重复定义样式。
 */
import { RouterLink } from 'vue-router'

import FeaturePanel from '@/components/base/FeaturePanel.vue'
import { ROUTE_NAMES } from '@/router/routes'

withDefaults(
  defineProps<{
    /** 是否启用进入动画 */
    animated?: boolean
  }>(),
  { animated: true },
)
</script>

<template>
  <RouterLink
    class="nw-resource-panel"
    :to="{ name: ROUTE_NAMES.resources }"
    :aria-label="'资源'"
  >
    <FeaturePanel label="资源" side="left" :animated="animated" />
  </RouterLink>
</template>

<style scoped>
/*
 * 链接只承担「可点击 + 可键盘聚焦」的语义，
 * 视觉与尺寸完全交给 FeaturePanel，避免样式重复。
 */
.nw-resource-panel {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--nw-radius-xs);
  text-decoration: none;
}

.nw-resource-panel:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 4px;
}
</style>
