<script setup lang="ts">
/**
 * AnchorCard —— 单个剧情锚点卡片
 * ---------------------------------------------------------------
 * 只负责呈现与收集输入，不碰 store：编辑 / 删除 / 拖拽一律抛事件给页面，
 * 数据流保持单向（卡片抛事件 → 页面调 store）。
 *
 * 可编辑字段（sceneId 是身份，随数据提交，**不在界面上展示**）：
 *   - cardName  ：卡片名称（本轮需求新增）—— 双击标题或点「重命名」图标进入编辑；
 *   - timeStage ：数字输入（契约：越小越靠前，相同即并列）；
 *   - text      ：场景文本；
 *   - audioURL  ：音频地址。
 *
 * ⚠️ 说话人（speaker）已按需求「彻底移除」：本组件不再有说话人下拉，
 *    也不再有 characters 这个 prop。锚点的 speaker 由页面在新建时统一写成「旁白」
 *    （数据层仍保留该字段以兼容后端契约，详见 types/studio.ts 的 SceneAnchor.speaker）。
 *
 * ⚠️ 数字框为什么不写 v-model：
 *    Vue 会给 `<input type="number">` 的 v-model 打开「自动转数字」，但清空输入框时
 *    拿到的又是字符串 '' —— 两者混在一起会往 `timeStage: number` 里塞进非数字。
 *    这里显式用 :value + @input 自行解析、校验，非法输入不提交给 store。
 *
 * 卡片名称为什么是「双击进入编辑」而不是常驻输入框：
 *    常驻输入框会让每张卡片多一个永远空着的框，卡片列表看起来全是表单；
 *    标题本身就该是标题，只在要改的时候变成输入框。
 *    同时保留一个显式的「重命名」图标按钮 —— 双击对键盘与触屏用户不可达，
 *    只用双击等于把功能藏起来（无障碍要求）。
 *
 * 拖拽：手柄是唯一的拖拽源（整卡可拖会与文本框选字冲突）。
 * 落点由父级 TimelineStage 决定 —— 拖到哪个阶段，timeStage 就变成那个阶段的数值。
 * 组内顺序无意义（相同 timeStage 在时间线上是并列的），因此不做组内排序。
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import type { SceneAnchor, SceneAnchorPatch } from '@/types/studio'

const props = withDefaults(
  defineProps<{
    anchor: SceneAnchor
    /** 是否正在被拖拽：由页面统一管理，用于整卡降透明度 */
    dragging?: boolean
  }>(),
  { dragging: false },
)

const emit = defineEmits<{
  update: [patch: SceneAnchorPatch]
  remove: []
  dragStart: [sceneId: string]
  dragEnd: []
}>()

/* =============================================================
 * 场景 id（卡片标题）
 * -------------------------------------------------------------
 * 规则：**一经填写，不能再修改**。
 *   - 新建时由页面给一个占位 id（SCENE_ANCHOR_xx），此时可填写一次；
 *   - 填好之后标题变成只读文本，不再提供任何编辑入口。
 * ============================================================= */

/** 系统占位 id：只有它还处于这个形态时，才允许填写一次 */
const AUTO_ID_PATTERN = /^SCENE_ANCHOR_\d+$/

/** 是否是「还没填写」的占位 id */
const isPendingId = computed(() => AUTO_ID_PATTERN.test(props.anchor.sceneId))

/** 是否处于唯一的命名输入态 */
const renaming = ref(false)

/** 编辑中的草稿值；确认前不写进 store */
const nameDraft = ref('')

const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

/** 标题就是 sceneId —— 所见即所传，不给「展示名」留第二套口径 */
const displayTitle = computed(() => props.anchor.sceneId)

/**
 * 进入命名态（只允许一次）：
 * 只有占位 id（SCENE_ANCHOR_xx）还能填；已经填写过的 id 直接拒绝，
 * 这样「一经填写就不能修改」在组件层也成立，而不只是藏起按钮。
 */
