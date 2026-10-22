<script setup lang="ts">
/**
 * TimbrePicker —— TTS 音色选择器（一排单选按钮）
 * ---------------------------------------------------------------
 * 需求：新增「音色选择」，UI 提供一排选项按钮（如男声-磁性、女声-温柔、童声），
 * **用户只能单选**；选中的标识提交给后端用于调用 TTS。
 * 当前唯一的宿主是 TimbreSelectModal（挂在主界面「设置」入口下）。
 *
 * 实现取舍：用 Naive UI 的 `n-radio-group` + `n-radio-button`，而不是手写一排 button。
 *   理由与「尽量不 SVG 手绘」同源：单选组的无障碍语义（role=radiogroup、
 *   方向键在选项间移动、roving tabindex、aria-checked）由库保证，
 *   手写很容易漏掉键盘导航 —— 而这类控件正是「看起来能用、键盘用不了」的重灾区。
 *   Naive 的样式已被 styles/naive-overrides.css 拉回站内令牌，视觉仍是胶囊按钮。
 *
 * 为什么不用下拉框：音色只有 5 项且互斥，全部铺开比藏进下拉更好选，
 *   也让「当前选了哪个」一眼可见。
 */
import { NRadioButton, NRadioGroup } from 'naive-ui'

import { TIMBRE_OPTIONS, resolveTimbreOption } from '@/types/studio'
import type { TimbreId, TimbreOption } from '@/types/studio'

const props = withDefaults(
  defineProps<{
    /** 当前选中的音色标识 */
    value: TimbreId
    /** 是否禁用（保存中） */
    disabled?: boolean
    /**
     * 可选项来源。
     * 默认用内置音色表；TimbreSelectModal 会传 services 层（getVoiceList）返回的列表，
     * 后端接入后音色以接口为准，这里不需要改组件。
     */
    options?: readonly TimbreOption[]
    /**
     * 是否显示「选中的音色标识会提交给后端」这句说明。
     * TimbreSelectModal 由自己的按钮文案表达「使用这个音色」，因此传 false；
     * 将来若有别处直接内嵌本控件，可以打开它把提交语义说清楚。
     */
    showSubmitNote?: boolean
  }>(),
  { disabled: false, options: () => TIMBRE_OPTIONS, showSubmitNote: true },
)

const emit = defineEmits<{
  'update:value': [value: TimbreId]
}>()

/**
 * Naive 的单选组事件给出 `string | number | null`，这里收敛成 TimbreId。
 *
 * 为什么要校验而不是直接断言：`n-radio-group` 的取值类型在关闭选项内容时
 * 是宽泛的，若直接 `as TimbreId` 就把「库改了行为」这类问题藏起来了。
 * 校验失败时保持原值不动（宁可不响应，也不要往契约字段里塞非法标识）。
 */
function handleChange(next: string | number | null): void {
  if (typeof next !== 'string') {
    return
  }

  const matched = props.options.find((option) => option.id === next)
  if (matched === undefined) {
    return
  }

  if (matched.id !== props.value) {
    emit('update:value', matched.id)
  }
}

/** 当前选项的说明文案，显示在按钮组下方，让用户知道选的是什么 */
function describe(id: TimbreId): string {
  return (props.options.find((option) => option.id === id) ?? resolveTimbreOption(id)).description
}
</script>

<template>
  <div class="nw-timbre">
    <NRadioGroup
      class="nw-timbre__group"
      :value="value"
      :disabled="disabled"
      name="timbre"
      @update:value="handleChange"
    >
      <NRadioButton v-for="option in options" :key="option.id" :value="option.id">
        {{ option.label }}
      </NRadioButton>
    </NRadioGroup>

    <p class="nw-timbre__hint">
      {{ describe(value) }}
      <span v-if="showSubmitNote" class="nw-timbre__hint-note">
        选中的音色标识会提交给后端，用于调用 TTS 合成旁白。
      </span>
    </p>
  </div>
</template>

<style scoped>
.nw-timbre {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

/*
 * 一排按钮：允许换行（窄屏放不下 5 个），但不横向滚动 ——
 * 横向滚动会让最后几个音色「藏起来」，用户以为只有三种。
 */
.nw-timbre__group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
}

.nw-timbre__hint {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-timbre__hint-note {
  color: var(--nw-color-text-disabled);
  font-size: var(--nw-font-size-xs);
}
</style>
