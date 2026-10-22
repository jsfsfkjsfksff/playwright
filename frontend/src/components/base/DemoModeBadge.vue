<script setup lang="ts">
/**
 * DemoModeBadge —— 演示模式（Mock 数据）标记
 * ---------------------------------------------------------------
 * 只在「未接入真实后端」时渲染；接上真实后端后自动消失，
 * 因此调用方只需要把它放进页面，不需要自己判断模式、也不需要传开关。
 *
 * 为什么必须显式提示（而不是悄悄用假数据）：
 *   演示模式下**人声是前端合成的静音占位**，数据也只存在浏览器本地。
 *   不说清楚，验收的人会以为「音频生成已经跑通」，那才是真正的误导。
 *
 * 用法：`<DemoModeBadge hint="本页资源只存在内存，刷新即重置" />`
 * hint 省略时用默认文案。
 *
 * TODO: 待后端接入，当前为演示用 Mock —— 接入后本组件可整体删除。
 */
import { API_DEMO_MODE } from '@/services/config'

defineProps<{
  /** 本页补充说明；省略则使用默认文案 */
  hint?: string
}>()

/** 构建期常量，不是响应式状态 */
const demoMode = API_DEMO_MODE
</script>

<template>
  <p v-if="demoMode" class="nw-demo-badge" role="note">
    <span class="nw-demo-badge__tag">演示模式</span>
    <span class="nw-demo-badge__text">
      {{ hint || 'Mock 数据：不请求后端，数据存在浏览器本地，音频为静音占位' }}
    </span>
  </p>
</template>

<style scoped>
.nw-demo-badge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nw-space-2xs);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-demo-badge__tag {
  flex: 0 0 auto;
  padding: 2px 10px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-warning-soft);
  color: var(--nw-color-warning);
  letter-spacing: var(--nw-letter-spacing-wide);
}
</style>
