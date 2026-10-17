<script setup lang="ts">
/**
 * InterpolateModal —— 一键生成（AI 插值）参数弹窗
 * ---------------------------------------------------------------
 * 请求体严格对应后端 StepRequest：
 *   `{ startSceneId, mustBeSceneId, isStatic, outline, layer, maxActions }`
 *   字段名以后端 `@JsonProperty` 为准（`mustBeSceneId` 小写开头驼峰、`isStatic`），
 *   其中 `isStatic: true` 表示**静态场景收束**（直接连起点到必经点，不做 AIGC 扩写）。
 *
 * ⚠️ 关于「加载进度」：
 *   契约里**没有进度接口** —— 文档只说「返回 200 状态码，表示图谱已成功裂变并缝合」，
 *   即一次请求一次响应。因此这里不编造百分比或阶段完成度，
 *   只展示「已提交、等待后端返回」的流水线示意，并明确写出它不代表真实进度。
 *
 * ⚠️ 数值范围：契约给了示例（layer 2 / maxActions 3）但没规定上下界，
 *   这里只校验「是 ≥ 1 的整数」，确认后改下方 MIN_INTEGER 一处即可。
 */
import { computed, ref, useId } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type { InterpolateRequest, SceneAnchor } from '@/types/studio'

/** 后端流水线的三个阶段：仅用于「等待中」的示意，不代表真实进度 */
const PIPELINE_STAGES = ['HTN 计算', 'Agent 渲染', 'TTS 合成'] as const

/** 数值下限（⚠️ 契约未规定范围，暂按「至少 1」校验） */
const MIN_INTEGER = 1

const props = withDefaults(
  defineProps<{
    /** 当前锚点，**按时间顺序**传入（起点取第一个、终点取最后一个作为默认值） */
    anchors: readonly SceneAnchor[]
    /** 生成请求进行中 */
    generating?: boolean
    /** 上层带下来的失败原因（通常来自 store.lastError） */
    error?: string | null
  }>(),
  { generating: false, error: null },
)

const emit = defineEmits<{
  submit: [payload: InterpolateRequest]
  close: []
}>()

const formId = useId()

/** 默认把时间上最早 / 最晚的两个锚点作为起点与必经点 */
const startSceneId = ref(props.anchors[0]?.sceneId ?? '')
const mustBeSceneId = ref(props.anchors[props.anchors.length - 1]?.sceneId ?? '')

const outline = ref('')
const isStatic = ref(false)

/**
 * ⚠️ 数字框的值域是 `string | number`：Vue 会给 `<input type="number">` 的 v-model
 * 打开「自动转数字」，但清空时又是字符串 ''，两者混在一起会塞进非数字。
 * 这里同样显式解析（见 AnchorCard 的同类说明）。
 */
const layer = ref<string | number>(2)
const maxActions = ref<string | number>(3)

const formError = ref<string | null>(null)

/** 起点候选：所有锚点（按时间顺序，便于用户辨认） */
const sceneOptions = computed(() => props.anchors)

/** 失败原因优先显示上层带下来的（网络 / 业务错误） */
const displayError = computed(() => formError.value ?? props.error)

/** 解析「≥ MIN_INTEGER 的整数」 */
function parseInteger(value: string | number, label: string): number | null {
  const parsed = typeof value === 'number' ? value : Number(value.trim())

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < MIN_INTEGER) {
    formError.value = `${label}要填一个不小于 ${MIN_INTEGER} 的整数`
    return null
  }

  return parsed
}

function handleIntegerInput(target: 'layer' | 'maxActions', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (target === 'layer') {
    layer.value = value
  } else {
    maxActions.value = value
  }
}

function handleSubmit(): void {
  formError.value = null

  if (startSceneId.value === '' || mustBeSceneId.value === '') {
    formError.value = '请选择起始场景与必经场景'
    return
  }

  if (startSceneId.value === mustBeSceneId.value) {
    formError.value = '起始场景与必经场景不能是同一个：插值需要在两点之间补全'
    return
  }

  if (outline.value.trim() === '') {
    formError.value = '请填写剧情大纲：这是 AI 插值的输入'
    return
  }

  const parsedLayer = parseInteger(layer.value, '生成层级')
  if (parsedLayer === null) {
    return
  }

  const parsedMaxActions = parseInteger(maxActions.value, '动作数上限')
  if (parsedMaxActions === null) {
    return
  }

  emit('submit', {
    startSceneId: startSceneId.value,
    // 与后端 StepRequest 的 @JsonProperty("mustBeSceneId") 对应
    mustBeSceneId: mustBeSceneId.value,
    isStatic: isStatic.value,
    outline: outline.value.trim(),
    layer: parsedLayer,
    maxActions: parsedMaxActions,
  })
}

/** 生成过程中不允许关闭：请求还在飞，关掉会让用户以为已经取消 */
function handleClose(): void {
  if (!props.generating) {
    emit('close')
  }
}
</script>