function startRename(): void {
  if (renaming.value || !isPendingId.value) {
    return
  }

  nameDraft.value = props.anchor.sceneId
  renaming.value = true

  void nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

/** 确认：只在真的改了内容时才提交，避免点一下标题就产生一次写操作 */
function commitRename(): void {
  if (!renaming.value) {
    return
  }

  renaming.value = false

  const next = nameDraft.value.trim()
  // 空值不提交：清空后失焦视为放弃命名，保留占位 id
  if (next === '' || next === props.anchor.sceneId) {
    return
  }

  emit('update', { sceneId: next })
}

/** 取消：丢弃草稿，不提交 */
function cancelRename(): void {
  renaming.value = false
  nameDraft.value = ''
}

/**
 * Esc 取消、Enter 确认。
 * 用 keydown 而不是 v-model 的 @change：@change 只在失焦时触发，
 * 用户按回车时期望立刻生效。
 */
function handleNameKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

// 外部改了 sceneId（例如读档、撤销）时，若正在命名则同步草稿，避免显示过期内容
watch(
  () => props.anchor.sceneId,
  (value) => {
    if (renaming.value) {
      nameDraft.value = (value ?? '').trim()
    }
  },
)

/* =============================================================
 * 时间阶段
 * ============================================================= */

/** 输入框的原始文本：允许出现「清空」「只输一半」这类中间状态 */
const stageDraft = ref(String(props.anchor.timeStage))
const stageError = ref<string | null>(null)

// 外部改了 timeStage（例如被拖到别的阶段）时同步输入框
watch(
  () => props.anchor.timeStage,
  (value) => {
    if (Number(stageDraft.value) !== value) {
      stageDraft.value = String(value)
      stageError.value = null
    }
  },
)

function handleStageInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  stageDraft.value = value

  const raw = value.trim()
  const parsed = Number(raw)

  // 契约只要求是数字坐标（示例 99），没有规定上下界，因此这里只校验「是个整数」
  if (raw === '' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    stageError.value = '时间阶段要填一个整数'
    return
  }

  stageError.value = null
  if (parsed !== props.anchor.timeStage) {
    emit('update', { timeStage: parsed })
  }
}

/* =============================================================
 * 场景文本
 * ============================================================= */

function handleTextInput(event: Event): void {
  emit('update', { text: (event.target as HTMLTextAreaElement).value })
}

/* =============================================================
 * 音频地址
 * -------------------------------------------------------------
 * 只做「去掉首尾空白」这一步：
 *   - 不在输入过程中校验 URL 合法性（用户可能正打到一半）；
 *   - 空串 = 未生成，与「已生成但地址为空」语义一致，交给界面用徽标区分。
 * 真正的可用性由 <audio> 自己判断（error 事件），失败不会让表单失效。
 * ============================================================= */

function handleAudioInput(event: Event): void {
  emit('update', { audioURL: (event.target as HTMLInputElement).value.trim() })
}

/* =============================================================
 * 删除（两步确认，避免误触）
 * ============================================================= */

const confirmingRemove = ref(false)

function handleRemoveClick(): void {
  if (!confirmingRemove.value) {
    confirmingRemove.value = true
    return
  }

  confirmingRemove.value = false
  emit('remove')
}

/* =============================================================
 * 拖拽
 * ============================================================= */

function handleDragStart(event: DragEvent): void {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', props.anchor.sceneId)
    event.dataTransfer.effectAllowed = 'move'
  }
  emit('dragStart', props.anchor.sceneId)
}
</script>

