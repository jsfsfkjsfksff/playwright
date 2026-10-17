<script setup lang="ts">
/**
 * VoiceConfigModal —— 全篇配音配置弹窗
 * ---------------------------------------------------------------
 * 全篇只有这一条配音（POST /api/v1/voices，**不带任何角色 id**）：
 * 用户配的是「讲播客的这个人」的音色，与资源（properties）域无关，
 * 因此这个弹窗由资源页的「全篇配音」按钮打开，不挂在单个资源卡片上。
 *
 * 数值口径：音高允许负数（半音偏移），语速是倍率且必须大于 0；
 * 上下界未定义，因此不擅自限定区间 —— 需要收紧时只改下方 MIN_RATE 一处。
 */
import { ref, useId } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type { VoiceConfig } from '@/types/studio'

const props = withDefaults(
  defineProps<{
    /** 当前全篇配音配置，用于回填；从未配置过时传后端返回的默认值 */
    initial?: VoiceConfig | null
    /** 保存请求进行中 */
    saving?: boolean
  }>(),
  { initial: null, saving: false },
)

const emit = defineEmits<{
  submit: [config: VoiceConfig]
  close: []
}>()

const formId = useId()

const modalTitle = '全篇配音配置'

/**
 * 数值口径（契约接口文档 v1.0 的示例：`pitch: -2.0`、`rate: 0.9`）：
 *   - 音高 pitch **允许负数**（半音偏移），只要求是有限数 —— 不能用「不小于 0」卡掉契约示例；
 *   - 语速 rate 是倍率，0 与负数没有意义，要求 > MIN_RATE；
 *   两者的上下界契约未定义，因此不擅自限定区间（确认后只在本处收紧）。
 */
const MIN_RATE = 0

const voiceName = ref(props.initial?.voiceName ?? '')
const promptStyle = ref(props.initial?.promptStyle ?? '')
/**
 * 音高 / 语速的输入值。
 * ⚠️ 类型必须是 `string | number`：Vue 在 `<input type="number">` 上会给 v-model 打开
 *    「自动转数字」（runtime-dom 的 castToNumber，条件是 vnode.props.type === 'number'），
 *    用户一旦手动改过输入框，这里拿到的就是 number 而不是字符串。
 *    早期版本按纯字符串处理并直接 `.trim()`，一改数字框就抛 TypeError（表单静默不提交）。
 */
const pitch = ref<string | number>(props.initial?.pitch ?? 1)
const rate = ref<string | number>(props.initial?.rate ?? 1)
const formError = ref<string | null>(null)

/** 解析有限数（允许负号）；不合法时写入 formError 并返回 null */
function parseFiniteNumber(value: string | number, label: string): number | null {
  // number 分支：数字框已经给出数值（空输入仍是字符串 ''，走下面的字符串分支）
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      formError.value = `${label}需要填一个数字`
      return null
    }
    return value
  }

  const raw = value.trim()
  if (raw === '') {
    formError.value = `${label}需要填一个数字`
    return null
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    formError.value = `${label}需要填一个数字`
    return null
  }

  return parsed
}

/** 解析语速倍率：必须是大于 MIN_RATE 的有限数 */
function parseRate(value: string | number): number | null {
  const parsed = parseFiniteNumber(value, '语速')
  if (parsed === null) {
    return null
  }

  if (parsed <= MIN_RATE) {
    formError.value = `语速需要大于 ${MIN_RATE}（契约示例 0.9）`
    return null
  }

  return parsed
}

function handleSubmit(): void {
  formError.value = null

  const trimmedName = voiceName.value.trim()
  if (trimmedName === '') {
    formError.value = '请填写音色名称'
    return
  }

  const parsedPitch = parseFiniteNumber(pitch.value, '音高')
  if (parsedPitch === null) {
    return
  }

  const parsedRate = parseRate(rate.value)
  if (parsedRate === null) {
    return
  }

  emit('submit', {
    voiceName: trimmedName,
    promptStyle: promptStyle.value.trim(),
    pitch: parsedPitch,
    rate: parsedRate,
  })
}
</script>

<template>
  <BaseModal :title="modalTitle" @close="emit('close')">
    <form :id="formId" class="nw-voice-form" @submit.prevent="handleSubmit">
      <p v-if="formError" class="nw-voice-form__error" role="alert">{{ formError }}</p>

      <label class="nw-voice-form__field">
        <span class="nw-voice-form__label">音色名称</span>
        <input
          v-model="voiceName"
          class="nw-voice-form__input"
          type="text"
          maxlength="40"
          placeholder="例如：温润男声"
        />
      </label>

      <label class="nw-voice-form__field">
        <span class="nw-voice-form__label">风格提示词</span>
        <textarea
          v-model="promptStyle"
          class="nw-voice-form__input nw-voice-form__input--area"
          rows="3"
          placeholder="例如：语速平稳，语气克制，句尾轻微上扬"
        />
      </label>

      <div class="nw-voice-form__numbers">
        <label class="nw-voice-form__field">
          <span class="nw-voice-form__label">音高</span>
          <!-- 不设 min：契约示例 -2.0，音高允许负数 -->
          <input v-model="pitch" class="nw-voice-form__input" type="number" step="0.1" />
        </label>

        <label class="nw-voice-form__field">
          <span class="nw-voice-form__label">语速</span>
          <input v-model="rate" class="nw-voice-form__input" type="number" :min="MIN_RATE" step="0.1" />
        </label>
      </div>

      <p class="nw-voice-form__hint">
        这一条配音对全篇生效。音高可为负数（半音偏移）；语速是倍率，必须大于 0。
      </p>
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
        保存配音
      </AppButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.nw-voice-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-sm);
}

.nw-voice-form__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

.nw-voice-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-voice-form__label {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-voice-form__input {
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

.nw-voice-form__input::placeholder {
  color: var(--nw-color-text-disabled);
}

.nw-voice-form__input:focus-visible {
  outline: none;
  border-color: var(--nw-color-focus);
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-voice-form__input--area {
  min-height: 4.5rem;
  line-height: var(--nw-line-height-normal);
  resize: vertical;
}

.nw-voice-form__numbers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--nw-space-sm);
}

.nw-voice-form__hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

@media (max-width: 640px) {
  .nw-voice-form__numbers {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-voice-form__input {
    transition: none;
  }
}
</style>
