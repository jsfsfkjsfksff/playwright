<script setup lang="ts">
/**
 * StudioOperationsView —— 创作台 · 操作编辑 / 时间线编辑器（/studio/operations）
 * ---------------------------------------------------------------
 * 页面结构：
 *   1. 背景层 PageBackdrop（站内统一背景图）
 *   2. 顶栏：返回故事选择（左）+ 标题（中）
 *   3. 工具栏：说明 + 新增锚点 / 保存锚点
 *   4. 时间线：按 timeStage 分组渲染 TimelineStage（相同阶段并排）
 *   5. 底部固定栏：返回选择页 / 导出纯音频 / 一键生成（插值）
 *
 * 契约要点（接口文档 v1.0）：
 *   - `timeStage` 是数字坐标：越小越靠前，**相同即并列**（并排渲染）；
 *   - POST /plan/anchors 保存锚点；POST /plan/interpolate 触发 AI 插值；
 *     POST /plan/export-segment 导出拼接好的纯音频。
 *
 * ⚠️ 契约缺口（已在界面如实写出，不假装具备）：
 *   1. 没有「查询锚点」接口 → 真实后端模式下无法回读锚点，刷新即丢；
 *      演示模式由假后端持久化进 localStorage，因此刷新后时间线仍在；
 *   2. 插值接口没有进度通道 → 生成过程只表示「已提交、等待返回」；
 *   3. 插值返回体未定义 → 跳转播放页时优先用返回的补全场景，拿不到就退回用户选的起始场景。
 *
 * 演示模式（Mock）：本页三项动作（保存锚点 / 一键生成 / 导出）都由 services 层的假后端接管，
 * 因此「一键生成 → 跳播放页」这条链路在未接后端时也能真跑通（音频是静音占位）。
 * 具体是不是演示模式由 services 层判定，本页只负责如实提示（DemoModeBadge）。
 * TODO: 待后端接入，当前为演示用 Mock。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import DemoModeBadge from '@/components/base/DemoModeBadge.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import ExportDrawer from '@/components/feature/ExportDrawer.vue'
import InterpolateModal from '@/components/feature/InterpolateModal.vue'
import TimelineStage from '@/components/feature/TimelineStage.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { useStudioStore } from '@/stores/studio'
import type { InterpolateRequest, SceneAnchor, SceneAnchorPatch } from '@/types/studio'
import { NARRATOR_SPEAKER } from '@/utils/studioVocabulary'

const router = useRouter()
const studio = useStudioStore()

/** 生成条件：至少 2 个锚点（与故事选择页的判定保持一致） */
const MIN_ANCHORS = 2

const canGenerate = computed(() => studio.anchorCount >= MIN_ANCHORS)

const pendingHint = computed(() => `还差：剧情锚点 ${studio.anchorCount}/${MIN_ANCHORS}`)

/** 按时间线顺序排列的锚点：导出顺序、说话人默认值等都依赖它 */
const orderedAnchors = computed(() =>
  studio.anchorGroups.flatMap((group) => group.anchors),
)

/* =============================================================
 * 弹窗与抽屉
 * ============================================================= */

const interpolateOpen = ref(false)
const exportOpen = ref(false)

/**
 * 打开面板前先清掉上一次操作的失败原因。
 * lastError 是所有写操作共用的一条状态，不清掉的话弹窗里会显示
 * 「保存锚点失败」这类与本次操作无关的旧错误。
 */
function openInterpolate(): void {
  studio.clearError()
  interpolateOpen.value = true
}

function openExport(): void {
  studio.clearError()
  exportOpen.value = true
}

/** 正在被拖拽的锚点 id（拖拽期间卡片降透明度、阶段行高亮） */
const draggingSceneId = ref<string | null>(null)

/* =============================================================
 * 提示条
 * ============================================================= */

const TOAST_DURATION = 2200

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
 * 锚点的增删改
 * ============================================================= */

/** 本地 sceneId 计数；契约里 sceneId 由创作者定义，这里先给一个可辨认的默认值 */
let localAnchorSeq = 0

function nextSceneId(): string {
  let candidate = ''

  do {
    localAnchorSeq += 1
    candidate = `SCENE_ANCHOR_${String(localAnchorSeq).padStart(2, '0')}`
  } while (studio.anchors.some((anchor) => anchor.sceneId === candidate))

  return candidate
}

/** 新锚点追加在时间线末尾：最大 timeStage + 1 */
function nextTimeStage(): number {
  if (studio.anchors.length === 0) {
    return 1
  }

  return Math.max(...studio.anchors.map((anchor) => anchor.timeStage)) + 1
}

function addAnchorAt(timeStage: number): void {
  const anchor: SceneAnchor = {
    sceneId: nextSceneId(),
    text: '',
    speaker: NARRATOR_SPEAKER,
    timeStage,
  }

  if (studio.addAnchor(anchor)) {
    notify(`已新增锚点 ${anchor.sceneId}（阶段 ${timeStage}）`)
    return
  }

  notify(studio.lastError ?? '新增锚点失败')
}

