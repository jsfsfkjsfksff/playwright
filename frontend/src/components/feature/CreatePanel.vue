<script setup lang="ts">
/**
 * CreatePanel —— 右侧「创作」功能入口
 * ---------------------------------------------------------------
 * 职责：把「创作」入口的文案与跳转目标映射到通用的 FeaturePanel 底型上。
 * 跳转目标为创作台 /studio（原 /create 占位页已改为重定向到该页）。
 * 与 ResourcePanel 共用同一套设计规范（镜像布局），差异仅在收束方向与悬停位移。
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
  <RouterLink class="nw-create-panel" :to="{ name: ROUTE_NAMES.studio }" :aria-label="'创作'">
    <FeaturePanel label="创作" side="right" :animated="animated" />
  </RouterLink>
</template>

<style scoped>
.nw-create-panel {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--nw-radius-xs);
  text-decoration: none;
}

.nw-create-panel:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 4px;
}
</style>
