<script setup lang="ts">
/**
 * StudioOperationsView —— 创作台 · 操作编辑 / 时间线编辑器（/studio/operations）
 * ---------------------------------------------------------------
 * 页面结构：
 *   1. 背景层 PageBackdrop（站内统一背景图）
 *   2. 顶栏：返回故事选择（左）+ 标题（中）
 *   3. 工具栏：说明 + 新增锚点 / 保存锚点
 *   4. 时间线：按 timeStage 分组渲染 TimelineStage（相同阶段并排）
 *   5. 底部固定栏：返回选择页 / 一键生成（插值）
 *
 * 契约要点（接口文档 v1.0）：
 *   - `timeStage` 是数字坐标：越小越靠前，**相同即并列**（并排渲染）；
 *   - POST /plan/anchors 保存锚点；POST /plan/interpolate 触发 AI 插值。
 *     导出纯音频已移到播放页（勾选实际生成 / 播放过的节点）。
 *
 * ⚠️ 契约缺口（已在界面如实写出，不假装具备）：
 *   1. 没有「查询锚点」接口 → 真实后端模式下无法回读锚点，刷新即丢；
 *      演示模式由假后端持久化进 localStorage，因此刷新后时间线仍在；
 *   2. 插值接口没有进度通道 → 生成过程只表示「已提交、等待返回」；
 *   3. 插值返回体未定义 → 跳转播放页时优先用返回的补全场景，拿不到就退回自动推导出的起始场景。
 *
 * 演示模式（Mock）：本页两项动作（保存锚点 / 一键生成）都由 services 层的假后端接管，
 * 因此「一键生成 → 跳播放页」这条链路在未接后端时也能真跑通（音频是静音占位）。
 * 按需求，页面不再挂「演示模式」提示条：数据从哪来是内部实现，不该占据创作界面。
 * TODO: 待后端接入，当前为演示用 Mock。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import LoadingTransition from '@/components/base/LoadingTransition.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import InterpolateModal from '@/components/feature/InterpolateModal.vue'
import StoryCanvas from '@/components/feature/StoryCanvas.vue'
import TimelineStage from '@/components/feature/TimelineStage.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { useStudioStore } from '@/stores/studio'
import type {
  InterpolateRequest,
  InterpolateResultData,
  SceneAnchor,
  SceneAnchorPatch,
} from '@/types/studio'
import { NARRATOR_SPEAKER } from '@/utils/studioVocabulary'

const router = useRouter()
const studio = useStudioStore()

/* =============================================================
 * 视图切换（列表 / 画布）
 * ============================================================= */

type OperationView = 'list' | 'canvas'

const VIEW_OPTIONS: readonly { value: OperationView; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'canvas', label: '画布' },
]

/**
 * 默认进列表：它是精确编辑入口（台词 / 说话人 / 音频 / 阶段都能改）。
 * 画布负责「结构」——挪位置、连线、看整体拓扑。
 */
const activeView = ref<OperationView>('list')

/** 画布上当前选中的节点（连线第一端） */
const selectedSceneId = ref<string | null>(null)

/** 切到画布前先把坐标补齐，否则所有节点会叠在 (0,0) */
function selectView(view: OperationView): void {
  if (view === 'canvas') {
    studio.ensureAnchorPositions()
    activeView.value = 'canvas'
    return
  }

  activeView.value = 'list'
  selectedSceneId.value = null
}

/* =============================================================
 * 画布事件
 * ============================================================= */

function handleConnect(sourceId: string, targetId: string): void {
  if (studio.addEdge(sourceId, targetId)) {
    notify(`已连线：${sourceId} → ${targetId}`)
    return
  }

  notify(studio.lastError ?? '连线失败')
}

function handleRemoveEdge(edgeId: string): void {
  studio.removeEdge(edgeId)
  notify(`已删除连线 ${edgeId}`)
}

/**
 * 卡片的显示名 = sceneId：标题就是提交给后端的标识，提示条里也用它，
 * 用户看到的和实际提交的是同一个字符串。
 */
function anchorDisplayName(sceneId: string): string {
  return sceneId
}

/**
 * 双击画布卡片：切回列表视图并滚动到对应卡片。
 * 画布负责结构，精修仍在列表里进行 —— 避免两套编辑态打架。
 */
