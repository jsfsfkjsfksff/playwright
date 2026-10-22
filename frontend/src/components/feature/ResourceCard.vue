<script setup lang="ts">
/**
 * ResourceCard —— 单个资源节点卡片（角色 / 规则 / 实体）
 * ---------------------------------------------------------------
 * 职责：只负责呈现，并把「编辑 / 删除」两种意图抛给页面。
 * 卡片自己不调用 store、不发请求 —— 这样它可以在任何地方复用，
 * 数据流向也始终是单向的：卡片抛事件 → 页面调 store。
 *
 * 本卡片不提供「配音」入口：音色选择已统一收在播放页（底栏「音色」按钮），
 * 因此资源卡片上既没有配音按钮、也不显示配音状态 —— 没有入口的状态行只是残留提示。
 *
 * 删除是破坏性操作，这里做成两步确认（先变成「确认删除」，再点一次才真正删除），
 * 避免误触直接删掉一个资源。
 */
import { computed, ref } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import type { PropertyResponse } from '@/types/studio'
import {
  formatAttributeValue,
  propertyStatusLabel,
  propertyTypeLabel,
} from '@/utils/studioVocabulary'

const props = defineProps<{
  resource: PropertyResponse
}>()

const emit = defineEmits<{
  edit: [resource: PropertyResponse]
  remove: [resource: PropertyResponse]
}>()

const typeLabel = computed(() => propertyTypeLabel(props.resource.type))

/**
 * 状态标签：视图模型里 status 为 null 表示「列表接口未返回状态」，
 * 此时整块不渲染（渲染空串会在头部留下一段看不懂的空白）。
 */
const statusLabel = computed(() =>
  props.resource.status === null ? null : propertyStatusLabel(props.resource.status),
)

/** 属性表是否已知：null = 后端没给；{} = 后端给了，确实是空的 */
const attributesKnown = computed(() => props.resource.attributes !== null)

/** 属性表转成数组便于 v-for；取值一律经过格式化，不会渲染成空白 */
const attributeEntries = computed(() =>
  Object.entries(props.resource.attributes ?? {}).map(([key, value]) => ({
    key,
    text: formatAttributeValue(value),
  })),
)

/** 描述是否已知：null = 后端没给；'' = 后端给了，确实是空的 */
const descriptionKnown = computed(() => props.resource.description !== null)
const descriptionText = computed(() => props.resource.description ?? '')

/** 删除的两步确认 */
const confirmingRemove = ref(false)

function handleRemoveClick(): void {
  if (!confirmingRemove.value) {
    confirmingRemove.value = true
    return
  }

  confirmingRemove.value = false
  emit('remove', props.resource)
}

function cancelRemove(): void {
  confirmingRemove.value = false
}
</script>

<template>
  <GlassPanel class="nw-resource-card">
    <header class="nw-resource-card__head">
      <span class="nw-resource-card__type">{{ typeLabel }}</span>
      <h3 class="nw-resource-card__name">{{ resource.name }}</h3>
      <span v-if="statusLabel !== null" class="nw-resource-card__status">{{ statusLabel }}</span>
    </header>

    <!--
      描述与属性区分「后端没给」（列表接口不回传详情）与「内容为空」两种情况，
      不把前者说成「暂无」—— 那是把「不知道」当成「没有」。
    -->
    <p v-if="descriptionKnown" class="nw-resource-card__desc">
      {{ descriptionText || '暂无描述' }}
    </p>
    <p v-else class="nw-resource-card__desc nw-resource-card__desc--unknown">
      列表接口未返回描述
    </p>

    <dl v-if="attributeEntries.length > 0" class="nw-resource-card__attrs">
      <template v-for="entry in attributeEntries" :key="entry.key">
        <dt class="nw-resource-card__attr-key">{{ entry.key }}</dt>
        <dd class="nw-resource-card__attr-value">{{ entry.text }}</dd>
      </template>
    </dl>
    <p v-else-if="!attributesKnown" class="nw-resource-card__attrs-empty">
      列表接口未返回属性
    </p>
    <p v-else class="nw-resource-card__attrs-empty">暂无属性</p>

    <footer class="nw-resource-card__actions">
      <AppButton size="md" variant="secondary" @click="emit('edit', resource)">编辑</AppButton>

      <template v-if="confirmingRemove">
        <AppButton size="md" variant="ghost" @click="handleRemoveClick">确认删除</AppButton>
        <AppButton size="md" variant="ghost" @click="cancelRemove">取消</AppButton>
      </template>
      <AppButton v-else size="md" variant="ghost" @click="handleRemoveClick">删除</AppButton>
    </footer>
  </GlassPanel>
</template>

<style scoped>
.nw-resource-card {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  height: 100%;
  padding: clamp(0.875rem, 1.8vw, 1.125rem);
}

/* ---------- 头部 ---------- */
.nw-resource-card__head {
  display: flex;
  align-items: baseline;
  gap: var(--nw-space-2xs);
  min-width: 0;
}

.nw-resource-card__type {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-resource-card__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nw-resource-card__status {
  flex: 0 0 auto;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

/* ---------- 描述与属性 ---------- */
.nw-resource-card__desc {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
  overflow-wrap: anywhere;
}

/* 「后端没给这个字段」用更弱的颜色，与「后端说没有」在视觉上区分开 */
.nw-resource-card__desc--unknown {
  color: var(--nw-color-text-tertiary);
}

.nw-resource-card__attrs {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px var(--nw-space-xs);
  padding-top: var(--nw-space-2xs);
  border-top: var(--nw-border-width) solid var(--nw-color-border-subtle);
  font-size: var(--nw-font-size-sm);
}

.nw-resource-card__attr-key {
  color: var(--nw-color-text-tertiary);
  overflow-wrap: anywhere;
}

.nw-resource-card__attr-value {
  margin: 0;
  color: var(--nw-color-text-primary);
  overflow-wrap: anywhere;
}

.nw-resource-card__attrs-empty {
  padding-top: var(--nw-space-2xs);
  border-top: var(--nw-border-width) solid var(--nw-color-border-subtle);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

/* ---------- 操作 ---------- */
.nw-resource-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--nw-space-2xs);
  margin-top: auto;
  padding-top: var(--nw-space-xs);
}

/*
 * 卡片内的按钮用紧凑内边距：AppButton 的默认左右内边距是 2.5rem，
 * 在卡片这种窄容器里会把按钮挤到换行。这里只收内边距，
 * 高度、字号、配色等仍由 AppButton 决定。
 */
.nw-resource-card__actions :deep(.nw-app-button) {
  padding-inline: var(--nw-space-sm);
}
</style>