<template>
  <GlassPanel
    class="nw-anchor-card"
    :class="{ 'nw-anchor-card--dragging': dragging }"
    :data-scene-id="anchor.sceneId"
  >
    <header class="nw-anchor-card__head">
      <!-- 拖拽手柄：只让手柄可拖，避免与文本框的选字操作冲突 -->
      <span
        class="nw-anchor-card__handle"
        draggable="true"
        title="拖到其它阶段即改变时间阶段"
        aria-hidden="true"
        @dragstart="handleDragStart"
        @dragend="emit('dragEnd')"
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M9 7h.01M15 7h.01M9 12h.01M15 12h.01M9 17h.01M15 17h.01" />
        </svg>
      </span>

      <span class="nw-anchor-card__stage">阶段 {{ anchor.timeStage }}</span>

      <template v-if="confirmingRemove">
        <AppButton size="md" variant="ghost" @click="handleRemoveClick">确认删除</AppButton>
        <AppButton size="md" variant="ghost" @click="confirmingRemove = false">取消</AppButton>
      </template>
      <AppButton v-else size="md" variant="ghost" @click="handleRemoveClick">删除</AppButton>
    </header>

    <!--
      卡片标题 = sceneId（需求 1），并且**一经填写就不能再修改**：
      只有还处于占位 id（SCENE_ANCHOR_xx，也就是还没命名）时才出现「命名」入口；
      命名之后标题是纯文本，没有双击编辑、也没有按钮。
    -->
    <div class="nw-anchor-card__title-row">
      <input
        v-if="renaming"
        ref="nameInput"
        v-model="nameDraft"
        class="nw-anchor-card__title-input"
        type="text"
        maxlength="40"
        placeholder="填写场景 id（提交后不可修改）"
        aria-label="场景 id"
        @keydown="handleNameKeydown"
        @blur="commitRename"
      />

      <template v-else>
        <h3
          class="nw-anchor-card__title"
          :title="isPendingId ? '还没命名：点右侧按钮填写场景 id' : '场景 id 已填写，不可修改'"
        >
          {{ displayTitle }}
        </h3>

        <button
          v-if="isPendingId"
          type="button"
          class="nw-anchor-card__icon-button"
          title="命名场景 id（只能填一次）"
          aria-label="命名场景 id"
          @click="startRename"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 20h4l10-10a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </template>
    </div>

    <label class="nw-anchor-card__field">
      <span class="nw-anchor-card__label">时间阶段</span>
      <input
        class="nw-anchor-card__input"
        type="number"
        step="1"
        :value="stageDraft"
        @input="handleStageInput"
      />
    </label>
    <p v-if="stageError" class="nw-anchor-card__error" role="alert">{{ stageError }}</p>
    <p v-else class="nw-anchor-card__hint">数值越小越靠前；与其它锚点相同即为并列结局。</p>

    <label class="nw-anchor-card__field">
      <span class="nw-anchor-card__label">场景文本</span>
      <textarea
        class="nw-anchor-card__input nw-anchor-card__input--area"
        rows="3"
        placeholder="这个场景里发生了什么（锚点是创作者定死、AI 不可改的节点）"
        :value="anchor.text"
        @input="handleTextInput"
      />
    </label>

    <!--
      音频地址（本轮需求新增字段）。
      编辑态与提交字段都是 `audioURL`（大写 URL）；播放域契约用的是 `audioUrl`，
      两者由 services/studio.ts 的 readPlayScene 负责映射，这里不要改成小写。
    -->
    <label class="nw-anchor-card__field">
      <span class="nw-anchor-card__label">
        音频地址
        <span class="nw-anchor-card__badge">{{ anchor.audioURL === '' ? '未生成' : '已生成' }}</span>
      </span>
      <span class="nw-anchor-card__audio">
        <input
          class="nw-anchor-card__input"
          type="url"
          inputmode="url"
          placeholder="https://…/scene.mp3（留空表示还没有音频）"
          :value="anchor.audioURL"
          @input="handleAudioInput"
        />
        <AppButton
          v-if="anchor.audioURL !== ''"
          size="md"
          variant="ghost"
          class="nw-anchor-card__audio-clear"
          @click="emit('update', { audioURL: '' })"
        >
          清空
        </AppButton>
        <button
          v-else
          type="button"
          class="nw-anchor-card__audio-play"
          disabled
          title="还没有音频地址"
          aria-label="试听（暂无音频）"
        >
          试听
        </button>
      </span>
    </label>

    <!-- 有地址时才给试听：地址为空时不造一个点了没反应的按钮 -->
    <audio
      v-if="anchor.audioURL !== ''"
      class="nw-anchor-card__player"
      :src="anchor.audioURL"
      controls
      preload="none"
    />
  </GlassPanel>
