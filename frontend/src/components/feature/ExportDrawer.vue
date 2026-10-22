<script setup lang="ts">
/**
 * ExportDrawer —— 底部抽屉：勾选场景并导出纯音频片段
 * ---------------------------------------------------------------
 * 契约（接口文档 3.3）：
 *   POST /plan/export-segment，请求体 `{ sceneIds: [...] }`，**数组顺序即导出顺序**；
 *   并且明确要求「导出不能前端直接截取后端返回的 list」——
 *   成品由后端把选中节点的音频按顺序拼接后交付，前端只负责画勾选与接收结果。
 *
 * 因此这里：勾选顺序不参与导出 —— 一律按**传入顺序**（播放页传的是本局播放顺序）输出 sceneIds。
 *
 * 调用方只有播放页（PlayerView）：导出对象是这一局实际生成 / 播放过的节点，
 * 创作台不再提供导出入口。
 *
 * 为什么不用 BaseModal：这是底部抽屉（从下往上滑出的长列表），
 * BaseModal 是居中面板且高度受限，装不下时间线级别的勾选列表。
 * 底层的遮罩色与层级沿用 BaseModal 的取值，视觉保持一致。
 */
import { computed, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import { API_DEMO_MODE } from '@/services/config'
import type { ExportSegmentData, SceneAnchor } from '@/types/studio'

/**
 * 是否处于演示模式（Mock）。
 * 演示模式下「成品」是 services 层本地合成的静音音频，不是后端交付的，
 * 因此不能沿用「后端已返回导出成品」这句话 —— 文案必须跟着事实走。
 * TODO: 待后端接入，当前为演示用 Mock
 */
const demoMode = API_DEMO_MODE

const props = withDefaults(
  defineProps<{
    /** 候选节点，**按导出顺序**传入（播放页传本局的播放顺序） */
    anchors: readonly SceneAnchor[]
    /** 导出请求进行中 */
    exporting?: boolean
    /** 导出结果；契约未定义返回体，非空即表示后端给了可下载地址 */
    result?: ExportSegmentData | null
    /** 失败原因 */
    error?: string | null
  }>(),
  { exporting: false, result: null, error: null },
)

const emit = defineEmits<{
  submit: [sceneIds: string[]]
  close: []
}>()

/** 模板 ref 指向 GlassPanel 组件实例，聚焦要落到它的根元素上（$el 才是 DOM） */
const panelElement = ref<ComponentPublicInstance | null>(null)

/** 已勾选的 sceneId：用 Set 判存，提交时再按时间线顺序展开 */
const selected = ref<Set<string>>(new Set())

const selectedCount = computed(() => selected.value.size)
const allSelected = computed(
  () => props.anchors.length > 0 && selected.value.size === props.anchors.length,
)

function toggle(sceneId: string): void {
  const next = new Set(selected.value)
  if (next.has(sceneId)) {
    next.delete(sceneId)
  } else {
    next.add(sceneId)
  }
  selected.value = next
}

function selectAll(): void {
  selected.value = new Set(props.anchors.map((anchor) => anchor.sceneId))
}

function clearAll(): void {
  selected.value = new Set()
}

function handleSubmit(): void {
  // 契约：数组顺序即导出顺序 → 一律按传入顺序输出，不按用户点击顺序
  const sceneIds = props.anchors
    .filter((anchor) => selected.value.has(anchor.sceneId))
    .map((anchor) => anchor.sceneId)

  emit('submit', sceneIds)
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !props.exporting) {
    emit('close')
  }
}

