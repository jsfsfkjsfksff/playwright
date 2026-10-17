<script setup lang="ts">
/**
 * AddResourceModal —— 新增 / 编辑资源节点的表单弹窗
 * ---------------------------------------------------------------
 * 同一个弹窗承担「新增」与「编辑」两种用途：
 *   - 不传 initial → 新增（标题「新增资源」）
 *   - 传 initial   → 编辑（标题「编辑资源」，字段带出现值）
 * 文件名沿用约定的 AddResourceModal，行为上二合一，避免两个几乎一样的弹窗各写一份。
 *
 * 属性表（attributes）支持三种取值类型：文本 / 数字 / 布尔，与契约一致
 * （见 types/studio.ts 的 PropertyAttributes）。
 *
 * 提交前先校验：校验不过不抛事件，并在表单顶部给出具体原因。
 * 表单与页脚的「保存」按钮通过 form 属性关联，因此输入框里按 Enter 也能提交。
 */
import { computed, ref, useId } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type {
  PropertyAttributes,
  PropertyCreatePayload,
  PropertyResponse,
  PropertyType,
} from '@/types/studio'
import { PROPERTY_TYPES, formatAttributeValue, propertyTypeLabel } from '@/utils/studioVocabulary'

/** 属性值的录入类型，提交时换算成真正的布尔 / 数字 / 字符串 */
type AttributeKind = 'string' | 'number' | 'boolean'

interface AttributeRow {
  /** 仅用于 v-for 的 key，不提交 */
  id: number
  key: string
  kind: AttributeKind
  /**
   * 文本 / 数字两种类型共用这个输入框。
   * ⚠️ 类型是 `string | number`：数字行渲染成 `<input type="number">`，
   *    Vue 会给该输入框的 v-model 打开「自动转数字」，用户改过之后这里就是 number，
   *    再按字符串 `.trim()` 会抛 TypeError（表单静默不提交）。
   */
  text: string | number
  /** 布尔类型用这个 */
  bool: boolean
}

const KIND_OPTIONS: readonly { value: AttributeKind; label: string }[] = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
]

const props = withDefaults(
  defineProps<{
    /** 传入表示编辑现有资源；不传表示新增 */
    initial?: PropertyResponse | null
    /** 保存请求进行中：禁用提交并显示加载态 */
    saving?: boolean
  }>(),
  { initial: null, saving: false },
)

const emit = defineEmits<{
  submit: [payload: PropertyCreatePayload]
  close: []
}>()

const formId = useId()

const isEditing = computed(() => props.initial !== null && props.initial !== undefined)
const modalTitle = computed(() => (isEditing.value ? '编辑资源' : '新增资源'))

/** 行 id 的自增序号（每个弹窗实例各自计数即可） */
let rowSeq = 0

function nextRowId(): number {
  rowSeq += 1
  return rowSeq
}

/**
 * 把已有属性表还原成可编辑的行。
 * 入参允许 null：视图模型里 attributes 为 null 表示「后端没给这个字段」（列表加载而来），
 * 与「后端给了但内容为空」区分对待 —— 两者在编辑器里都表现为「没有属性行」。
 */
function toRows(attributes: PropertyAttributes | null | undefined): AttributeRow[] {
  if (!attributes) {
    return []
  }

  return Object.entries(attributes).map(([key, value]) => {
    if (typeof value === 'boolean') {
      return { id: nextRowId(), key, kind: 'boolean', text: '', bool: value }
    }
    if (typeof value === 'number') {
      return { id: nextRowId(), key, kind: 'number', text: String(value), bool: false }
    }
    return {
      id: nextRowId(),
      key,
      kind: 'string',
      // 取值可能是嵌套结构，用统一的格式化函数兜底成可编辑文本
      text: formatAttributeValue(value),
      bool: false,
    }
  })
}

const type = ref<PropertyType>(props.initial?.type ?? 'CHARACTER')
const name = ref(props.initial?.name ?? '')
const description = ref(props.initial?.description ?? '')
const rows = ref<AttributeRow[]>(toRows(props.initial?.attributes))
const formError = ref<string | null>(null)

function addRow(): void {
  rows.value.push({ id: nextRowId(), key: '', kind: 'string', text: '', bool: false })
}

function removeRow(id: number): void {
  rows.value = rows.value.filter((row) => row.id !== id)
}

/** 把界面上的行换算成 attributes；遇到问题返回 null 并写入 formError */
function buildAttributes(): PropertyAttributes | null {
  const attributes: PropertyAttributes = {}

  for (const row of rows.value) {
    const key = row.key.trim()
    if (key === '') {
      formError.value = '属性名不能为空：请补上名称，或删掉这一行'
      return null
    }
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      formError.value = `属性名重复：${key}`
      return null
    }

    if (row.kind === 'number') {
      // 数字行是 <input type="number">：Vue 的 v-model 会把用户输入直接转成 number，
      // 只按字符串处理会在用户改过输入框后抛异常。空输入仍是字符串 ''，按「未填」报错。
      const raw = typeof row.text === 'number' ? row.text : row.text.trim()
      const parsed = typeof raw === 'number' ? raw : Number(raw)

      if (raw === '' || !Number.isFinite(parsed)) {
        formError.value = `属性「${key}」需要填一个数字`
        return null
      }
      attributes[key] = parsed
      continue
    }

    // 文本 / 布尔：文本行是 type="text" 且布尔行用复选框，运行时不会是数字，这里仍兜底成字符串
    attributes[key] =
      row.kind === 'boolean' ? row.bool : typeof row.text === 'string' ? row.text : String(row.text)
  }

  return attributes
}

