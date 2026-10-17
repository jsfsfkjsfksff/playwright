<script setup lang="ts">
/**
 * FeaturePanel —— 异形功能入口面板（功能选择页左右入口的通用底型）
 * ---------------------------------------------------------------
 * 轮廓来自布局示意图：**一条竖直长边 + 一条竖直短边 + 两条斜边**组成的等腰梯形，
 * 外侧边缘较长，靠近中央音波的一侧收束，形成向外展开的透视面板，
 * 因此不能退化成圆角矩形卡片。
 *
 * 实现方式：内联 SVG 多边形，顶点由统一的几何函数按实际渲染尺寸计算。
 *   - 使用 SVG 而非 CSS clip-path，是因为 clip-path 的四边形在非等比缩放下
 *     斜边角度会随宽高比变化（本页面在窄屏下正是如此），而 SVG 的 viewBox
 *     与容器 1:1 对应，顶点坐标即真实像素坐标，任何尺寸下角度都稳定。
 *   - 左右两侧共用同一套几何参数，仅做水平镜像，保证尺寸与角度完全一致。
 *   - 描边用 SVG stroke 实现（而非嵌套 clip-path 叠层），线条连续无错位。
 *
 * 主题：颜色全部取自主题令牌（--nw-panel-*），日间主题接入时无需改动本组件。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** 面板朝向：left 表示位于音波左侧（长边在左） */
type PanelSide = 'left' | 'right'

const props = withDefaults(
  defineProps<{
    /** 面板文字 */
    label: string
    /** 面板位于音波哪一侧，决定梯形收束方向 */
    side: PanelSide
    /**
     * 斜边比例（0–0.5）：同时决定水平投影与内侧短边的收缩量。
     * 0.24 对应内侧竖直边约为外侧 75% 高度，整体填充率约等于示意图。
     */
    taperRatio?: number
    /** 是否启用进入动画 */
    animated?: boolean
  }>(),
  { taperRatio: 0.24, animated: true },
)

/** 面板宽度占位（未测量完成前的兜底比例，避免首帧形状跳变） */
const FALLBACK_SIZE = { width: 420, height: 580 }

const panelElement = ref<HTMLElement | null>(null)
const box = ref({ ...FALLBACK_SIZE })
let resizeObserver: ResizeObserver | null = null

