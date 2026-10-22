<script setup lang="ts">
/**
 * StoryCanvas —— 剧情画布（散点式编排 / 点选连线）
 * ---------------------------------------------------------------
 * 需求：在剧情编排界面提供「点选绘制」——依次点击两张卡片即建立一条联系，
 * 用带霓虹发光的贝塞尔曲线呈现；卡片可拖动，连线实时跟随；提交时输出扁平双 List。
 *
 * 实现选择（重要）：
 *   连线与拖拽**不自己手写 SVG 数学**，而是用 @vue-flow/core：
 *     · 节点位置由库托管，拖拽时库自己重算端点，不需要监听 scroll / resize / rAF；
 *     · 贝塞尔路径用库的 `getBezierPath`（默认就是三次贝塞尔）；
 *     · 缩放 / 平移用库的 d3-zoom，滚轮与触控板行为与常见画布工具一致。
 *   我们只负责三件事：节点长什么样（自定义节点）、连线长什么样（自定义边）、
 *   以及把「拖拽结束 / 建立连线」的意图回传给页面。
 *
 * 坐标的真实来源仍是数据（SceneAnchor.x / y）：
 *   拖拽结束 → emit('move', id, x, y) → store 写回 → 提交时就是节点的 x / y。
 *
 * 交互约定：
 *   · 单击节点 = 选中（连线第一端）；再点另一个节点 = 建立连线；再点自己 = 取消选中；
 *   · 也可以直接从节点右侧圆点拖到另一个节点（库自带的 handle 连线）；
 *   · 点击连线 = 删除它（跳确认由调用方的 Toast 承担，这里不做二次确认弹窗）；
 *   · 双击节点 = 请求编辑（页面切到列表视图并定位到该卡片）。
 */
import { computed, ref } from 'vue'
import { MarkerType, VueFlow, useVueFlow, type Connection, type Edge, type Node } from '@vue-flow/core'
// 库必须的基础样式（不引入 theme-default，避免它把画布刷成浅色）
import '@vue-flow/core/dist/style.css'

import type { SceneAnchor, StoryEdge } from '@/types/studio'

import StoryEdgePath from './StoryEdgePath.vue'
import StoryNodeCard from './StoryNodeCard.vue'

const props = defineProps<{
  /** 剧情节点（坐标可能尚未落位，页面进入画布前会先调用 ensureAnchorPositions） */
  anchors: SceneAnchor[]
  /** 连线（扁平 id 引用） */
  edges: StoryEdge[]
  /** 当前选中的节点 id（连线第一端） */
  selectedId: string | null
}>()

const emit = defineEmits<{
  (event: 'select', sceneId: string | null): void
  (event: 'edit', sceneId: string): void
  (event: 'connect', sourceId: string, targetId: string): void
  (event: 'move', sceneId: string, x: number, y: number): void
  (event: 'remove-edge', edgeId: string): void
}>()

/** 显式 id：这样 useVueFlow() 与 <VueFlow> 一定指向同一个实例（上下文中可能有多个画布） */
const FLOW_ID = 'nw-story-canvas'

const { zoomIn, zoomOut, fitView, onNodesInitialized } = useVueFlow({ id: FLOW_ID })

/** 当前缩放级别（只用于工具栏显示） */
const zoom = ref(1)

/*
 * 首屏自适应**不能放大**。
 * 库的 fit-view-on-init 会为了"填满画布"而把两个节点的图放大约 1.8 倍，
 * 卡片会大得像放大镜、字号也失真。这里改为节点测量完成后手动 fitView，
 * 并把 maxZoom 压到 1：只缩小、不放大。
 */
onNodesInitialized(() => {
  void fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.7 })
})

/* =============================================================
 * 数据 → Vue Flow 的模型
 * -------------------------------------------------------------
 * 每次 props 变化都会重算；因为坐标的唯一来源是 anchors.x / y，
 * 拖拽写回 store 后重算出来的位置与拖拽结果一致，不会「弹回去」。
 * ============================================================= */

