<script setup lang="ts">
/**
 * BranchChooserModal —— 世界线分支选择弹窗
 * ---------------------------------------------------------------
 * 需求 3：「在播放/阅读流程中，如果遇到有多个连线指向的节点，提供选择分支的 UI
 * （例如弹出选项卡片）」。
 *
 * 【为什么是「弹出」而不是页内列表】
 *   播放页原本就在右列内联渲染 edges（nw-player__edges）。本轮按需求改成弹窗，
 *   理由不只是「需求这么说」，还有实际的交互问题：
 *     · 内联卡在右列时，纯聆听模式下会被「3 秒后隐藏控件」一起收掉，
 *       听众可能根本没看见选项就卡住了（旧代码靠 chromeVisible 特判绕开，很脆）；
 *     · 弹窗有焦点陷阱与遮罩，选完之前不会误触其它控件 ——
 *       这正是「不能跳过的一步选择」该有的语义。
 *
 * 【界面按需求精简到只剩动作按钮】
 *   标题、条件标签、台词预览、目标 sceneId、底部说明全部去掉：
 *   弹窗里只保留每个选项的**动作名**（nw-branch__option-action）。
 *   台词与音频听众马上就会听到，不需要在选项里再预览一遍。
 *
 * 【为什么不用 n-modal 的 preset dialog】
 *   分支选项是**内容**（可挂载任意内容的按钮列表），不是一句确认文案；
 *   preset="card" 给的是可挂载任意内容的卡片壳，更合适。
 *
 * 无障碍：n-modal 自带 role=dialog / aria-modal / 焦点陷阱 / Esc 关闭，
 *   每个选项是真实的 <button>，键盘可直接 Tab + Enter 选择。
 */
import { computed } from 'vue'
import { NButton, NModal } from 'naive-ui'

import NaiveModalShell from '@/components/base/NaiveModalShell.vue'
import type { PlayEdge } from '@/types/studio'

const props = defineProps<{
  /** 是否显示 */
  show: boolean
  /** 可选的连线（契约字段名是 edges） */
  edges: readonly PlayEdge[]
  /** 当前场景 id（用于无语境时的兜底标题） */
  sceneId: string
  /** 当前场景是否已播完（决定标题文案） */
  finished?: boolean
}>()

const emit = defineEmits<{
  choose: [edge: PlayEdge]
  close: []
}>()

const title = computed(() => (props.finished === true ? '这一段说完了，接下来往哪走？' : '选择接下来的走向'))
</script>

<template>
  <!--
    与 SaveLoadModal 同理：n-modal Teleport 到 body，必须自带主题 provider，
    否则退回 Naive 默认浅色主题。见 components/base/NaiveModalShell.vue。
  -->
  <NaiveModalShell>
    <NModal
      :show="show"
      preset="card"
      :title="title"
      :bordered="false"
      :closable="false"
      :mask-closable="false"
      :style="{ width: 'min(92vw, 34rem)' }"
    >
      <ul class="nw-branch__list">
        <li v-for="(edge, index) in edges" :key="`${index}-${edge.targetScene.sceneId}`">
          <button type="button" class="nw-branch__option" @click="emit('choose', edge)">
            <span class="nw-branch__option-action">{{ edge.action || '继续' }}</span>
          </button>
        </li>
      </ul>

      <!--
        ⚠️ 插槽名必须是 action，不能写 footer：
        preset="card" 渲染的其实是 n-card，而 n-card 的底部插槽叫 `action`
        （见 naive-ui/es/card/src/Card.mjs），没有 `footer` 插槽 ——
        写 `#footer` 不会报错，只是内容被静默丢弃（按钮整个消失）。
      -->
      <template #action>
        <div class="nw-branch__footer">
          <NButton quaternary @click="emit('close')">稍后再说</NButton>
        </div>
      </template>
    </NModal>
  </NaiveModalShell>
</template>

<style scoped>
.nw-branch__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 选项：玻璃底 + 左侧强调条，与站内面板同源 */
.nw-branch__option {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--nw-space-xs) var(--nw-space-sm);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-left: 2px solid var(--nw-color-accent);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  text-align: center;
  cursor: pointer;
  transition: var(--nw-transition-interactive);
}

.nw-branch__option:hover,
.nw-branch__option:focus-visible {
  border-color: var(--nw-color-focus);
  background-color: var(--nw-color-button-fill-secondary-hover);
  transform: translateY(-2px);
}

.nw-branch__option:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

.nw-branch__option-action {
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-medium);
  overflow-wrap: anywhere;
}

.nw-branch__footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .nw-branch__option {
    transition: none;
  }

  .nw-branch__option:hover,
  .nw-branch__option:focus-visible {
    transform: none;
  }
}
</style>