<template>
  <BaseModal title="一键生成（插值补全）" @close="handleClose">
    <form :id="formId" class="nw-interpolate" @submit.prevent="handleSubmit">
      <!-- 等待后端返回：只有「已提交」这一个已知事实，不编造阶段进度 -->
      <div v-if="generating" class="nw-interpolate__progress" role="status">
        <p class="nw-interpolate__progress-title">已提交，正在等待后端算完</p>
        <ol class="nw-interpolate__pipeline">
          <li v-for="stage in PIPELINE_STAGES" :key="stage" class="nw-interpolate__stage">
            {{ stage }}
          </li>
        </ol>
        <p class="nw-interpolate__note">
          契约没有进度接口：后端把 HTN 演算、剧情渲染与语音合成都做完后一次性返回结果，
          因此上面的三个阶段只是等待示意，不代表真实进度。
        </p>
      </div>

      <template v-else>
        <p v-if="displayError" class="nw-interpolate__error" role="alert">{{ displayError }}</p>

        <label class="nw-interpolate__field">
          <span class="nw-interpolate__label">起始场景 startSceneId</span>
          <select v-model="startSceneId" class="nw-interpolate__input">
            <option v-for="anchor in sceneOptions" :key="anchor.sceneId" :value="anchor.sceneId">
              阶段 {{ anchor.timeStage }} · {{ anchor.sceneId }}
            </option>
          </select>
        </label>

        <label class="nw-interpolate__field">
          <span class="nw-interpolate__label">必经场景 mustBeSceneId</span>
          <select v-model="mustBeSceneId" class="nw-interpolate__input">
            <option v-for="anchor in sceneOptions" :key="anchor.sceneId" :value="anchor.sceneId">
              阶段 {{ anchor.timeStage }} · {{ anchor.sceneId }}
            </option>
          </select>
        </label>
        <p class="nw-interpolate__note">
          字段名与后端 StepRequest 的 @JsonProperty("mustBeSceneId") 一致。
        </p>

        <label class="nw-interpolate__field">
          <span class="nw-interpolate__label">剧情大纲 outline</span>
          <textarea
            v-model="outline"
            class="nw-interpolate__input nw-interpolate__input--area"
            rows="3"
            placeholder="例如：男主试图强行冲卡但失败"
          />
        </label>

        <label class="nw-interpolate__check">
          <input v-model="isStatic" class="nw-interpolate__checkbox" type="checkbox" />
          <span>isStatic：静态场景收束（不生成新场景，layer 参数无效）</span>
        </label>

        <div class="nw-interpolate__numbers">
          <label class="nw-interpolate__field">
            <span class="nw-interpolate__label">生成层级 layer</span>
            <input
              class="nw-interpolate__input"
              type="number"
              step="1"
              :min="MIN_INTEGER"
              :disabled="isStatic"
              :value="layer"
              @input="handleIntegerInput('layer', $event)"
            />
          </label>

          <label class="nw-interpolate__field">
            <span class="nw-interpolate__label">动作数上限 maxActions</span>
            <input
              class="nw-interpolate__input"
              type="number"
              step="1"
              :min="MIN_INTEGER"
              :value="maxActions"
              @input="handleIntegerInput('maxActions', $event)"
            />
          </label>
        </div>
        <p class="nw-interpolate__note">
          layer 与 maxActions 的上下界契约未定义，当前只校验「不小于 {{ MIN_INTEGER }} 的整数」。
        </p>
      </template>
    </form>

    <template #footer>
      <AppButton
        size="md"
        variant="secondary"
        :disabled="generating"
        @click="emit('close')"
      >
        {{ generating ? '生成中…' : '取消' }}
      </AppButton>

      <AppButton
        :form="formId"
        native-type="submit"
        size="md"
        variant="primary"
        :loading="generating"
        loading-label="生成中…"
      >
        开始生成
      </AppButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.nw-interpolate {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
}

.nw-interpolate__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-interpolate__label {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-interpolate__input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  transition: var(--nw-transition-colors);
}

.nw-interpolate__input::placeholder {
  color: var(--nw-color-text-disabled);
}

.nw-interpolate__input:focus-visible {
  outline: none;
  border-color: var(--nw-color-focus);
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-interpolate__input:disabled {
  color: var(--nw-color-text-disabled);
  cursor: not-allowed;
}

.nw-interpolate__input--area {
  min-height: 4rem;
  line-height: var(--nw-line-height-normal);
  resize: vertical;
}

.nw-interpolate__numbers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--nw-space-xs);
}

.nw-interpolate__check {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
}

.nw-interpolate__checkbox {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--nw-color-accent);
}

.nw-interpolate__note {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-interpolate__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

/* ---------- 等待后端返回 ---------- */
.nw-interpolate__progress {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  padding: var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-glass-highlight);
}

.nw-interpolate__progress-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
}

.nw-interpolate__pipeline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nw-interpolate__stage {
  padding: 4px 12px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  animation: nw-interpolate-pulse 1.6s var(--nw-ease-in-out) infinite;
}

.nw-interpolate__stage:nth-child(2) {
  animation-delay: 0.2s;
}

.nw-interpolate__stage:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes nw-interpolate-pulse {
  0%,
  100% {
    border-color: var(--nw-color-glass-edge);
    color: var(--nw-color-text-secondary);
  }

  50% {
    border-color: var(--nw-color-accent);
    color: var(--nw-color-text-primary);
  }
}

@media (max-width: 640px) {
  .nw-interpolate__numbers {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-interpolate__stage {
    animation: none;
  }

  .nw-interpolate__input {
    transition: none;
  }
}
</style>
