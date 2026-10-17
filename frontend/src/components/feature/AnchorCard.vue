<script setup lang="ts">
/**
 * AnchorCard —— 单个剧情锚点卡片
 * ---------------------------------------------------------------
 * 只负责呈现与收集输入，不碰 store：编辑 / 删除 / 拖拽一律抛事件给页面，
 * 数据流保持单向（卡片抛事件 → 页面调 store）。
 *
 * 三个可编辑字段（sceneId 是身份，只读展示）：
 *   - speaker   ：下拉选择，数据来源是资源页的角色，外加固定的「旁白」；
 *   - timeStage ：数字输入（契约：越小越靠前，相同即并列）；
 *   - text      ：场景文本。
 *
 * ⚠️ 数字框为什么不写 v-model：
 *    Vue 会给 `<input type="number">` 的 v-model 打开「自动转数字」，但清空输入框时
 *    拿到的又是字符串 '' —— 两者混在一起会往 `timeStage: number` 里塞进非数字。
 *    这里显式用 :value + @input 自行解析、校验，非法输入不提交给 store。
 *
 * 拖拽：手柄是唯一的拖拽源（整卡可拖会与文本框选字冲突）。
 * 落点由父级 TimelineStage 决定 —— 拖到哪个阶段，timeStage 就变成那个阶段的数值。
 * 组内顺序无意义（相同 timeStage 在时间线上是并列的），因此不做组内排序。
 */
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import type { SceneAnchor, SceneAnchorPatch } from '@/types/studio'
import { NARRATOR_SPEAKER } from '@/utils/studioVocabulary'

const props = withDefaults(
  defineProps<{
    anchor: SceneAnchor
    /** 说话人下拉的数据来源（角色名，来自资源页） */
    characters: readonly string[]
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
 * 说话人
 * ============================================================= */

/**
 * 下拉选项：旁白永远在第一位，其余是角色名。
 * 当前取值不在角色列表里时（角色被删掉或改名）也保留它，
 * 否则下拉会静默把说话人换成列表里的第一项。
 */
const speakerOptions = computed(() => {
  const names = [...props.characters]
  if (!names.includes(NARRATOR_SPEAKER)) {
    names.unshift(NARRATOR_SPEAKER)
  }
  if (props.anchor.speaker !== '' && !names.includes(props.anchor.speaker)) {
    names.push(props.anchor.speaker)
  }
  return names
})

/** 当前说话人是否已经不在角色列表里（旁白除外） */
const speakerMissing = computed(
  () =>
    props.anchor.speaker !== '' &&
    props.anchor.speaker !== NARRATOR_SPEAKER &&
    !props.characters.includes(props.anchor.speaker),
)

function handleSpeakerChange(event: Event): void {
  emit('update', { speaker: (event.target as HTMLSelectElement).value })
}

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
  <GlassPanel class="nw-anchor-card" :class="{ 'nw-anchor-card--dragging': dragging }">
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

      <code class="nw-anchor-card__id">{{ anchor.sceneId }}</code>

      <span class="nw-anchor-card__stage">阶段 {{ anchor.timeStage }}</span>

      <template v-if="confirmingRemove">
        <AppButton size="md" variant="ghost" @click="handleRemoveClick">确认删除</AppButton>
        <AppButton size="md" variant="ghost" @click="confirmingRemove = false">取消</AppButton>
      </template>
      <AppButton v-else size="md" variant="ghost" @click="handleRemoveClick">删除</AppButton>
    </header>

    <label class="nw-anchor-card__field">
      <span class="nw-anchor-card__label">说话人</span>
      <select class="nw-anchor-card__input" :value="anchor.speaker" @change="handleSpeakerChange">
        <option v-for="name in speakerOptions" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <p v-if="speakerMissing" class="nw-anchor-card__hint">
      该说话人不在当前角色列表中（可能已被删除或改名），下拉里仍保留原值。
    </p>

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

.nw-anchor-card__id {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (prefers-reduced-motion: reduce) {
  .nw-anchor-card,
  .nw-anchor-card__input {
    transition: none;
  }
}
</style>