/** 点遮罩关闭；导出进行中不允许关闭，避免用户以为导出被取消了 */
function handleScrimClick(): void {
  if (!props.exporting) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  // 打开即把焦点移进抽屉，键盘用户不用先 Tab 过整页
  const element = panelElement.value?.$el
  if (element instanceof HTMLElement) {
    element.focus()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="nw-export-drawer" @click.self="handleScrimClick">
      <GlassPanel
        ref="panelElement"
        class="nw-export-drawer__panel"
        tone="strong"
        role="dialog"
        aria-modal="true"
        aria-label="导出纯音频片段"
        tabindex="-1"
      >
        <header class="nw-export-drawer__head">
          <h2 class="nw-export-drawer__title">导出纯音频</h2>
          <p class="nw-export-drawer__scope">
            勾选要拼接的节点，按播放顺序交给后端合成一条可离线收听的音频。
          </p>

          <div class="nw-export-drawer__actions">
            <AppButton size="md" variant="ghost" :disabled="allSelected" @click="selectAll">
              全选
            </AppButton>
            <AppButton size="md" variant="ghost" :disabled="selectedCount === 0" @click="clearAll">
              清空
            </AppButton>
            <button
              class="nw-export-drawer__close"
              type="button"
              aria-label="关闭"
              :disabled="exporting"
              @click="emit('close')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div class="nw-export-drawer__body">
          <p v-if="error" class="nw-export-drawer__error" role="alert">{{ error }}</p>

          <div v-if="result" class="nw-export-drawer__result">
            <p class="nw-export-drawer__result-title">
              {{ demoMode ? '演示模式（Mock）：成品为本地合成的静音音频' : '后端已返回导出成品' }}
            </p>
            <a class="nw-export-drawer__link" :href="result.url" target="_blank" rel="noreferrer noopener">
              {{ demoMode ? '演示音频（静音）' : result.url }}
            </a>
            <p class="nw-export-drawer__note">
              ⚠️ 契约未定义该接口的返回体：这里按「一个可下载 / 可播放地址」展示。
              若后端实际返回的是音频地址数组，前端不会自行截取拼接 —— 需要后端交付成品。
            </p>
          </div>

          <p v-if="anchors.length === 0" class="nw-export-drawer__empty">
            还没有可导出的节点：先在播放页走过一段剧情。
          </p>

          <ul v-else class="nw-export-drawer__list">
            <li v-for="anchor in anchors" :key="anchor.sceneId" class="nw-export-drawer__item">
              <label class="nw-export-drawer__row">
                <input
                  class="nw-export-drawer__checkbox"
                  type="checkbox"
                  :checked="selected.has(anchor.sceneId)"
                  @change="toggle(anchor.sceneId)"
                />

                <span class="nw-export-drawer__stage">第 {{ anchor.timeStage }} 段</span>

                <span class="nw-export-drawer__meta">
                  <code class="nw-export-drawer__id">{{ anchor.sceneId }}</code>
                  <span class="nw-export-drawer__text">{{ anchor.text || '（还没有场景文本）' }}</span>
                </span>
              </label>
            </li>
          </ul>
        </div>

        <footer class="nw-export-drawer__foot">
          <span class="nw-export-drawer__count">已选 {{ selectedCount }} / {{ anchors.length }} 个场景</span>

          <AppButton
            size="md"
            variant="primary"
            :disabled="selectedCount === 0"
            :loading="exporting"
            loading-label="导出中"
            @click="handleSubmit"
          >
            导出纯音频
          </AppButton>
        </footer>
      </GlassPanel>
    </div>
  </Teleport>
</template>

<style scoped>
.nw-export-drawer {
  position: fixed;
  inset: 0;
  /* 与 BaseModal 同层级、同遮罩色（共用 --nw-color-overlay），两个浮层不会互相盖住 */
  z-index: var(--nw-z-modal);
  display: flex;
  align-items: flex-end;
  background-color: var(--nw-color-overlay);
  backdrop-filter: blur(var(--nw-blur-sm));
  -webkit-backdrop-filter: blur(var(--nw-blur-sm));
}

.nw-export-drawer__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(80vh, 80svh);
  overflow: hidden;
  border-radius: var(--nw-radius-lg) var(--nw-radius-lg) 0 0;
  animation: nw-export-rise var(--nw-duration-base) var(--nw-ease-out);
}

.nw-export-drawer__panel:focus-visible {
  outline: none;
}

@keyframes nw-export-rise {
  from {
    opacity: 0;
    transform: translateY(14%);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

/* ---------- 头部 ---------- */
.nw-export-drawer__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--nw-space-2xs) var(--nw-space-sm);
  padding: var(--nw-space-sm) clamp(1rem, 2.4vw, 1.5rem);
  border-bottom: var(--nw-border-width) solid var(--nw-color-border);
}

.nw-export-drawer__title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-export-drawer__scope {
  grid-column: 1 / -1;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-export-drawer__actions {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-export-drawer__close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-sm);
  background-color: transparent;
  color: var(--nw-color-text-secondary);
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-export-drawer__close svg {
  width: 15px;
  height: 15px;
}

.nw-export-drawer__close:hover:not(:disabled) {
  color: var(--nw-color-text-primary);
  border-color: var(--nw-color-focus);
}

.nw-export-drawer__close:disabled {
  color: var(--nw-color-text-disabled);
  cursor: not-allowed;
}

/* ---------- 列表 ---------- */
.nw-export-drawer__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--nw-space-xs);
  min-height: 0;
  overflow-y: auto;
  padding: var(--nw-space-sm) clamp(1rem, 2.4vw, 1.5rem);
}

.nw-export-drawer__list {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nw-export-drawer__row {
  display: flex;
  align-items: flex-start;
  gap: var(--nw-space-2xs);
  padding: var(--nw-space-2xs);
  border: var(--nw-border-width) solid var(--nw-color-border-subtle);
  border-radius: var(--nw-radius-sm);
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-export-drawer__row:hover {
  border-color: var(--nw-color-glass-edge);
  background-color: var(--nw-color-accent-hover);
}

.nw-export-drawer__checkbox {
  flex: 0 0 auto;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 2px;
  accent-color: var(--nw-color-accent);
}

.nw-export-drawer__stage {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  font-size: var(--nw-font-size-sm);
}

.nw-export-drawer__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nw-export-drawer__id {
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
}

.nw-export-drawer__text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.nw-export-drawer__empty {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

.nw-export-drawer__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

.nw-export-drawer__result {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-glass-highlight);
}

.nw-export-drawer__result-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-sm);
}

.nw-export-drawer__link {
  overflow-wrap: anywhere;
  color: var(--nw-color-accent-contrast);
  font-size: var(--nw-font-size-sm);
  text-decoration: underline;
}

.nw-export-drawer__note {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

/* ---------- 底部 ---------- */
.nw-export-drawer__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-sm);
  padding: var(--nw-space-xs) clamp(1rem, 2.4vw, 1.5rem);
  border-top: var(--nw-border-width) solid var(--nw-color-border);
}

.nw-export-drawer__count {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

@media (max-width: 640px) {
  .nw-export-drawer__head {
    grid-template-columns: minmax(0, 1fr);
  }

  .nw-export-drawer__actions {
    justify-content: flex-end;
  }

  .nw-export-drawer__foot {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-export-drawer__panel {
    animation: none;
  }

  .nw-export-drawer__row,
  .nw-export-drawer__close {
    transition: none;
  }
}
</style>
