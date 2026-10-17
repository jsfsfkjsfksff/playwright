<script setup lang="ts">
/**
 * CreateView —— 音频创作页（路由占位）
 * ---------------------------------------------------------------
 * ⚠️ 本文件当前**没有任何路由指向它**：routes.ts 里 `/create` 是重定向到 `/studio`，
 *    所以它渲染不到。保留是因为它记录了「创作占位页」的原始意图，
 *    若确认不再需要，删掉本文件即可（不会影响任何路由）。
 *
 * 本阶段只开发「功能选择页」，「创作」页的具体内容尚未开发。
 * 页面内容留待音频创作页正式开发时替换。
 */
import BackLink from '@/components/base/BackLink.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
</script>

<template>
  <div class="nw-create">
    <PageBackdrop />

    <div class="nw-create__utility">
      <BackLink label="返回首页" />
    </div>

    <h1 class="nw-visually-hidden">创作</h1>
  </div>
</template>

<style scoped>
.nw-create {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
}

.nw-create__utility {
  position: absolute;
  top: var(--nw-layout-header-inset);
  left: var(--nw-layout-page-gutter);
  z-index: var(--nw-z-content);
}
</style>