function updateAnchor(sceneId: string, patch: SceneAnchorPatch): void {
  if (!studio.updateAnchor(sceneId, patch)) {
    notify(studio.lastError ?? '修改锚点失败')
  }
}

function removeAnchor(sceneId: string): void {
  studio.removeAnchor(sceneId)
  notify(`已删除锚点 ${sceneId}`)
}

/** 拖拽落点：把锚点移到目标阶段 */
function moveAnchorToStage(sceneId: string, timeStage: number): void {
  const anchor = studio.anchors.find((item) => item.sceneId === sceneId)
  if (!anchor || anchor.timeStage === timeStage) {
    draggingSceneId.value = null
    return
  }

  if (studio.updateAnchor(sceneId, { timeStage })) {
    notify(`${sceneId} 已移到阶段 ${timeStage}`)
  }

  draggingSceneId.value = null
}

/* =============================================================
 * 保存 / 生成 / 导出
 * ============================================================= */

async function handleSaveAnchors(): Promise<void> {
  const ok = await studio.saveAnchors()
  notify(ok ? '锚点已提交后端' : (studio.lastError ?? '锚点保存失败'))
}

async function handleInterpolate(payload: InterpolateRequest): Promise<void> {
  const result = await studio.triggerInterpolate(payload)

  if (result === null) {
    notify(studio.lastError ?? 'AI 插值生成失败')
    return
  }

  interpolateOpen.value = false

  // 契约未定义返回体：能拿到补全场景就用第一个（时间线上最早的新场景），
  // 拿不到就退回用户选的起始场景 —— 不猜、也不假装后端给了什么。
  const scenes = Array.isArray(result.scenes) ? result.scenes : []
  const targetSceneId = scenes[0]?.sceneId ?? payload.startSceneId

  notify(`生成完成，进入播放：${targetSceneId}`)
  void router.push({ name: ROUTE_NAMES.player, params: { sceneId: targetSceneId } })
}

async function handleExport(sceneIds: string[]): Promise<void> {
  const result = await studio.exportSegment(sceneIds)

  if (result === null) {
    notify(studio.lastError ?? '片段导出失败')
    return
  }

  notify('导出完成，成品地址见抽屉')
}

/* =============================================================
 * 生命周期
 * ============================================================= */

onMounted(() => {
  // 说话人下拉的数据来源是资源页的角色；直接进本页时资源列表可能还没加载
  void studio.loadResources()
  // ⚠️ 契约没有查询锚点的接口：这里只是把 store 里本次会话的锚点读回来，不做服务端同步
  void studio.fetchAnchors()
})

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="nw-studio-operations">
    <PageBackdrop />

    <div class="nw-studio-operations__shell">
      <header class="nw-studio-operations__top">
        <BackLink label="返回故事选择" :to="{ name: ROUTE_NAMES.studio }" />

        <PageHeader class="nw-studio-operations__title" title="剧情操作" />

        <span class="nw-studio-operations__top-spacer" aria-hidden="true" />
      </header>

      <!-- 工具栏：说明 + 锚点写操作 -->
      <div class="nw-studio-operations__toolbar">
        <p class="nw-studio-operations__scope">
          不同阶段按时间从上到下排列；<strong>同一阶段内的锚点在时间线上并列</strong>，横向并排。
          拖动卡片手柄可改变阶段，也可以直接改卡片里的阶段数字。
        </p>

        <div class="nw-studio-operations__tools">
          <AppButton size="md" variant="secondary" @click="addAnchorAt(nextTimeStage())">
            新增锚点
          </AppButton>
          <AppButton
            size="md"
            variant="secondary"
            :loading="studio.saving"
            loading-label="提交中"
            :disabled="studio.anchorCount === 0"
            @click="handleSaveAnchors"
          >
            保存锚点
          </AppButton>
        </div>
      </div>

      <!-- 演示模式提示 + 契约缺口说明 -->
      <DemoModeBadge hint="Mock 数据：锚点保存在浏览器本地；生成后进入播放页" />

      <p v-if="!studio.demoMode" class="nw-studio-operations__persistence">
        契约没有「查询锚点」接口：锚点无法从服务端回读；
        「保存锚点」会通过 POST /plan/anchors 提交给后端。
      </p>

      <!-- 时间线 -->
      <div v-if="studio.anchorCount === 0" class="nw-studio-operations__empty">
        <GlassPanel class="nw-studio-operations__empty-panel" tone="strong">
          <h2 class="nw-studio-operations__empty-title">还没有剧情锚点</h2>
          <p class="nw-studio-operations__empty-text">
            锚点是创作者定死、AI 不可更改的关键场景。至少添加 2 个（起点与终点）才能生成剧情。
          </p>
          <AppButton size="md" variant="primary" @click="addAnchorAt(1)">
            添加第一个锚点
          </AppButton>
        </GlassPanel>
      </div>

      <div v-else class="nw-studio-operations__timeline">
        <TimelineStage
          v-for="group in studio.anchorGroups"
          :key="group.timeStage"
          :time-stage="group.timeStage"
          :anchors="group.anchors"
          :characters="studio.characters"
          :dragging-scene-id="draggingSceneId"
          @update-anchor="updateAnchor"
          @remove-anchor="removeAnchor"
          @add-anchor="addAnchorAt"
          @drop-anchor="moveAnchorToStage"
          @drag-start="draggingSceneId = $event"
          @drag-end="draggingSceneId = null"
        />
      </div>
    </div>

    <!-- 底部固定操作栏 -->
    <footer class="nw-studio-operations__footer">
      <span class="nw-studio-operations__status">
        {{ canGenerate ? `已满足生成条件（锚点 ${studio.anchorCount}）` : pendingHint }}
      </span>

      <div class="nw-studio-operations__footer-actions">
        <AppButton size="md" variant="secondary" @click="router.push({ name: ROUTE_NAMES.studio })">
          返回选择页
        </AppButton>

        <AppButton
          size="md"
          variant="secondary"
          :disabled="studio.anchorCount === 0"
          @click="openExport"
        >
          导出纯音频
        </AppButton>

        <AppButton
          size="md"
          variant="primary"
          :disabled="!canGenerate"
          @click="openInterpolate"
        >
          一键生成（插值）
        </AppButton>
      </div>
    </footer>

    <InterpolateModal
      v-if="interpolateOpen"
      :anchors="orderedAnchors"
      :generating="studio.generating"
      :error="studio.lastError"
      @submit="handleInterpolate"
      @close="interpolateOpen = false"
    />

    <ExportDrawer
      v-if="exportOpen"
      :anchors="orderedAnchors"
      :exporting="studio.exporting"
      :result="studio.exportResult"
      :error="studio.lastError"
      @submit="handleExport"
      @close="exportOpen = false"
    />

    <ToastPill :visible="toastVisible" :message="toastMessage" />
  </div>
