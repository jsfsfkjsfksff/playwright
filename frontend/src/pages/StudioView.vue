<script setup lang="ts">
/**
 * StudioView —— 创作台入口：故事选择页（/studio）
 * ---------------------------------------------------------------
 * 结构自上而下三段，居中排布：
 *   1. 背景层：PageBackdrop（站内统一背景图，本页正是这张图的出处）
 *   2. 主体：标题「选择故事」+ 两张并排入口卡片（资源添加 / 操作编辑）
 *   3. 底部：就绪状态提示 + 「返回标题」与「一键生成」
 *
 * 底部动作（本次修正）：
 *   以前这里放的是「一键生成」，点了却只是跳去操作编辑页，还附一条随页面卸载而
 *   根本看不见的提示 —— 按钮文案与真实行为不符。现在改为「开始编排」，就是一次
 *   明确的导航；真正的生成按钮在「操作编辑」页底部（起始场景 / 必经场景 / 大纲等
 *   参数都在那里）。
 *   下方的就绪提示仍会告诉用户离「可以生成」还差什么，但它不再拦入口 ——
 *   锚点正是在操作编辑页里添加的，用「锚点不足」拦入口会让人永远加不上锚点。
 *
 * 卡片造型（本次调整）：两张**左右对称的圆角矩形玻璃卡**，做成「实体画框」——
 *   玻璃材质复用 base/GlassPanel（半透明底 + 毛玻璃），本页额外加上
 *   2px 强调色外框、加大的画框内边距、8px 错位实心硬阴影与内外辉光，
 *   左上 / 右下各一颗十字星光做科幻点缀；
 *   不再用「外层描边色块 + 内缩玻璃层」两层 polygon 去模拟切角。
 *   布局用 flex + margin-inline: auto 让两张等宽卡在页面中间居中成一个对称块。
 *
 * 主题：颜色全部取 --nw-* 令牌，不写死色值（圆角、间距、边框宽度同样取令牌）。
 */
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import MeteorShower from '@/components/ambient/MeteorShower.vue'
import AppButton from '@/components/base/AppButton.vue'
import DemoModeBadge from '@/components/base/DemoModeBadge.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { useStudioStore } from '@/stores/studio'
import { propertyTypeLabel } from '@/utils/studioVocabulary'

/* =============================================================
 * 入口卡片
 * ============================================================= */

/** 站内路由名（由路由表推导，避免写死字符串） */
type RouteName = (typeof ROUTE_NAMES)[keyof typeof ROUTE_NAMES]

interface StoryEntry {
  readonly id: string
  readonly title: string
  /** 一句话说明这个入口负责什么 */
  readonly summary: string
  readonly routeName: RouteName
  /** 图标路径（24×24 视口，描边渲染） */
  readonly iconPaths: readonly string[]
}

const STORY_ENTRIES: readonly StoryEntry[] = [
  {
    id: 'resources',
    title: '资源添加',
    summary: '登记角色 / 规则 / 实体，并为角色配置音色',
    routeName: ROUTE_NAMES.studioResources,
    iconPaths: [
      'M12 3.6 3.6 7.9 12 12.2l8.4-4.3z',
      'M3.6 12.1 12 16.4l8.4-4.3',
      'M3.6 16.1 12 20.4l8.4-4.3',
    ],
  },
  {
    id: 'operations',
    title: '操作编辑',
    summary: '编排剧情锚点，设置插值参数并导出片段',
    routeName: ROUTE_NAMES.studioOperations,
    iconPaths: [
      'M4 7.5h16',
      'M4 12h16',
      'M4 16.5h16',
      'M9 5.2v4.6',
      'M15 9.7v4.6',
      'M11 14.2v4.6',
    ],
  },
]

/* =============================================================
 * 状态
 * ============================================================= */

const router = useRouter()
const studio = useStudioStore()

/** 每张卡片上的进度摘要，让用户在选择页就能看出还缺什么 */
const entryStatus = computed<Record<string, string>>(() => ({
  resources: studio.resourceGroups
    .map((group) => `${propertyTypeLabel(group.type)} ${group.items.length}`)
    .join(' · '),
  operations: `剧情锚点 ${studio.anchorCount}`,
}))

/** 最低生成条件：至少 1 个资源、至少 2 个剧情锚点 */
const MIN_RESOURCES = 1
const MIN_ANCHORS = 2

