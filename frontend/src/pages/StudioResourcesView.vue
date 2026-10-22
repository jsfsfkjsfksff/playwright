<script setup lang="ts">
/**
 * StudioResourcesView —— 创作台 · 资源管理（/studio/resources）
 * ---------------------------------------------------------------
 * 原「资源 Tab」的内容整体迁到这里，成为独立页面（不再有 Tab 切换）。
 * 页面结构：
 *   1. 背景层 PageBackdrop（站内统一背景图，与其它内页一致）
 *   2. 顶栏：返回故事选择（左）+ 标题（中）
 *   3. 主体：工具栏（接入状态 + 新增资源）与按类型分组的资源卡片
 *   4. 底部固定栏：返回选择页
 *
 * 数据流：卡片抛事件 → 本页调用 stores/studio.ts → store 调用 services 层。
 * 数据来自真实后端还是演示（Mock）假数据由 services 层决定，本页只负责展示 ——
 * 数据源属于内部实现，界面上不再挂「演示模式」提示条。
 * 配音配置入口已从本页移除（配置弹窗组件保留，供其它入口复用）。
 * 「一键生成」不在这里 —— 它需要同时看资源与锚点的数量，因此放在故事选择页。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import AddResourceModal from '@/components/feature/AddResourceModal.vue'
import ResourceCard from '@/components/feature/ResourceCard.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { useStudioStore } from '@/stores/studio'
import type { PropertyCreatePayload, PropertyResponse } from '@/types/studio'
import { propertyTypeLabel } from '@/utils/studioVocabulary'

const router = useRouter()
const studio = useStudioStore()

/* =============================================================
 * 弹窗
 * ============================================================= */

/** 同一时刻只允许一个弹窗（配音配置入口已移除，只剩资源新增 / 编辑） */
type StudioModal = 'none' | 'resource'

const activeModal = ref<StudioModal>('none')
const editingResource = ref<PropertyResponse | null>(null)

function openCreateResource(): void {
  editingResource.value = null
  activeModal.value = 'resource'
}

function openEditResource(resource: PropertyResponse): void {
  editingResource.value = resource
  activeModal.value = 'resource'
}

function closeModal(): void {
  activeModal.value = 'none'
}

/* =============================================================
 * 提示条
 * ============================================================= */

const TOAST_DURATION = 1900

const toastMessage = ref('')
const toastVisible = ref(false)

/** 定时器句柄：不参与渲染，因此用普通变量而不是 ref */
let toastTimer = 0

function notify(message: string): void {
  toastMessage.value = message
  toastVisible.value = true

  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, TOAST_DURATION)
}

/* =============================================================
 * 资源操作
 * ============================================================= */

async function handleResourceSubmit(payload: PropertyCreatePayload): Promise<void> {
  const editing = editingResource.value
  const ok = editing
    ? await studio.editResource(editing.nodeId, payload)
    : await studio.addResource(payload)

  if (!ok) {
    notify(studio.lastError ?? '保存失败')
    return
  }

  notify(editing ? '资源已更新' : '资源已新增')
  closeModal()
}

async function handleRemoveResource(resource: PropertyResponse): Promise<void> {
  const ok = await studio.removeResource(resource.nodeId)
  notify(ok ? `已删除：${resource.name}` : (studio.lastError ?? '删除失败'))
}

function goBackToSelect(): void {
  void router.push({ name: ROUTE_NAMES.studio })
}