function measure(): void {
  const element = panelElement.value
  if (!element) {
    return
  }
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) {
    return
  }
  if (rect.width === box.value.width && rect.height === box.value.height) {
    return
  }
  box.value = { width: rect.width, height: rect.height }
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined') {
    return
  }
  resizeObserver = new ResizeObserver(measure)
  if (panelElement.value) {
    resizeObserver.observe(panelElement.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

interface Point {
  x: number
  y: number
}

/**
 * 计算梯形顶点（真实像素坐标，与面板尺寸 1:1）。
 *
 * 形状（以左侧面板为例）：
 *
 *   (outerX, top) ─────────╮
 *        │  ╲               │  ← 右侧斜边
 *        │   (innerX, inTop)│
 *        │                  │  ← 内侧竖直短边
 *        │   (innerX,inBottom)
 *        │  ╱               │
 *   (outerX, bottom) ───────╯
 *
 * 关键几何约束：**内侧竖直边比外侧短**，因此内侧两个顶点的 y 必须从上下角
 * 向内收 `taperY`，绝不能让它们共用同一个 y —— 若四点共线（例如内侧两点 x、y
 * 都相同），梯形会直接退化成矩形，异形面板的特征就完全消失。
 *
 * 左右两侧共用同一套参数，仅做水平镜像。
 *
 * @param inset 整体向内收缩量（px），用于描边与内层错位；0 表示最外轮廓
 */
function buildPoints(inset: number): Point[] {
  const { width, height } = box.value

  // 斜边的水平投影与垂直投影：按比例取，保证不同面板尺寸下倾角一致
  const taperX = width * props.taperRatio
  const taperY = height * props.taperRatio * 0.5

  const outerX = inset
  const innerX = width - inset - taperX
  const top = inset
  const bottom = height - inset
  // 内侧竖直边的上下端点：相对外侧角点各自向内收 taperY
  const innerTop = top + taperY
  const innerBottom = bottom - taperY

  if (props.side === 'left') {
    return [
      { x: outerX, y: top },
      { x: innerX, y: innerTop },
      { x: innerX, y: innerBottom },
      { x: outerX, y: bottom },
    ]
  }

  // 右侧面板：水平镜像，内侧短边改到左侧
  const mirroredOuterX = width - inset
  const mirroredInnerX = inset + taperX

  return [
    { x: mirroredInnerX, y: innerTop },
    { x: mirroredOuterX, y: top },
    { x: mirroredOuterX, y: bottom },
    { x: mirroredInnerX, y: innerBottom },
  ]
}

function toPolygon(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

/** SVG 的 viewBox 与面板实际像素尺寸 1:1 对应，顶点即真实坐标 */
const viewBox = computed(() => `0 0 ${box.value.width.toFixed(2)} ${box.value.height.toFixed(2)}`)

/** 外描边轮廓（含 stroke） */
const rimPolygon = computed(() => toPolygon(buildPoints(0)))

/**
 * 内玻璃层：整体向内收缩，露出一圈「玻璃厚度」。
 * 收缩量固定为 1.5px，因此描边宽度在任何尺寸下都保持一致。
 */
const fillPolygon = computed(() => toPolygon(buildPoints(1.5)))

/** 渐变 id 需要唯一：同一页面同时存在左右两个实例 */
const gradientId = computed(() => `nwFeaturePanelFill-${props.side}`)

const rootClasses = computed(() => [
  'nw-feature-panel',
  `nw-feature-panel--${props.side}`,
  { 'nw-feature-panel--animated': props.animated },
])
</script>

<template>
  <button ref="panelElement" type="button" :class="rootClasses">
    <svg
      class="nw-feature-panel__shape"
      :viewBox="viewBox"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0.35" y2="1">
          <stop class="nw-feature-panel__stop-top" offset="0%" />
          <stop class="nw-feature-panel__stop-bottom" offset="100%" />
        </linearGradient>
      </defs>

      <!-- 外轮廓：描边色 + 玻璃填充，stroke 保证线条连续且粗细一致 -->
      <polygon
        class="nw-feature-panel__rim"
        :points="rimPolygon"
        :fill="`url(#${gradientId})`"
        stroke-width="1.5"
        stroke-linejoin="round"
      />

      <!-- 内层：再收 1.5px，露出的一圈形成玻璃厚度与内阴影 -->
      <polygon
        class="nw-feature-panel__fill"
        :points="fillPolygon"
        :fill="`url(#${gradientId})`"
      />
    </svg>

    <span class="nw-feature-panel__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.nw-feature-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  isolation: isolate;
  transition: var(--nw-transition-interactive);
  -webkit-tap-highlight-color: transparent;
}

/* ---------- 形状层 ---------- */
.nw-feature-panel__shape {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.nw-feature-panel__stop-top {
  stop-color: var(--nw-panel-fill-top);
}

.nw-feature-panel__stop-bottom {
  stop-color: var(--nw-panel-fill-bottom);
}

/* 外描边：只画边线，填充由渐变承担 */
.nw-feature-panel__rim {
  stroke: var(--nw-panel-rim);
  transition: stroke var(--nw-duration-base) var(--nw-ease-out);
}

/* 内层玻璃：叠在描边之上，露出的细边即描边 */
.nw-feature-panel__fill {
  transition: fill var(--nw-duration-base) var(--nw-ease-out);
}

/* ---------- 文字：水平垂直严格居中，不做任何位移补偿 ---------- */
.nw-feature-panel__label {
  position: relative;
  z-index: var(--nw-z-content);
  color: var(--nw-panel-label);
  font-size: var(--nw-font-size-xl);
  font-weight: var(--nw-font-weight-medium);
  line-height: 1;
  letter-spacing: var(--nw-letter-spacing-display);
  /* 字距会在末尾多出一份空隙，向左补偿以保持视觉居中 */
  text-indent: var(--nw-letter-spacing-display);
  pointer-events: none;
  transition:
    color var(--nw-duration-base) var(--nw-ease-out),
    text-shadow var(--nw-duration-base) var(--nw-ease-out);
}

/* =============================================================
 * 交互状态：向中央音波方向轻微移动 + 提亮边缘
 * ============================================================= */
.nw-feature-panel:hover .nw-feature-panel__rim {
  stroke: var(--nw-panel-rim-hover);
}

.nw-feature-panel:hover .nw-feature-panel__label {
  color: var(--nw-panel-label-hover);
  text-shadow: var(--nw-glow-accent);
}

.nw-feature-panel--left:hover {
  transform: translateX(clamp(4px, 0.9vw, 14px));
}

.nw-feature-panel--right:hover {
  /* 与左侧呼应，方向相反，形成对称的「向内收拢」反馈 */
  transform: translateX(clamp(-14px, -0.9vw, -4px));
}

.nw-feature-panel:active {
  transform: scale(0.994);
  transition-duration: var(--nw-duration-fast);
}

.nw-feature-panel:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 4px;
  border-radius: var(--nw-radius-xs);
}

/* 不支持 backdrop-filter 时退化为较高不透明度的深色填充 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-feature-panel__stop-top,
  .nw-feature-panel__stop-bottom {
    stop-color: var(--nw-panel-fallback);
  }
}

/*
 * 进入动画：从各自一侧平滑进入，最终停在参考图规定的位置。
 *
 * 注意 fill-mode 必须用 backwards 而不是 both/forwards：
 * 动画的填充状态优先级高于普通规则，若保留 forwards 的结束帧，
 * 悬停位移会被动画填充永久覆盖，交互失效。
 * backwards 只在延迟阶段应用起始帧，动画结束后不再接管 transform。
 */
.nw-feature-panel--animated {
  animation: nw-feature-panel-enter 620ms var(--nw-ease-out) backwards;
}

.nw-feature-panel--animated.nw-feature-panel--left,
.nw-feature-panel--animated.nw-feature-panel--right {
  animation-delay: 140ms;
}

.nw-feature-panel--left {
  --nw-feature-panel-enter-x: -34px;
}

.nw-feature-panel--right {
  --nw-feature-panel-enter-x: 34px;
}

@keyframes nw-feature-panel-enter {
  from {
    opacity: 0;
    transform: translateX(var(--nw-feature-panel-enter-x, 0));
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-feature-panel,
  .nw-feature-panel__rim,
  .nw-feature-panel__fill,
  .nw-feature-panel__label {
    transition: none;
  }

  .nw-feature-panel--animated {
    animation: none;
  }

  .nw-feature-panel:hover,
  .nw-feature-panel:active {
    transform: none;
  }
}
</style>
