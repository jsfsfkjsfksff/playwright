<script setup lang="ts">
/**
 * StoryNodeCard —— 画布上的一个剧情节点（Vue Flow 自定义节点）
 * ---------------------------------------------------------------
 * 职责：只负责「长什么样」+ 把点击 / 双击抛给画布，不直接改数据。
 *   - 单击：选中（画布据此做「点选连线」的第一端）；
 *   - 双击：请求编辑（画布转成事件交给页面，页面切到列表视图并定位到该卡片）。
 *
 * 视觉：复用站内玻璃语言（半透明底 + 1px 描边 + 内高光），
 * 选中态换成强调色描边 + 外发光；颜色全部取 --nw-* 令牌。
 *
 * 尺寸约束：宽度固定（220px），高度由内容决定但限制台词行数 ——
 * 节点尺寸稳定，贝塞尔连线的端点才不会跳动。
 *
 * ⚠️ 原「说话人」一行已按需求移除（需求 2：彻底移除说话人概念），
 *    改为显示场景 id（需求 1）—— 画布上认节点靠 id，标题就是提交给后端的 sceneId。
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  /** 节点 id（= sceneId，同时就是画布上显示的标题） */
  sceneId: string
  /** 台词（会自动截断显示） */
  text: string
  /** 是否已有音频地址 */
  hasAudio: boolean
  /** 时间阶段 */
  timeStage: number
  /** 是否被选中（连线第一端） */
  selected: boolean
}>()

const emit = defineEmits<{
  (event: 'select', sceneId: string): void
  (event: 'edit', sceneId: string): void
}>()

const excerpt = computed(() => {
  const compact = props.text.replace(/\s+/g, ' ').trim()
  return compact === '' ? '（还没有台词）' : compact
})

/** 标题就是 sceneId —— 所见即所传 */
const title = computed(() => props.sceneId)
</script>

<template>
  <div
    class="nw-story-node"
    :class="{ 'nw-story-node--selected': selected, 'nw-story-node--empty': text.trim() === '' }"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="`剧情节点 ${title}${selected ? '，已选中' : ''}`"
    @click.stop="emit('select', sceneId)"
    @dblclick.stop="emit('edit', sceneId)"
    @keydown.enter.stop="emit('select', sceneId)"
    @keydown.space.stop.prevent="emit('select', sceneId)"
  >
    <!-- 左侧入口（目标端） -->
    <Handle type="target" :position="Position.Left" class="nw-story-node__handle" />

    <!--
      头部只放「场景 id + 阶段」：标题就是 sceneId，画布上看到的
      和提交给后端的完全一致。
    -->
    <header class="nw-story-node__head">
      <p class="nw-story-node__title">
        {{ title }}
      </p>
      <span class="nw-story-node__stage">阶段 {{ timeStage }}</span>
    </header>

    <p class="nw-story-node__text">{{ excerpt }}</p>

    <footer class="nw-story-node__foot">
      <span class="nw-story-node__audio" :class="{ 'nw-story-node__audio--on': hasAudio }">
        {{ hasAudio ? '有音频' : '无音频' }}
      </span>
      <span class="nw-story-node__tip">双击编辑</span>
    </footer>

    <!-- 右侧出口（起点端）：可以拖拽拉线，也可以点选两个节点自动连 -->
    <Handle type="source" :position="Position.Right" class="nw-story-node__handle" />
  </div>
</template>

<style scoped>
.nw-story-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 260px;
  padding: 10px 12px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-glass-fill-strong);
  color: var(--nw-color-text-primary);
  text-align: left;
  cursor: pointer;
  /* 毛玻璃与站内其它玻璃面板一致；不支持时 GlassPanel 的兜底思路同样适用 */
  backdrop-filter: blur(var(--nw-blur-sm)) saturate(112%);
  -webkit-backdrop-filter: blur(var(--nw-blur-sm)) saturate(112%);
  box-shadow:
    var(--nw-shadow-inset-top),
    var(--nw-shadow-md);
  transition:
    border-color var(--nw-duration-fast) var(--nw-ease-out),
    box-shadow var(--nw-duration-fast) var(--nw-ease-out),
    transform var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-story-node:hover {
  border-color: var(--nw-color-border-strong);
}

.nw-story-node:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 3px;
}

/* 选中态：强调色描边 + 外发光，告诉用户"这是连线的第一端" */
.nw-story-node--selected {
  border-color: var(--nw-color-accent-contrast);
  box-shadow:
    var(--nw-shadow-inset-top),
    var(--nw-glow-accent),
    0 0 0 1px var(--nw-color-accent-strong);
  transform: translateY(-1px);
}

/* 空台词：只把边框改成虚线，不用告警色 —— 新建节点本来就是空的，不是错误 */
.nw-story-node--empty {
  border-style: dashed;
  border-color: var(--nw-color-border-strong);
}

.nw-story-node__head {
  display: flex;
  align-items: baseline;
  gap: var(--nw-space-2xs);
}

.nw-story-node__stage {
  flex: 0 0 auto;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
}

.nw-story-node__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nw-story-node__text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
  /* 长台词：最多三行，超出省略；不撑破节点宽度 */
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.nw-story-node__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-2xs);
  margin-top: 2px;
}

.nw-story-node__audio {
  padding: 1px 8px;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
}

.nw-story-node__audio--on {
  border-color: var(--nw-color-accent-strong);
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
}

.nw-story-node__tip {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
  opacity: 0;
  transition: opacity var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-story-node:hover .nw-story-node__tip {
  opacity: 1;
}

/* 连接点：默认很小，悬停节点时放大，避免画布看起来很吵 */
.nw-story-node__handle {
  width: 8px;
  height: 8px;
  border: var(--nw-border-width-strong) solid var(--nw-color-accent-strong);
  background-color: var(--nw-color-page-bg);
  transition:
    transform var(--nw-duration-fast) var(--nw-ease-out),
    background-color var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-story-node:hover .nw-story-node__handle {
  background-color: var(--nw-color-accent-strong);
  transform: scale(1.25);
}

@media (prefers-reduced-motion: reduce) {
  .nw-story-node,
  .nw-story-node__handle,
  .nw-story-node__tip {
    transition: none;
  }

  .nw-story-node--selected {
    transform: none;
  }
}
</style>