function handleSubmit(): void {
  formError.value = null

  const trimmedName = name.value.trim()
  if (trimmedName === '') {
    formError.value = '请填写资源名称'
    return
  }

  const attributes = buildAttributes()
  if (attributes === null) {
    return
  }

  emit('submit', {
    type: type.value,
    name: trimmedName,
    description: description.value.trim(),
    attributes,
  })
}
</script>

<template>
  <BaseModal :title="modalTitle" @close="emit('close')">
    <form :id="formId" class="nw-resource-form" @submit.prevent="handleSubmit">
      <p v-if="formError" class="nw-resource-form__error" role="alert">{{ formError }}</p>

      <fieldset class="nw-resource-form__field">
        <legend class="nw-resource-form__label">类型</legend>

        <div class="nw-resource-form__types">
          <button
            v-for="option in PROPERTY_TYPES"
            :key="option"
            class="nw-resource-form__type"
            type="button"
            :aria-pressed="type === option"
            @click="type = option"
          >
            {{ propertyTypeLabel(option) }}
          </button>
        </div>
      </fieldset>

      <label class="nw-resource-form__field">
        <span class="nw-resource-form__label">名称</span>
        <input
          v-model="name"
          class="nw-resource-form__input"
          type="text"
          maxlength="60"
          placeholder="例如：主播小林"
        />
      </label>

      <label class="nw-resource-form__field">
        <span class="nw-resource-form__label">描述</span>
        <textarea
          v-model="description"
          class="nw-resource-form__input nw-resource-form__input--area"
          rows="3"
          placeholder="这个资源的设定、用途或约束"
        />
      </label>

      <section class="nw-resource-form__field">
        <div class="nw-resource-form__attrs-head">
          <span class="nw-resource-form__label">属性</span>
          <AppButton size="md" variant="secondary" @click="addRow">添加属性</AppButton>
        </div>

        <p v-if="rows.length === 0" class="nw-resource-form__hint">
          还没有属性。可以按需添加键值对，例如 isHostile = 否。
        </p>

        <ul v-else class="nw-resource-form__attrs">
          <li v-for="row in rows" :key="row.id" class="nw-resource-form__attr">
            <input
              v-model="row.key"
              class="nw-resource-form__input"
              type="text"
              placeholder="属性名"
              aria-label="属性名"
            />

            <select v-model="row.kind" class="nw-resource-form__input" aria-label="取值类型">
              <option v-for="option in KIND_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>

            <input
              v-if="row.kind === 'boolean'"
              v-model="row.bool"
              class="nw-resource-form__checkbox"
              type="checkbox"
              aria-label="取值（布尔）"
            />
            <input
              v-else
              v-model="row.text"
              class="nw-resource-form__input"
              :type="row.kind === 'number' ? 'number' : 'text'"
              :step="row.kind === 'number' ? 'any' : undefined"
              placeholder="取值"
              aria-label="取值"
            />

            <AppButton size="md" variant="ghost" @click="removeRow(row.id)">移除</AppButton>
          </li>
        </ul>
      </section>
    </form>

    <template #footer>
      <AppButton size="md" variant="secondary" :disabled="saving" @click="emit('close')">
        取消
      </AppButton>

      <AppButton
        :form="formId"
        native-type="submit"
        size="md"
        variant="primary"
        :loading="saving"
        loading-label="保存中"
      >
        {{ isEditing ? '保存修改' : '创建资源' }}
      </AppButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.nw-resource-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-sm);
}

.nw-resource-form__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

.nw-resource-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  border: none;
}

.nw-resource-form__label {
  padding: 0;
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-resource-form__input {
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

.nw-resource-form__input::placeholder {
  color: var(--nw-color-text-disabled);
}

.nw-resource-form__input:focus-visible {
  outline: none;
  border-color: var(--nw-color-focus);
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-resource-form__input--area {
  min-height: 4.5rem;
  line-height: var(--nw-line-height-normal);
  resize: vertical;
}

/* ---------- 类型：三选一分段控件 ---------- */
.nw-resource-form__types {
  display: flex;
  gap: var(--nw-space-2xs);
}

.nw-resource-form__type {
  flex: 1;
  padding: 0.45rem 0.75rem;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-secondary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-resource-form__type[aria-pressed='true'] {
  border-color: var(--nw-color-border-strong);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  box-shadow: var(--nw-glow-accent-soft);
}

.nw-resource-form__type:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

/* ---------- 属性表 ---------- */
.nw-resource-form__attrs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
}

.nw-resource-form__attrs {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-resource-form__attr {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) 6.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-resource-form__checkbox {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--nw-color-accent);
}

.nw-resource-form__hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

@media (max-width: 640px) {
  .nw-resource-form__attr {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-resource-form__input,
  .nw-resource-form__type {
    transition: none;
  }
}
</style>