const canGenerate = computed(
  () => studio.resourceCount >= MIN_RESOURCES && studio.anchorCount >= MIN_ANCHORS,
)

/** 就绪状态提示：只告诉用户离「可以生成」还差什么，不拦入口 */
const pendingHint = computed(() => {
  const missing: string[] = []
  if (studio.resourceCount < MIN_RESOURCES) {
    missing.push(`资源 ${studio.resourceCount}/${MIN_RESOURCES}`)
  }
  if (studio.anchorCount < MIN_ANCHORS) {
    missing.push(`剧情锚点 ${studio.anchorCount}/${MIN_ANCHORS}`)
  }
  return `还差：${missing.join('，')}`
})

/* =============================================================
 * 操作
 * ============================================================= */

function goHome(): void {
  void router.push({ name: ROUTE_NAMES.home })
}

/**
 * 进入编排。
 * 这一页只做「总览 + 分流」：真正的插值生成需要填起始场景 / 必经场景 / 大纲等参数，
 * 表单和生成按钮都在「操作编辑」页，所以这里就是一次纯导航。
 *
 * 注意（本次修正）：这里**不做任何条件校验**。以前会在条件不满足时置灰，
 * 但锚点正是在「操作编辑」页里添加的 —— 用「锚点不足」拦住入口，
 * 用户就永远加不上锚点。就绪状态改由页面下方的提示承担。
 */
function goToOperations(): void {
  void router.push({ name: ROUTE_NAMES.studioOperations })
}

onMounted(() => {
  // 这一页要显示各类资源的数量，因此进入时拉一次列表；
  // loadResources 内部已捕获错误并写入 lastError，不会抛出未处理的拒绝
  void studio.loadResources()
})
</script>

<template>
  <div class="nw-studio-select">
    <!-- 1. 背景层：站内统一背景图 + 压暗层（base/PageBackdrop） -->
    <PageBackdrop />

    <!--
      装饰层：流星雨。
      它自带 pointer-events: none 与 z-index: var(--nw-z-far)，
      压在背景图之上、内容之下，鼠标可以直接穿透到下面的入口卡片。
    -->
    <MeteorShower />

    <main class="nw-studio-select__main">
      <PageHeader class="nw-studio-select__title" title="选择故事" />

      <!-- 2. 两张左右对称的圆角矩形卡片 -->
      <ul class="nw-studio-select__entries">
        <li v-for="entry in STORY_ENTRIES" :key="entry.id" class="nw-studio-select__entry">
          <RouterLink class="nw-studio-select__card" :to="{ name: entry.routeName }">
            <!-- 玻璃面复用 GlassPanel：圆角矩形 + 玻璃拟态材质 -->
            <GlassPanel class="nw-studio-select__surface" tone="strong">
              <span class="nw-studio-select__card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path v-for="(path, index) in entry.iconPaths" :key="index" :d="path" />
                </svg>
              </span>

              <span class="nw-studio-select__card-title">{{ entry.title }}</span>
              <span class="nw-studio-select__card-summary">{{ entry.summary }}</span>
              <span class="nw-studio-select__card-status">{{ entryStatus[entry.id] }}</span>
            </GlassPanel>
          </RouterLink>
        </li>
      </ul>

      <!-- 3. 底部：就绪状态 + 两个动作 -->
      <div class="nw-studio-select__actions">
        <!-- 演示模式提示：本页链路不请求后端，数据只在内存里 -->
        <DemoModeBadge hint="Mock 数据：全链路不请求后端，音频为静音占位" />

        <!-- 资源列表加载失败时如实说明，避免用「全是 0」掩盖一次失败的请求 -->
        <p v-if="studio.lastError" class="nw-studio-select__error" role="alert">
          {{ studio.lastError }}
        </p>

        <p class="nw-studio-select__hint" role="status">
          {{ canGenerate ? '已满足生成条件' : pendingHint }}
        </p>

        <div class="nw-studio-select__buttons">
          <AppButton size="lg" variant="secondary" @click="goHome">返回标题</AppButton>

          <AppButton size="lg" variant="primary" notched @click="goToOperations">
            开始编排
          </AppButton>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.nw-studio-select {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
}

/* =============================================================
 * 主体：三段式（标题 / 卡片 / 动作），整体居中
 * ============================================================= */
