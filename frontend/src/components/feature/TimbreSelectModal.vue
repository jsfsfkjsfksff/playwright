<script setup lang="ts">
/**
 * TimbreSelectModal —— 「音色选择」面板
 * ---------------------------------------------------------------
 * 需求：单选一个 TTS 音色。面板按需求挂在**主界面「设置」入口**下
 * （点菜单「设置」就地弹出，不再占用播放页底栏的位置）。
 *
 * 复用 TimbrePicker：
 *   - 单选语义、键盘方向键、无障碍属性都由它承担，这里不重造；
 *   - 选项来源由父级传入（services/studio.ts 的 getVoiceList），
 *     接口就绪后父级换成后端返回的列表即可，本组件不用改。
 *
 * ⚠️ 这是给用户看的产品界面，**不写技术说明**：
 *   用什么接口、数据是不是占位、TTS 怎么合成，都属于实现细节，不在这里交代。
 *   界面上只留三样东西：标题、可选音色、选中项的说明。
 *   （因此 TimbrePicker 的提交提示默认关掉：面板自己说「使用这个音色」就够了。）
 *
 * 确认之后会发生什么：
 *   父级（HomeView）本地记下选中项，并把音色**提交后端**（POST /api/v1/voices），
 *   后端据此调用 TTS 合成；提交失败不影响收听，父级会如实播报一句。
 *   提交动作不在本组件里 —— 组件只负责「选什么」，不负责怎么提交。
 */
import { ref } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import TimbrePicker from '@/components/feature/TimbrePicker.vue'
import type { TimbreId, TimbreOption } from '@/types/studio'

const props = withDefaults(
  defineProps<{
    /** 当前选中的音色标识 */
    value: TimbreId
    /** 可选项（父级从 store 取；为空数组时退回 TimbrePicker 的内置表） */
    options?: readonly TimbreOption[]
    /** 列表加载中（按钮置灰，避免用户以为没反应） */
    loading?: boolean
  }>(),
  { options: () => [], loading: false },
)

const emit = defineEmits<{
  confirm: [value: TimbreId]
  close: []
}>()

/** 草稿值：点「使用这个音色」才提交给父级，取消则什么都不变 */
const draft = ref<TimbreId>(props.value)
</script>

<template>
  <BaseModal title="音色选择" @close="emit('close')">
    <div class="nw-timbre-modal">
      <TimbrePicker
        :value="draft"
        :options="options"
        :disabled="loading"
        :show-submit-note="false"
        @update:value="draft = $event"
      />
    </div>

    <template #footer>
      <div class="nw-timbre-modal__actions">
        <AppButton size="md" variant="secondary" @click="emit('close')">取消</AppButton>
        <AppButton size="md" variant="primary" @click="emit('confirm', draft)">
          使用这个音色
        </AppButton>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
/*
 * 内容只有一行选项 + 一行说明，因此收紧上下留白并整体居中：
 * 弹窗默认的 body 内边距是给多字段表单准备的，直接用会显得空旷。
 */
.nw-timbre-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 36rem;
  margin-inline: auto;
  padding-block: var(--nw-space-2xs) 0;
}

.nw-timbre-modal :deep(.nw-timbre) {
  align-items: center;
  gap: var(--nw-space-xs);
  width: 100%;
}

.nw-timbre-modal :deep(.nw-timbre__group) {
  justify-content: center;
}

/* 选中项说明：居中、限宽，长句换行也不顶到弹窗边缘 */
.nw-timbre-modal :deep(.nw-timbre__hint) {
  align-items: center;
  max-width: 28rem;
  text-align: center;
}

/* 底部按钮居中（BaseModal 的 footer 默认右对齐，这里把它变成一条居中的按钮行） */
.nw-timbre-modal__actions {
  display: flex;
  justify-content: center;
  gap: var(--nw-space-xs);
  width: 100%;
}
</style>