</template>

<style scoped>
.nw-studio-operations {
  /* 底部固定操作栏高度：shell 用它留出安全间距，两处始终一致 */
  --nw-studio-operations-footer-height: clamp(4.25rem, 8.5vh, 5.75rem);

  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
}

.nw-studio-operations__shell {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: clamp(0.75rem, 2vh, 1.5rem);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: var(--nw-layout-header-inset)
    calc(var(--nw-studio-operations-footer-height) + var(--nw-layout-header-inset));
  padding-inline: var(--nw-layout-page-gutter);
}

/* ---------- 顶栏 ---------- */
.nw-studio-operations__top {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: var(--nw-space-sm);
}

.nw-studio-operations__title {
  min-width: 0;
}

.nw-studio-operations__top-spacer {
  display: block;
  width: 40px;
  height: 40px;
}

/* ---------- 工具栏 ---------- */
.nw-studio-operations__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
}

.nw-studio-operations__scope {
  flex: 1 1 22rem;
  min-width: 0;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-studio-operations__scope strong {
  color: var(--nw-color-text-secondary);
  font-weight: var(--nw-font-weight-medium);
}

.nw-studio-operations__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
}

.nw-studio-operations__persistence {
  color: var(--nw-color-warning);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

/* ---------- 时间线 ---------- */
.nw-studio-operations__timeline {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
}

.nw-studio-operations__empty {
  display: flex;
  flex: 1;
  align-items: flex-start;
}

.nw-studio-operations__empty-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nw-space-2xs);
  width: 100%;
  padding: clamp(1.25rem, 3vw, 2rem);
}

.nw-studio-operations__empty-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-studio-operations__empty-text {
  margin-bottom: var(--nw-space-2xs);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

/* ---------- 底部固定栏 ---------- */
.nw-studio-operations__footer {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  /* 与资源页一致：固定栏在内容之上、弹窗之下（modal = 60） */
  z-index: var(--nw-z-overlay);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
  min-height: var(--nw-studio-operations-footer-height);
  padding-inline: var(--nw-layout-page-gutter);
  padding-block: var(--nw-space-xs);
  border-top: var(--nw-border-width) solid var(--nw-color-glass-edge);
  background-color: var(--nw-color-surface-elevated);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight), transparent 60%);
  box-shadow: var(--nw-shadow-inset-top);
  backdrop-filter: blur(var(--nw-blur-md));
  -webkit-backdrop-filter: blur(var(--nw-blur-md));
}

.nw-studio-operations__status {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-studio-operations__footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-studio-operations__footer {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (max-width: 720px) {
  .nw-studio-operations__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .nw-studio-operations__footer-actions {
    justify-content: stretch;
  }

  .nw-studio-operations__footer-actions :deep(.nw-app-button) {
    flex: 1;
  }
}
</style>