.nw-studio-select__main {
  position: relative;
  z-index: var(--nw-z-content);
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: center;
  gap: clamp(1.5rem, 4vh, 3rem);
  width: 100%;
  max-width: var(--nw-layout-stage-max);
  min-height: 100vh;
  min-height: 100svh;
  margin-inline: auto;
  padding: var(--nw-layout-header-inset) var(--nw-layout-page-gutter)
    clamp(1.5rem, 4vh, 2.75rem);
}

.nw-studio-select__title {
  flex-shrink: 0;
}

/* =============================================================
 * 入口卡片：两张左右对称的圆角矩形玻璃卡
 * -------------------------------------------------------------
 * 本次调整（相对上一版）：
 *   1. 形状：去掉切角 clip-path，改为统一圆角矩形（--nw-radius-md = 12px）；
 *   2. 布局：由「靠左的 grid」改为「居中的 flex」，两张卡等宽等高、左右对称。
 *      上一版右侧留白的根因：grid 项一旦设了显式宽度就不再拉伸，会靠在行首，
 *      所以必须显式 margin-inline: auto 才会居中；
 *   3. 悬停：由位移改为「轻微放大 + 发光」，卡片不再跑动。
 * ============================================================= */
.nw-studio-select__entries {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  /* 两张卡各 24rem(384px) + 32px 间距 = 800px，整体在页面中间居中的一个对称块 */
  gap: 2rem;
  width: 100%;
  max-width: 50rem;
  margin-inline: auto;
}

.nw-studio-select__entry {
  display: flex;
  /* flex:1 + 同一个 max-width：容器无论多宽，两张卡始终等宽 */
  flex: 1 1 0;
  max-width: 24rem;
  min-width: 0;
}

.nw-studio-select__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* 两张卡等高：这里给最小高度，行上的 align-items:stretch 保证严格一致 */
  min-height: 20rem;
  color: var(--nw-color-text-primary);
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--nw-duration-base) var(--nw-ease-out);
  -webkit-tap-highlight-color: transparent;
}

/*
 * 玻璃面直接用 GlassPanel：半透明底与毛玻璃由它提供，
 * 这里把它做成一个「实体画框」——
 *   2px 强调色外框 + 加大的内边距 + 错位实心硬阴影 + 内外辉光。
 * 阴影四层（顺序即叠放顺序，从最上面一层开始写）：
 *   1. 8px 错位实心硬阴影 —— 画框投在后面的厚度；用最深的页面底色而不是纯黑，
 *      这样在夜间蓝色调里不会显脏；
 *   2. 外部霓虹辉光（--nw-glow-accent）；
 *   3. 内边缘发光，让玻璃面有厚度；
 *   4. 顶部内高光。
 * 悬停时同样四层、只是参数变化，层数一致 box-shadow 才能平滑过渡。
 */
.nw-studio-select__card :deep(.nw-glass-panel) {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--nw-space-2xs);
  width: 100%;
  /* 画框内边距：内容不贴边，框感来自「边框 + 留白」 */
  padding: clamp(1.75rem, 3.2vw, 2.5rem);
  /* 清晰可见的外边框：2px（--nw-border-width-strong）强调色 */
  border: var(--nw-border-width-strong) solid var(--nw-color-accent-strong);
  /* 纯正矩形 + 统一 12px 圆角 */
  border-radius: var(--nw-radius-md);
  text-align: center;
  box-shadow:
    8px 8px 0 var(--nw-color-page-bg),
    var(--nw-glow-accent),
    inset 0 0 18px var(--nw-color-accent-hover),
    var(--nw-shadow-inset-top);
  transition:
    border-color var(--nw-duration-base) var(--nw-ease-out),
    box-shadow var(--nw-duration-base) var(--nw-ease-out);
}

/*
 * 四角星光（用两个伪元素做左上 / 右下这两个最显眼的角）：
 * 中心亮点 + 一横一竖两道细芒，合起来是一颗十字星。
 * 全部取令牌颜色，不用图片、不写死色值。
 */
.nw-studio-select__card :deep(.nw-glass-panel)::before,
.nw-studio-select__card :deep(.nw-glass-panel)::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background-image:
    radial-gradient(circle at center, var(--nw-color-accent-contrast) 0 24%, transparent 30%),
    linear-gradient(0deg, transparent 45%, var(--nw-color-accent-strong) 50%, transparent 55%),
    linear-gradient(90deg, transparent 45%, var(--nw-color-accent-strong) 50%, transparent 55%);
  opacity: 0.85;
  pointer-events: none;
  transition: opacity var(--nw-duration-base) var(--nw-ease-out);
}

