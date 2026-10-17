<script setup lang="ts">
/**
 * ResourcesView —— 我的故事库（/resources）
 * ---------------------------------------------------------------
 * 现状：故事库功能尚未开发，本页是**明确的占位页**。
 *
 * 为什么不能只留一个视觉隐藏标题：
 *   首页菜单与功能选择页都有指向这里的入口，用户点进来必须看到
 *   「这里是什么、现在能不能用、下一步去哪」，而不是一片空白 ——
 *   空白页会让人以为页面坏了。因此这里给出明确的开发中说明与返回入口。
 *
 * 视觉沿用现有夜间主题与统一背景图（base/PageBackdrop），不引入新样式语言。
 * 功能正式开发时，把主体内容整体替换掉即可，顶栏与返回路径可以保留。
 */
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import { ROUTE_NAMES } from '@/router/routes'

const router = useRouter()

function goHome(): void {
  void router.push({ name: ROUTE_NAMES.home })
}
</script>

<template>
  <div class="nw-resources">
    <PageBackdrop />

    <header class="nw-resources__top">
      <BackLink label="返回首页" :to="{ name: ROUTE_NAMES.home }" />
      <PageHeader class="nw-resources__title" title="我的故事库" />
      <span class="nw-resources__top-spacer" aria-hidden="true" />
    </header>

    <main class="nw-resources__main">
      <GlassPanel class="nw-resources__panel" tone="strong">
        <h2 class="nw-resources__panel-title">故事库功能开发中</h2>
        <p class="nw-resources__panel-text">
          这里以后用来浏览、管理与继续创作你已经生成的故事。
          目前该功能尚未开发，敬请期待。
        </p>
        <p class="nw-resources__panel-hint">
          现在可以先从首页的「开始新故事」进入创作台，新建一个故事。
        </p>
        <div class="nw-resources__actions">
          <AppButton size="md" variant="primary" @click="goHome">返回首页</AppButton>
        </div>
      </GlassPanel>
    </main>
  </div>
</template>

<style scoped>
.nw-resources {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
}

/* ---------- 顶栏（与创作台子页保持同一套三列结构） ---------- */
.nw-resources__top {
  position: relative;
  z-index: var(--nw-z-content);
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: var(--nw-space-sm);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: var(--nw-layout-header-inset) 0;
  padding-inline: var(--nw-layout-page-gutter);
}

.nw-resources__title {
  min-width: 0;
}

.nw-resources__top-spacer {
  display: block;
  width: 40px;
  height: 40px;
}

/* ---------- 主体 ---------- */
.nw-resources__main {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  align-items: flex-start;
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: clamp(1.5rem, 4vh, 3rem);
  padding-inline: var(--nw-layout-page-gutter);
}

.nw-resources__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nw-space-2xs);
  width: 100%;
  padding: clamp(1.25rem, 3vw, 2rem);
}

.nw-resources__panel-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-resources__panel-text {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-resources__panel-hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-resources__actions {
  margin-top: var(--nw-space-xs);
}
</style>
