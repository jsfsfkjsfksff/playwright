<script setup lang="ts">
/**
 * SaveLoadModal —— 存读档弹窗（Save & Load）
 * ---------------------------------------------------------------
 * 需求 3：在页面适当位置提供「存档」和「读档」按钮，点击后弹出科幻风格的模态框。
 * 本组件就是那个模态框，两种模式复用同一套外壳（draft / browse）：
 *   · mode='save'   → 新建一份存档：可改名，下方同时列出已有存档（便于覆盖管理）
 *   · mode='load'   → 选一份存档读取；列表为空时如实说明「还没有存档」
 *
 * 【为什么用 Naive UI 的 n-modal 而不是项目自带的 BaseModal】
 *   需求明确要求「搜索好看又好用的 UI 组件库，再修改 UI」，且已确认引入 Naive UI。
 *   本弹窗是引入后的主要落地处：n-modal 自带焦点陷阱、Esc 关闭、滚动锁定、
 *   aria-modal 语义，与 BaseModal 的能力对等但由库维护。
 *   视觉上它被 styles/naive-overrides.css 拉回站内玻璃拟态 ——
 *   并且本组件外层套了 `.nw-naive-scope`，Naive 的默认外观不会漏出来。
 *   其余既有弹窗（资源 / 配音 / 插值 / 导出）仍用 BaseModal，不做无谓搬迁。
 *
 * 【为什么不在这个弹窗里做「删除确认」的原生 confirm】
 *   confirm() 会阻塞主线程且样式不可控，与站内模态框风格割裂。
 *   这里用「两步确认」按钮（与 AnchorCard 的删除一致），全站口径统一。
 */
import { computed, ref, watch } from 'vue'
import { NButton, NEmpty, NInput, NModal, NTag } from 'naive-ui'

import NaiveModalShell from '@/components/base/NaiveModalShell.vue'
import type { SaveData } from '@/types/studio'

const props = defineProps<{
  /** 是否显示 */
  show: boolean
  /** 'save' = 新建存档；'load' = 读取存档 */
  mode: 'save' | 'load'
  /** 已有存档（按新→旧） */
  saves: readonly SaveData[]
  /** 当前所在节点 id（存档模式用于提示「将存在这里」） */
  currentNodeId: string
  /** 当前世界线步数（存档模式用于提示存档内容） */
  stepCount: number
  /** 写入 / 读取进行中 */
  busy?: boolean
  /** 存储层返回的失败原因（配额满、隐私模式等） */
  error?: string | null
}>()

const emit = defineEmits<{
  /** 新建存档（名称可为空，由调用方回退成可辨认的默认名） */
  create: [name: string]
  /** 读取指定存档 */
  load: [save: SaveData]
  /** 删除指定存档 */
  remove: [id: string]
  /** 清空全部存档 */
  clear: []
  close: []
}>()

const title = computed(() => (props.mode === 'save' ? '存档' : '读档'))

/* =============================================================
 * 新建存档的名称
 * ============================================================= */

const draftName = ref('')

// 每次打开都重置输入：上一次输了一半的名字不该带到下一次
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      draftName.value = ''
      confirmingRemoveId.value = null
      confirmingClear.value = false
    }
  },
)

/* =============================================================
 * 删除的两步确认
 * ============================================================= */

const confirmingRemoveId = ref<string | null>(null)
const confirmingClear = ref(false)

function handleRemoveClick(id: string): void {
  if (confirmingRemoveId.value !== id) {
    confirmingRemoveId.value = id
    return
  }

  confirmingRemoveId.value = null
  emit('remove', id)
}

function handleClearClick(): void {
  if (!confirmingClear.value) {
    confirmingClear.value = true
    return
  }

  confirmingClear.value = false
  emit('clear')
}

/* =============================================================
 * 展示辅助
 * ============================================================= */

/**
 * 存档时间格式化。
 * 手写而不用 Intl.DateTimeFormat 的完整格式：存档列表要的是「一眼看出新旧的紧凑时间」，
 * 用 `toLocaleString` 在中文环境下会带上「上午/下午」与秒，一行放不下还难扫读。
 */