.nw-studio-select__card :deep(.nw-glass-panel)::before {
  top: 12px;
  left: 12px;
}

.nw-studio-select__card :deep(.nw-glass-panel)::after {
  right: 12px;
  bottom: 12px;
}

.nw-studio-select__card:hover,
.nw-studio-select__card:focus-visible {
  /* 轻微放大代替位移：卡片留在原处，只强调「可以点」 */
  transform: scale(1.02);
}

.nw-studio-select__card:active {
  transform: scale(0.99);
}

/* 悬停 / 聚焦：边框提亮 + 硬阴影位移加大（8px → 12px）+ 辉光增强 */
.nw-studio-select__card:hover :deep(.nw-glass-panel),
.nw-studio-select__card:focus-visible :deep(.nw-glass-panel) {
  border-color: var(--nw-color-accent-contrast);
  box-shadow:
    12px 12px 0 var(--nw-color-page-bg),
    var(--nw-glow-accent),
    inset 0 0 26px var(--nw-color-accent-hover),
    var(--nw-shadow-inset-top);
}

/* 星光在悬停 / 聚焦时亮起来 */
.nw-studio-select__card:hover :deep(.nw-glass-panel)::before,
.nw-studio-select__card:hover :deep(.nw-glass-panel)::after,
.nw-studio-select__card:focus-visible :deep(.nw-glass-panel)::before,
.nw-studio-select__card:focus-visible :deep(.nw-glass-panel)::after {
  opacity: 1;
}

/*
 * 键盘焦点环画在玻璃面上、而不是外层链接上：
 * 外层链接没有圆角，画在它上面会得到一个直角外框，与 12px 圆角卡片对不上。
 */
.nw-studio-select__card:focus-visible {
  outline: none;
}

.nw-studio-select__card:focus-visible :deep(.nw-glass-panel) {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 4px;
}

.nw-studio-select__card-icon {
  display: grid;
  place-items: center;
  width: clamp(3rem, 5vw, 4rem);
  height: clamp(3rem, 5vw, 4rem);
  margin-bottom: var(--nw-space-2xs);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-image: linear-gradient(150deg, var(--nw-color-accent-hover), transparent 76%);
  color: var(--nw-color-accent-strong);
  transition: var(--nw-transition-colors);
}

.nw-studio-select__card-icon svg {
  width: 56%;
  height: 56%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nw-studio-select__card:hover .nw-studio-select__card-icon,
.nw-studio-select__card:focus-visible .nw-studio-select__card-icon {
  border-color: var(--nw-color-border-strong);
  color: var(--nw-color-accent-contrast);
}

.nw-studio-select__card-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-studio-select__card-summary {
  max-width: 22rem;
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-studio-select__card-status {
  margin-top: var(--nw-space-2xs);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

/* =============================================================
 * 底部动作
 * ============================================================= */
.nw-studio-select__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-xs);
}

.nw-studio-select__hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-shadow: 0 1px 6px var(--nw-color-page-bg);
}

.nw-studio-select__error {
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  text-shadow: 0 1px 6px var(--nw-color-page-bg);
}

.nw-studio-select__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--nw-space-sm);
}

/*
 * 不支持 backdrop-filter 时的兜底由 GlassPanel 自己处理
 * （.nw-glass-panel--strong 会换成不透明底色），这里不再重复一份。
 */

/* 窄屏：两张卡改为纵向堆叠，仍保持等宽与居中 */
@media (max-width: 720px) {
  .nw-studio-select__entries {
    flex-direction: column;
    align-items: center;
  }

  .nw-studio-select__entry {
    flex: 0 1 auto;
    width: 100%;
  }

  .nw-studio-select__card {
    min-height: clamp(9rem, 22vh, 12rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-studio-select__card,
  .nw-studio-select__card :deep(.nw-glass-panel),
  .nw-studio-select__card :deep(.nw-glass-panel)::before,
  .nw-studio-select__card :deep(.nw-glass-panel)::after,
  .nw-studio-select__card-icon {
    transition: none;
  }

  .nw-studio-select__card:hover,
  .nw-studio-select__card:focus-visible,
  .nw-studio-select__card:active {
    transform: none;
  }
}
</style>