const flowNodes = computed<Node[]>(() =>
  props.anchors.map((anchor) => ({
    id: anchor.sceneId,
    type: 'story',
    position: { x: anchor.x ?? 0, y: anchor.y ?? 0 },
    data: {
      sceneId: anchor.sceneId,
      text: anchor.text,
      hasAudio: anchor.audioURL !== '',
      timeStage: anchor.timeStage,
      selected: anchor.sceneId === props.selectedId,
    },
  })),
)

const flowEdges = computed<Edge[]>(() =>
  props.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: 'story',
    // markerEnd 交给自定义边自己画（这里保留字段，方便将来切换成库的箭头）
    markerEnd: MarkerType.ArrowClosed,
    animated: false,
  })),
)

/* =============================================================
 * 交互
 * ============================================================= */

/** 点选连线：第一次点选中，第二次点连上并清空选中 */
function handleNodeSelect(sceneId: string): void {
  if (props.selectedId === null) {
    emit('select', sceneId)
    return
  }

  if (props.selectedId === sceneId) {
    emit('select', null)
    return
  }

  emit('connect', props.selectedId, sceneId)
  emit('select', null)
}

/** 拖拽结束：把库里的坐标回传（这是提交给后端的 x / y 的唯一来源） */
function handleNodeDragStop(payload: { node: Node }): void {
  const { node } = payload
  emit('move', node.id, node.position.x, node.position.y)
}

/** 从 handle 拖拽连线（库自带） */
function handleConnect(connection: Connection): void {
  if (connection.source === '' || connection.target === '') {
    return
  }
  emit('connect', connection.source, connection.target)
}

function handleEdgeRemove(edgeId: string): void {
  emit('remove-edge', edgeId)
}

function handleZoomIn(): void {
  void zoomIn({ duration: 160 })
  zoom.value = Math.min(1.8, zoom.value + 0.2)
}

function handleZoomOut(): void {
  void zoomOut({ duration: 160 })
  zoom.value = Math.max(0.35, zoom.value - 0.2)
}

function handleFit(): void {
  void fitView({ padding: 0.16, duration: 220, maxZoom: 1, minZoom: 0.7 })
  zoom.value = 1
}
</script>

<template>
  <div class="nw-story-canvas">
    <!-- 工具栏：缩放 / 适配 + 用法提示 -->
    <div class="nw-story-canvas__bar">
      <p class="nw-story-canvas__hint">
        {{ selectedId === null ? '点选一张卡片作为起点，再点另一张即可连线' : `已选中 ${selectedId}，点另一张卡片完成连线` }}
      </p>

      <div class="nw-story-canvas__zooms">
        <button type="button" class="nw-story-canvas__zoom" aria-label="放大" @click="handleZoomIn">＋</button>
        <button type="button" class="nw-story-canvas__zoom" aria-label="缩小" @click="handleZoomOut">－</button>
        <button type="button" class="nw-story-canvas__zoom nw-story-canvas__zoom--wide" @click="handleFit">
          适配视图
        </button>
      </div>
    </div>

    <div class="nw-story-canvas__stage">
      <!--
        箭头标记要定义在 SVG 里才能被 url(#id) 引用。
        尺寸 0，只是为了把 <defs> 挂进文档，不占布局。
      -->
      <svg class="nw-story-canvas__defs" aria-hidden="true" focusable="false">
        <defs>
          <marker
            id="nw-story-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" style="fill: var(--nw-color-accent-strong)" />
          </marker>
        </defs>
      </svg>

      <VueFlow
        :id="FLOW_ID"
        :nodes="flowNodes"
        :edges="flowEdges"
        :min-zoom="0.35"
        :max-zoom="1.8"
        :fit-view-on-init="false"
        :zoom-on-double-click="false"
        :delete-key-code="null"
        :nodes-connectable="true"
        :elevate-edges-on-select="true"
        @node-drag-stop="handleNodeDragStop"
        @connect="handleConnect"
        @viewport-change="(payload) => (zoom = payload.zoom)"
      >
        <!-- 自定义节点：把画布事件转成业务事件 -->
        <template #node-story="nodeProps">
          <StoryNodeCard
            :scene-id="nodeProps.data.sceneId"
            :text="nodeProps.data.text"
            :has-audio="nodeProps.data.hasAudio"
            :time-stage="nodeProps.data.timeStage"
            :selected="nodeProps.data.selected"
            @select="handleNodeSelect"
            @edit="emit('edit', $event)"
          />
        </template>

        <!-- 自定义边：霓虹发光贝塞尔；点击删除 -->
        <template #edge-story="edgeProps">
          <StoryEdgePath
            :id="edgeProps.id"
            :source-x="edgeProps.sourceX"
            :source-y="edgeProps.sourceY"
            :target-x="edgeProps.targetX"
            :target-y="edgeProps.targetY"
            :source-position="edgeProps.sourcePosition"
            :target-position="edgeProps.targetPosition"
            :selected="edgeProps.selected === true"
            @remove="handleEdgeRemove"
          />
        </template>
      </VueFlow>

      <!-- 空态：还没有卡片时给出明确的下一步，而不是一张空画布 -->
      <div v-if="anchors.length === 0" class="nw-story-canvas__empty">
        <p class="nw-story-canvas__empty-title">画布还是空的</p>
        <p class="nw-story-canvas__empty-text">
          先在「列表」视图里添加剧情锚点，回到画布就能看到卡片并开始连线。
        </p>
        <slot name="empty-action" />
      </div>
    </div>

    <p class="nw-story-canvas__legend">
      拖动卡片调整位置 · 点卡片两次完成连线 · 点连线删除 · 双击卡片去编辑 ·
      当前缩放 {{ Math.round(zoom * 100) }}%
    </p>
  </div>
</template>

<style scoped>
.nw-story-canvas {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  width: 100%;
}

/* ---------- 工具栏 ---------- */
.nw-story-canvas__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-xs);
}