function formatSavedAt(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 展示用存档名：用户没起名时回退成「卡片名 · 时间」，不会是「无标题」 */
function saveLabel(save: SaveData): string {
  const name = save.name.trim()
  if (name !== '') {
    return name
  }

  const card = (save.cardName ?? '').trim()
  return card === '' ? formatSavedAt(save.savedAt) : card
}

/** 路径摘要：最多显示前 3 步与总步数，避免长世界线把条目撑爆 */
function pathSummary(save: SaveData): string {
  const labels = save.nodeHistory.map((step) => {
    const name = step.cardName.trim()
    return name === '' ? step.sceneId : name
  })

  if (labels.length === 0) {
    return '（空路径）'
  }

  const HEAD = 3
  if (labels.length <= HEAD) {
    return labels.join(' → ')
  }

  return `${labels.slice(0, HEAD).join(' → ')} → … （共 ${labels.length} 步）`
}

/** 音频进度展示：没有记录进度时不显示这一项（而不是显示 0:00 假装有） */
function formatProgress(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return ''
  }

  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
</script>

<template>
  <!--
    ⚠️ NaiveModalShell 是必需的，不是装饰：
    n-modal 会 Teleport 到 body，跑到 App.vue 那层 <n-config-provider> 的子树之外，
    拿不到深色主题 → 退回 Naive 默认浅色（白底黑字）。
    这层壳把 provider 也送到 body，让弹窗与主题处在同一子树。
    详见 components/base/NaiveModalShell.vue 的说明。
  -->
  <NaiveModalShell>
    <NModal
      :show="show"
      preset="card"
      :title="title"
      :bordered="false"
      :style="{ width: 'min(92vw, 44rem)' }"
      :mask-closable="true"
      @update:show="(value) => { if (!value) emit('close') }"
    >
      <!-- 存档模式：命名 + 说明存的是什么 -->
      <section v-if="mode === 'save'" class="nw-saves__new">
        <label class="nw-saves__field">
          <span class="nw-saves__label">存档名称</span>
          <NInput
            v-model:value="draftName"
            placeholder="留空则自动命名"
            :maxlength="40"
            :disabled="busy"
          />
        </label>

        <p class="nw-saves__note">
          将记录：当前节点
          <code class="nw-saves__code">{{ currentNodeId || '（未开始）' }}</code>
          、世界线路径 {{ stepCount }} 步、音频播放进度。
        </p>

        <NButton
          type="primary"
          :loading="busy"
          :disabled="currentNodeId === ''"
          @click="emit('create', draftName)"
        >
          保存为新存档
        </NButton>
      </section>

      <!-- 失败原因：存储写不进去时必须如实说明，不能假装存上了 -->
      <p v-if="error" class="nw-saves__error" role="alert">{{ error }}</p>

      <section class="nw-saves__list-section">
        <header class="nw-saves__list-head">
          <h3 class="nw-saves__list-title">
            已有存档
            <NTag v-if="saves.length > 0" size="small" :bordered="false">{{ saves.length }}</NTag>
          </h3>

          <template v-if="saves.length > 0">
            <NButton
              v-if="confirmingClear"
              size="tiny"
              quaternary
              @click="confirmingClear = false"
            >
              取消
            </NButton>
            <NButton size="tiny" quaternary @click="handleClearClick">
              {{ confirmingClear ? '确认清空全部？' : '清空全部' }}
            </NButton>
          </template>
        </header>

        <NEmpty v-if="saves.length === 0" class="nw-saves__empty" description="还没有存档" />

        <ul v-else class="nw-saves__list">
          <li v-for="save in saves" :key="save.id" class="nw-saves__item">
            <div class="nw-saves__item-main">
              <p class="nw-saves__item-name">{{ saveLabel(save) }}</p>
              <p class="nw-saves__item-time">
                {{ formatSavedAt(save.savedAt) }}
                <span v-if="formatProgress(save.audioProgress) !== ''" class="nw-saves__item-progress">
                  已播到 {{ formatProgress(save.audioProgress) }}
                </span>
              </p>
              <p class="nw-saves__item-path" :title="pathSummary(save)">{{ pathSummary(save) }}</p>
            </div>

            <div class="nw-saves__item-actions">
              <NButton v-if="mode === 'load'" type="primary" size="small" :disabled="busy" @click="emit('load', save)">
                读取
              </NButton>

              <NButton
                v-if="confirmingRemoveId === save.id"
                size="small"
                quaternary
                @click="confirmingRemoveId = null"
              >
                取消
              </NButton>
              <NButton size="small" quaternary @click="handleRemoveClick(save.id)">
                {{ confirmingRemoveId === save.id ? '确认删除？' : '删除' }}
              </NButton>
            </div>
          </li>
        </ul>
      </section>
    </NModal>
  </NaiveModalShell>
</template>

<style scoped>
/* ---------- 新存档区 ---------- */
.nw-saves__new {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: var(--nw-space-xs);
  margin-bottom: var(--nw-space-sm);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-glass-fill);
}

.nw-saves__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-saves__label,
.nw-saves__list-title {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-saves__note {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-saves__code {
  padding: 1px 6px;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-xs);
  color: var(--nw-color-accent-contrast);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-xs);
}

/* 新存档区的按钮不占满整行，避免看起来像「整块都可点」 */
.nw-saves__new :deep(.n-button) {
  align-self: flex-start;
}

.nw-saves__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  margin-bottom: var(--nw-space-2xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

/* ---------- 列表 ---------- */
.nw-saves__list-section {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-saves__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
}

.nw-saves__list-title {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  font-weight: var(--nw-font-weight-medium);
}

.nw-saves__empty {
  padding-block: var(--nw-space-sm);
}

.nw-saves__list {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条存档：玻璃底 + 左侧强调条，科幻面板的观感 */
.nw-saves__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-left: 2px solid var(--nw-color-accent);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  transition: var(--nw-transition-colors);
}

.nw-saves__item:hover {
  border-color: var(--nw-color-border-strong);
  background-color: var(--nw-color-button-fill-secondary-hover);
}

.nw-saves__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nw-saves__item-name {
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nw-saves__item-time {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
}

.nw-saves__item-progress {
  margin-left: var(--nw-space-2xs);
  color: var(--nw-color-accent-contrast);
}

.nw-saves__item-path {
  overflow: hidden;
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nw-saves__item-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--nw-space-2xs);
}

@media (max-width: 640px) {
  .nw-saves__item {
    flex-direction: column;
    align-items: stretch;
  }

  .nw-saves__item-actions {
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-saves__item {
    transition: none;
  }
}
</style>