onMounted(() => {
  // loadResources 内部已捕获错误并写入 lastError，不会抛出未处理的拒绝
  void studio.loadResources()
})

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="nw-studio-resources">
    <PageBackdrop />

    <div class="nw-studio-resources__shell">
      <!-- 顶栏：返回在左，标题居中；右侧等宽占位保证标题真正居中 -->
      <header class="nw-studio-resources__top">
        <BackLink label="返回故事选择" :to="{ name: ROUTE_NAMES.studio }" />

        <PageHeader class="nw-studio-resources__title" title="资源管理" />

        <span class="nw-studio-resources__top-spacer" aria-hidden="true" />
      </header>

      <!-- 演示模式提示条已按需求移除：数据源属于内部实现，不占创作界面 -->

      <!-- 工具栏 -->
      <div class="nw-studio-resources__toolbar">
        <p v-if="studio.loading" class="nw-studio-resources__notice" role="status">
          正在加载资源…
        </p>
        <p
          v-else-if="studio.lastError"
          class="nw-studio-resources__notice nw-studio-resources__notice--error"
          role="alert"
        >
          {{ studio.lastError }}
        </p>
        <span v-else class="nw-studio-resources__notice" />

        <AppButton size="md" variant="primary" @click="openCreateResource">新增资源</AppButton>
      </div>

      <!-- 按类型分组的资源卡片 -->
      <div class="nw-studio-resources__groups">
        <section v-for="group in studio.resourceGroups" :key="group.type" class="nw-studio-resources__group">
          <h2 class="nw-studio-resources__group-title">
            {{ propertyTypeLabel(group.type) }}
            <span class="nw-studio-resources__group-count">{{ group.items.length }}</span>
          </h2>

          <p v-if="group.items.length === 0" class="nw-studio-resources__group-empty">
            暂无{{ propertyTypeLabel(group.type) }}资源
          </p>

          <ul v-else class="nw-studio-resources__cards">
            <li v-for="item in group.items" :key="item.nodeId">
              <ResourceCard
                :resource="item"
                @edit="openEditResource"
                @remove="handleRemoveResource"
              />
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- 底部固定操作栏 -->
    <footer class="nw-studio-resources__footer">
      <AppButton size="md" variant="secondary" @click="goBackToSelect">返回选择页</AppButton>
    </footer>

    <!-- 弹窗：同一时刻只挂载一个（配音配置弹窗已随入口一起移除，组件文件保留） -->
    <AddResourceModal
      v-if="activeModal === 'resource'"
      :initial="editingResource"
      :saving="studio.saving"
      @submit="handleResourceSubmit"
      @close="closeModal"
    />

    <ToastPill :message="toastMessage" :visible="toastVisible" />
  </div>
</template>

<style scoped>
.nw-studio-resources {
  /* 底部固定操作栏高度：shell 用它留出安全间距，两处始终一致 */
  --nw-studio-resources-footer-height: clamp(4.25rem, 8.5vh, 5.75rem);

  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
}

.nw-studio-resources__shell {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: clamp(1rem, 2.6vh, 2rem);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: var(--nw-layout-header-inset)
    calc(var(--nw-studio-resources-footer-height) + var(--nw-layout-header-inset));
  padding-inline: var(--nw-layout-page-gutter);
}

/* ---------- 顶栏 ---------- */
.nw-studio-resources__top {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: var(--nw-space-sm);
}

.nw-studio-resources__title {
  min-width: 0;
}

.nw-studio-resources__top-spacer {
  display: block;
  width: 40px;
  height: 40px;
}

/* ---------- 工具栏 ---------- */
.nw-studio-resources__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nw-space-sm);
}

.nw-studio-resources__notice {
  flex: 1;
  min-width: 12rem;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-studio-resources__notice--error {
  color: var(--nw-color-error);
}

/* ---------- 分组与卡片 ---------- */
.nw-studio-resources__groups {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-md);
}

.nw-studio-resources__group-title {
  display: flex;
  align-items: baseline;
  gap: var(--nw-space-2xs);
  margin-bottom: var(--nw-space-2xs);
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-studio-resources__group-count {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-regular);
}

.nw-studio-resources__group-empty {
  color: var(--nw-color-text-disabled);
  font-size: var(--nw-font-size-sm);
}

.nw-studio-resources__cards {
  display: grid;
  /* 最小列宽 18rem：常见宽度下正好 3 列，卡片里的一排操作按钮才放得下 */
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  align-items: stretch;
  gap: var(--nw-space-sm);
}

/* ---------- 底部固定操作栏 ---------- */
.nw-studio-resources__footer {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: var(--nw-z-overlay);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: var(--nw-studio-resources-footer-height);
  padding-inline: var(--nw-layout-page-gutter);
  padding-block: var(--nw-space-xs);
  border-top: var(--nw-border-width) solid var(--nw-color-glass-edge);
  background-color: var(--nw-color-surface-elevated);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight), transparent 60%);
  box-shadow: var(--nw-shadow-inset-top);
  backdrop-filter: blur(var(--nw-blur-md));
  -webkit-backdrop-filter: blur(var(--nw-blur-md));
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-studio-resources__footer {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (max-width: 640px) {
  .nw-studio-resources__footer {
    justify-content: stretch;
  }

  .nw-studio-resources__footer :deep(.nw-app-button) {
    flex: 1;
  }
}
</style>