.nw-story-canvas__hint {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-story-canvas__zooms {
  display: flex;
  gap: var(--nw-space-2xs);
}

.nw-story-canvas__zoom {
  min-width: 2.25rem;
  height: 2.25rem;
  padding: 0 var(--nw-space-2xs);
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-glass-fill);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  cursor: pointer;
  transition:
    border-color var(--nw-duration-fast) var(--nw-ease-out),
    color var(--nw-duration-fast) var(--nw-ease-out);
}

.nw-story-canvas__zoom:hover {
  border-color: var(--nw-color-border-strong);
  color: var(--nw-color-text-primary);
}

.nw-story-canvas__zoom:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

.nw-story-canvas__zoom--wide {
  padding-inline: var(--nw-space-sm);
}

/* ---------- 画布 ---------- */
.nw-story-canvas__stage {
  position: relative;
  width: 100%;
  height: clamp(26rem, 56vh, 40rem);
  overflow: hidden;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-page-bg);
  box-shadow: var(--nw-shadow-inset-top);
}

/* 只承载 <defs> 的 svg：不占位、不可见 */
.nw-story-canvas__defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/*
 * 网格底：两层 radial-gradient 做点阵（比位图网格清晰，且随缩放不变形）。
 * 颜色取令牌，不写死。
 */
.nw-story-canvas__stage :deep(.vue-flow) {
  width: 100%;
  height: 100%;
  background-color: transparent;
}

.nw-story-canvas__stage :deep(.vue-flow__pane) {
  background-image: radial-gradient(
    circle at 1px 1px,
    var(--nw-color-border) 1px,
    transparent 0
  );
  background-size: 24px 24px;
}

/* 连线与节点的选中样式由各自组件负责，这里只清掉库的默认描边 */
.nw-story-canvas__stage :deep(.vue-flow__edge-path) {
  stroke: none;
}

.nw-story-canvas__stage :deep(.vue-flow__node) {
  cursor: grab;
}

.nw-story-canvas__stage :deep(.vue-flow__node.dragging) {
  cursor: grabbing;
}

/* ---------- 空态 ---------- */
.nw-story-canvas__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--nw-space-2xs);
  padding: var(--nw-space-md);
  text-align: center;
  pointer-events: none;
}

.nw-story-canvas__empty-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-story-canvas__empty-text {
  max-width: 28rem;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

/* ---------- 图例 ---------- */
.nw-story-canvas__legend {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-xs);
  letter-spacing: var(--nw-letter-spacing-wide);
}

@media (max-width: 720px) {
  .nw-story-canvas__stage {
    height: clamp(22rem, 50vh, 32rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-story-canvas__zoom {
    transition: none;
  }
}
</style>