function focusAnchor(sceneId: string): void {
  activeView.value = 'list'
  selectedSceneId.value = null

  void nextTick(() => {
    const target = document.querySelector(`[data-scene-id="${CSS.escape(sceneId)}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    notify(`已定位到 ${anchorDisplayName(sceneId)}`)
  })
}

/** 生成条件：至少 2 个锚点（与故事选择页的判定保持一致） */
const MIN_ANCHORS = 2

const canGenerate = computed(() => studio.anchorCount >= MIN_ANCHORS)

const pendingHint = computed(() => `还差：剧情锚点 ${studio.anchorCount}/${MIN_ANCHORS}`)

/** 按时间线顺序排列的锚点：说话人默认值、画布与列表的呈现顺序都依赖它 */
const orderedAnchors = computed(() =>
  studio.anchorGroups.flatMap((group) => group.anchors),
)

/* =============================================================
 * 弹窗
 * ============================================================= */

const interpolateOpen = ref(false)

/**
 * 打开面板前先清掉上一次操作的失败原因。
 * lastError 是所有写操作共用的一条状态，不清掉的话弹窗里会显示
 * 「保存锚点失败」这类与本次操作无关的旧错误。
 */
function openInterpolate(): void {
  studio.clearError()
  interpolateOpen.value = true
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

/** 生成不重复的 sceneId（同时用作新卡片的默认名称序号） */
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
  const sceneId = nextSceneId()

  const anchor: SceneAnchor = {
    sceneId,
    // 卡片标题就是场景 id：新建时先给占位 id（SCENE_ANCHOR_xx），
    // 用户点标题旁的按钮填写自己的名字；填写后不可再改。
    cardName: sceneId,
    text: '',
    // 需求 2：已移除说话人概念，统一「旁白讲述」。
    // 数据层仍提交该字段以兼容后端 Scene 实体（见 types/studio.ts 的 SceneAnchor.speaker）。
    speaker: NARRATOR_SPEAKER,
    timeStage,
    // 新锚点还没有音频：空串表示「未生成」，与「已生成但地址为空」区分不开也不该区分
    audioURL: '',
  }

  if (studio.addAnchor(anchor)) {
    notify(`已新增锚点 ${sceneId}（阶段 ${timeStage}）`)
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
  // 名字要在删除前取，删完就查不到了
  const name = anchorDisplayName(sceneId)
  studio.removeAnchor(sceneId)
  notify(`已删除锚点 ${name}`)
}

/** 拖拽落点：把锚点移到目标阶段 */
function moveAnchorToStage(sceneId: string, timeStage: number): void {
  const anchor = studio.anchors.find((item) => item.sceneId === sceneId)
  if (!anchor || anchor.timeStage === timeStage) {
    draggingSceneId.value = null
    return
  }

  if (studio.updateAnchor(sceneId, { timeStage })) {
    notify(`${anchorDisplayName(sceneId)} 已移到阶段 ${timeStage}`)
  }

  draggingSceneId.value = null
}

/* =============================================================
 * 保存 / 生成
 * ============================================================= */

async function handleSaveAnchors(): Promise<void> {
  const ok = await studio.saveAnchors()
  notify(ok ? '锚点已提交后端' : (studio.lastError ?? '锚点保存失败'))
}

/**
 * 生成过场动画的最短展示时长（毫秒）。
 * 请求可能 200ms 就回来了，但一瞬间的遮罩只会「闪一下」；
 * 用 2.5s 保证过场走完整段流光，再进播放页。
 */
const TRANSITION_MIN_MS = 2500

/** 是否正在展示「生成剧情」的全屏过场 */
const generatingTransition = ref(false)

/** 等待指定毫秒（只用于把过场补足最小时长） */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * 从 /plan/interpolate 的回执里读「新生成场景的 sceneId 列表」。
 *
 * 后端当前实现回的是 `startScene.getId()` —— 一个**数字**（没有场景列表），
 * 因此这里做形状判断：只有确实是 `{ scenes: [...] }` 时才取 sceneId，其余返回空数组，
 * 由调用方退回请求里的 startSceneId。契约未定义该字段，两种形状都认。
 */
function readGeneratedSceneIds(result: InterpolateResultData): string[] {
  const scenes = typeof result === 'object' && result !== null ? result.scenes : undefined
  if (!Array.isArray(scenes)) {
    return []
  }
  return scenes.map((scene) => scene.sceneId).filter((sceneId) => sceneId !== '')
}

async function handleInterpolate(payload: InterpolateRequest): Promise<void> {
  // 1. 立刻盖上全屏过场 —— 用户点完就该看到反馈，而不是盯着参数弹窗等请求
  generatingTransition.value = true
  const startedAt = Date.now()

  const result = await studio.triggerInterpolate(payload)

  // 2. 请求再快也让过场至少走满 TRANSITION_MIN_MS
  const elapsed = Date.now() - startedAt
  if (elapsed < TRANSITION_MIN_MS) {
    await wait(TRANSITION_MIN_MS - elapsed)
  }

  if (result === null) {
    // 失败：收掉过场。参数弹窗仍开着（错误显示在里面），可以直接改参数重试
    generatingTransition.value = false
    notify(studio.lastError ?? 'AI 插值生成失败')
    return
  }

  interpolateOpen.value = false

  // 后端当前回的是 data=数字（起点场景的 Neo4j 内部 id），拿不到补全场景列表，
  // 因此统一走 readGeneratedSceneIds：能读到 sceneId 就用，读不到退回请求里的 startSceneId
  // —— 不猜、也不假装后端给了什么。
  const targetSceneId = readGeneratedSceneIds(result)[0] ?? payload.startSceneId

  // 3. 先跳转、再收过场：新页面已经挂上，遮罩揭开时不会闪回操作页
  await router.push({ name: ROUTE_NAMES.player, params: { sceneId: targetSceneId } })
  generatingTransition.value = false
}

/* =============================================================
 * 生命周期
 * ============================================================= */

onMounted(() => {
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
          拖动卡片手柄可改变阶段，也可以直接改卡片里的阶段数字；
          <strong>场景 id 在卡片标题处填写，填写后不可修改</strong>。
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

      <!--
        契约缺口说明：只在真实后端模式下显示（演示模式不再挂任何提示条）。
        这里的文字是给创作者的**操作前提**，不是内部实现细节：
        「保存锚点」会真的提交给后端，刷新后读不回来。
      -->
      <p v-if="!studio.demoMode" class="nw-studio-operations__persistence">
        契约没有「查询锚点」接口：锚点无法从服务端回读；
        「保存锚点」会通过 POST /plan/anchors 提交给后端。
      </p>

      <!-- 视图切换：列表（精确编辑） / 画布（散点编排 + 连线） -->
      <div class="nw-studio-operations__views" role="tablist" aria-label="编排视图">
        <button
          v-for="option in VIEW_OPTIONS"
          :key="option.value"
          type="button"
          role="tab"
          class="nw-studio-operations__view"
          :class="{ 'nw-studio-operations__view--active': activeView === option.value }"
          :aria-selected="activeView === option.value"
          @click="selectView(option.value)"
        >
          {{ option.label }}
          <span v-if="option.value === 'canvas'" class="nw-studio-operations__view-count">
            {{ studio.anchorCount }} 点 / {{ studio.edgeCount }} 线
          </span>
        </button>
      </div>

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

      <div v-else-if="activeView === 'list'" class="nw-studio-operations__timeline">
        <TimelineStage
          v-for="group in studio.anchorGroups"
          :key="group.timeStage"
          :time-stage="group.timeStage"
          :anchors="group.anchors"
          :dragging-scene-id="draggingSceneId"
          @update-anchor="updateAnchor"
          @remove-anchor="removeAnchor"
          @add-anchor="addAnchorAt"
          @drop-anchor="moveAnchorToStage"
          @drag-start="draggingSceneId = $event"
          @drag-end="draggingSceneId = null"
        />
      </div>

      <!--
        画布视图：散点式编排。
        点集 = 锚点（坐标写在锚点里，拖动即回写），边集 = 独立的 edges 数组，
        提交时由 store 的 storyGraph 组装成扁平双 List。
      -->
      <StoryCanvas
        v-else
        :anchors="studio.anchors"
        :edges="studio.edges"
        :selected-id="selectedSceneId"
        @select="selectedSceneId = $event"
        @edit="focusAnchor"
        @connect="handleConnect"
        @move="studio.updateAnchorPosition"
        @remove-edge="handleRemoveEdge"
      >
        <template #empty-action>
          <AppButton size="md" variant="primary" @click="addAnchorAt(1)">添加第一个锚点</AppButton>
        </template>
      </StoryCanvas>
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
      :edges="studio.edges"
      :generating="studio.generating"
      :error="studio.lastError"
      @submit="handleInterpolate"
      @close="interpolateOpen = false"
    />

    <!--
      全屏生成过场：提交后立刻盖上，请求完成且动画走满 2.5s 后跳播放页。
      组件内部 Teleport 到 body 并 fixed 铺满（z-index 9999），因此放在模板哪一层都一样。
    -->
    <LoadingTransition v-if="generatingTransition" />

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

/* ---------- 视图切换（列表 / 画布） ---------- */
.nw-studio-operations__views {
  display: flex;
  gap: var(--nw-space-2xs);
  padding: 3px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-glass-fill);
  align-self: flex-start;
}

.nw-studio-operations__view {
  display: inline-flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  padding: 0.35rem 1.1rem;
  border: 0;
  border-radius: var(--nw-radius-pill);
  background-color: transparent;
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  cursor: pointer;
  transition:
    background-color var(--nw-duration-fast) var(--nw-ease-out),
    color var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-studio-operations__view:hover {
  color: var(--nw-color-text-primary);
}

.nw-studio-operations__view:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

.nw-studio-operations__view--active {
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  box-shadow: var(--nw-shadow-inset-top);
}

.nw-studio-operations__view-count {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
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
