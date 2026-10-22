<script setup lang="ts">
/**
 * TimelineStage —— 一个时间阶段（相同 timeStage 的锚点并排容器）
 * ---------------------------------------------------------------
 * 契约要求（接口文档 3.1）：相同 timeStage 在时间线上**绝对并列**，
 * 因此它们必须横向并排渲染；不同 timeStage 由页面按数值升序从上到下排列，
 * 本组件只负责其中一行。
 *
 * 拖拽落点：卡片被拖到本阶段即把它的 timeStage 改成该阶段的数值
 * （阶段内顺序无意义 —— 并列意味着没有先后，所以不做组内排序）。
 * 键盘用户不必拖拽：卡片上的「时间阶段」数字框等价且更精确。
 */
import { ref, watch } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AnchorCard from '@/components/feature/AnchorCard.vue'
import type { SceneAnchor, SceneAnchorPatch } from '@/types/studio'

const props = defineProps<{
  /** 本阶段的 timeStage 数值 */
  timeStage: number
  /** 属于本阶段的锚点（并列） */
  anchors: readonly SceneAnchor[]
  /** 当前正在被拖拽的锚点 id；为 null 表示没有拖拽在进行 */
  draggingSceneId: string | null
}>()

const emit = defineEmits<{
  updateAnchor: [sceneId: string, patch: SceneAnchorPatch]
  removeAnchor: [sceneId: string]
  /** 在本阶段新增一个锚点 */
  addAnchor: [timeStage: number]
  /** 有卡片被放到本阶段：把它的 timeStage 改成本阶段的数值 */
  dropAnchor: [sceneId: string, timeStage: number]
  dragStart: [sceneId: string]
  dragEnd: []
}>()

/** 落点高亮：拖拽经过本阶段时整行亮起 */
const dropActive = ref(false)

function handleDragOver(event: DragEvent): void {
  // 不 preventDefault 就不允许 drop
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dropActive.value = true
}

/**
 * dragleave 在移动到子元素上时也会触发，直接清掉会让高亮闪烁：
 * 只有当指针真的离开了本阶段（relatedTarget 不在内部）才取消。
 */
function handleDragLeave(event: DragEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) {
    return
  }
  dropActive.value = false
}

function handleDrop(event: DragEvent): void {
  event.preventDefault()
  dropActive.value = false

  const sceneId = event.dataTransfer?.getData('text/plain') ?? ''
  if (sceneId !== '') {
    emit('dropAnchor', sceneId, props.timeStage)
  }
}

// 拖拽结束（松手在任意位置，包括没有落在任何阶段上）时收掉高亮
watch(
  () => props.draggingSceneId,
  (value) => {
    if (value === null) {
      dropActive.value = false
    }
  },
)
</script>

<template>
  <section
    class="nw-timeline-stage"
    :class="{ 'nw-timeline-stage--drop': dropActive }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <header class="nw-timeline-stage__head">
      <span class="nw-timeline-stage__label">阶段 {{ timeStage }}</span>
      <span class="nw-timeline-stage__count">{{ anchors.length }} 个并列锚点</span>
      <AppButton size="md" variant="ghost" @click="emit('addAnchor', timeStage)">
        在此阶段添加
      </AppButton>
    </header>

    <ul class="nw-timeline-stage__cards">
      <li v-for="anchor in anchors" :key="anchor.sceneId" class="nw-timeline-stage__slot">
        <AnchorCard
          :anchor="anchor"
          :dragging="draggingSceneId === anchor.sceneId"
          @update="(patch) => emit('updateAnchor', anchor.sceneId, patch)"
          @remove="emit('removeAnchor', anchor.sceneId)"
          @drag-start="emit('dragStart', $event)"
          @drag-end="emit('dragEnd')"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.nw-timeline-stage {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: var(--nw-space-xs);
  border: var(--nw-border-width) dashed var(--nw-color-border-subtle);
  border-radius: var(--nw-radius-md);
  transition: var(--nw-transition-colors);
}

/* 拖拽经过：整行亮起，明确「松手就放到这个阶段」 */
.nw-timeline-stage--drop {
  border-color: var(--nw-color-accent);
  background-color: var(--nw-color-accent-hover);
}

.nw-timeline-stage__head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-xs);
  min-width: 0;
}

.nw-timeline-stage__label {
  flex: 0 0 auto;
  padding: 2px 10px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-timeline-stage__count {
  flex: 1;
  min-width: 0;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

/*
 * 并列锚点横向排布：一行放不下就换行（换行仍是同一阶段，语义不变），
 * 因此用 flex-wrap 而不是横向滚动。
 */
.nw-timeline-stage__cards {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nw-timeline-stage__slot {
  flex: 1 1 17rem;
  max-width: 26rem;
  min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .nw-timeline-stage {
    transition: none;
  }
}
</style>