</template>

<style scoped>
.nw-anchor-card {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  min-width: 17rem;
  height: 100%;
  padding: clamp(0.75rem, 1.6vw, 1rem);
  transition: opacity var(--nw-duration-base) var(--nw-ease-out);
}

/* 正在被拖拽：整卡降透明度，落点由 TimelineStage 高亮 */
.nw-anchor-card--dragging {
  opacity: 0.45;
}

/* ---------- 头部 ---------- */
.nw-anchor-card__head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  min-width: 0;
}

.nw-anchor-card__handle {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-xs);
  color: var(--nw-color-text-tertiary);
  cursor: grab;
}

.nw-anchor-card__handle:active {
  cursor: grabbing;
}

.nw-anchor-card__handle svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

/* ---------- 卡片名称 ---------- */
.nw-anchor-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  min-width: 0;
  min-height: 2rem;
}

.nw-anchor-card__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 标题只读：编辑只发生在「还没命名」的那一次，见模板里的命名按钮 */
  cursor: default;
}

.nw-anchor-card__title-input {
  flex: 1;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  border: var(--nw-border-width) solid var(--nw-color-focus);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-medium);
}

.nw-anchor-card__title-input::placeholder {
  color: var(--nw-color-text-disabled);
  font-weight: var(--nw-font-weight-regular);
}

.nw-anchor-card__title-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-anchor-card__icon-button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  border: var(--nw-border-width) solid transparent;
  border-radius: var(--nw-radius-xs);
  background: none;
  color: var(--nw-color-text-tertiary);
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-anchor-card__icon-button svg {
  width: 15px;
  height: 15px;
}

.nw-anchor-card__icon-button:hover {
  border-color: var(--nw-color-border);
  background-color: var(--nw-color-hover);
  color: var(--nw-color-accent-contrast);
}

.nw-anchor-card__icon-button:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

.nw-anchor-card__stage {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  font-size: var(--nw-font-size-sm);
}

/* ---------- 字段 ---------- */
.nw-anchor-card__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nw-anchor-card__label {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-anchor-card__input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  transition: var(--nw-transition-colors);
}

.nw-anchor-card__input::placeholder {
  color: var(--nw-color-text-disabled);
}

.nw-anchor-card__input:focus-visible {
  outline: none;
  border-color: var(--nw-color-focus);
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-anchor-card__input--area {
  min-height: 3.75rem;
  line-height: var(--nw-line-height-normal);
  resize: vertical;
}

.nw-anchor-card__hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-anchor-card__error {
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

/* 卡片内的按钮收内边距：AppButton 默认左右 2.5rem，窄卡片里会挤到换行 */
.nw-anchor-card__head :deep(.nw-app-button) {
  padding-inline: var(--nw-space-sm);
}

/* ---------- 音频字段 ---------- */
.nw-anchor-card__badge {
  margin-left: var(--nw-space-2xs);
  padding: 0 6px;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
}

.nw-anchor-card__audio {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-anchor-card__audio :deep(.nw-app-button) {
  flex: 0 0 auto;
  padding-inline: var(--nw-space-sm);
}

/* 没有音频时也保留一个「试听」占位：位置固定，不会因为有没有地址而跳动 */
.nw-anchor-card__audio-play {
  flex: 0 0 auto;
  padding: 0 var(--nw-space-sm);
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: transparent;
  color: var(--nw-color-text-disabled);
  font-size: var(--nw-font-size-sm);
  cursor: not-allowed;
}

.nw-anchor-card__player {
  width: 100%;
  height: 2rem;
  margin-top: 2px;
  border-radius: var(--nw-radius-sm);
  /* 浏览器原生播放器在深色背景下会发白，用滤镜压暗（只影响这一处装饰） */
  filter: saturate(0.9) brightness(0.85);
}

@media (prefers-reduced-motion: reduce) {
  .nw-anchor-card,
  .nw-anchor-card__input,
  .nw-anchor-card__icon-button {
    transition: none;
  }
}
</style>
