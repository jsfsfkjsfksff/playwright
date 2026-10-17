<script setup lang="ts">
/**
 * FeatureView —— 夜间电台功能选择页（第二个页面）
 * ---------------------------------------------------------------
 * 构图严格对齐布局示意图，以水平中轴线为基准的左右平衡结构：
 *   左侧「资源」异形面板  ←  中央环形音波  →  右侧「创作」异形面板
 *
 * 三个主体各由独立组件承担，页面只负责构图与联动：
 *   - AudioWave    中央动态音波（近似圆形轮廓）
 *   - ResourcePanel 左侧资源入口（外侧长、内侧斜线收束的梯形）
 *   - CreatePanel   右侧创作入口（镜像）
 *
 * 主题：本页不写任何主题专属色值，全部引用语义化令牌，
 * 日间主题接入时无需改动页面结构。
 */
import { ref } from 'vue'

import AudioWave from '@/components/audio/AudioWave.vue'
import BackLink from '@/components/base/BackLink.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import CreatePanel from '@/components/feature/CreatePanel.vue'
import ResourcePanel from '@/components/feature/ResourcePanel.vue'

type FeatureSide = 'resources' | 'create'

/** 当前被悬停或聚焦的入口；用于让中央音波产生轻微联动 */
const activeSide = ref<FeatureSide | null>(null)

function activate(side: FeatureSide): void {
  activeSide.value = side
}

function deactivate(): void {
  activeSide.value = null
}
</script>

<template>
  <div class="nw-feature">
    <!-- 氛围背景：仅保留天幕与极克制的光晕，避免喧宾夺主 -->
    <PageBackdrop />

    <div class="nw-feature__utility">
      <BackLink label="返回首页" />
    </div>

    <main class="nw-feature__main">
      <!-- 页面标题仅供屏幕阅读器与语义结构使用，视觉上不出现额外文字 -->
      <h1 class="nw-visually-hidden">功能选择</h1>

      <div class="nw-feature__stage">
        <div
          class="nw-feature__panel-slot nw-feature__panel-slot--left"
          @pointerenter="activate('resources')"
          @pointerleave="deactivate"
          @focusin="activate('resources')"
          @focusout="deactivate"
        >
          <ResourcePanel />
        </div>

        <div
          class="nw-feature__wave-slot"
          :class="{ 'nw-feature__wave-slot--engaged': activeSide !== null }"
        >
          <AudioWave class="nw-feature__wave" />
        </div>

        <div
          class="nw-feature__panel-slot nw-feature__panel-slot--right"
          @pointerenter="activate('create')"
          @pointerleave="deactivate"
          @focusin="activate('create')"
          @focusout="deactivate"
        >
          <CreatePanel />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* =============================================================
 * 页面骨架：全屏水平三段式，垂直方向以中轴线居中
 * ============================================================= */
.nw-feature {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
}

.nw-feature__utility {
  position: absolute;
  top: var(--nw-layout-header-inset);
  left: var(--nw-layout-page-gutter);
  z-index: var(--nw-z-content);
}

.nw-feature__main {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: clamp(3.5rem, 8vh, 6rem) var(--nw-layout-page-gutter);
}

/* 三段式：面板 - 音波 - 面板，整体水平居中 */
.nw-feature__stage {
  /*
   * 面板宽度基准：列宽与面板高度都由它推导，保证宽高比恒定。
   */
  --nw-feature-panel-width: clamp(160px, 21.5vw, 420px);

  display: grid;
  /*
   * 两侧列使用 minmax(0, 1fr)，让它们**均分剩余空间**并受 max-width 约束。
   * 这是「整体水平居中」的关键：此前两侧列写死为 clamp 宽度，列宽合计小于
   * 容器宽度时会留下未分配空间，三个主体就会偏离容器中心（实测中心
   * 从 960 偏到 818，偏移 142px）。改为 fr 后，左右列严格等宽，
   * 中央音波必然落在容器水平中心。
   */
  grid-template-columns:
    minmax(0, 1fr)
    clamp(210px, 29vw, 440px)
    minmax(0, 1fr);
  align-items: center;
  justify-items: center;
  gap: clamp(0.75rem, 3.4vw, 4.5rem);
  width: 100%;
  max-width: var(--nw-layout-stage-max);
  margin-inline: auto;
}

/* 面板槽：宽度受基准值约束，高度按同一比例推导，杜绝比例失真 */
.nw-feature__panel-slot {
  width: 100%;
  max-width: var(--nw-feature-panel-width);
  height: calc(var(--nw-feature-panel-width) * 1.4);
  min-width: 0;
}

/* 音波槽：始终保持正圆并位于视觉中心 */
.nw-feature__wave-slot {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  transition: transform var(--nw-duration-slow) var(--nw-ease-out);
}

/* 悬停功能入口时，中央音波极轻微放大，形成联动 */
.nw-feature__wave-slot--engaged {
  transform: scale(1.018);
}

/* 进入动画：音波轻微淡入放大 */
.nw-feature__wave {
  animation: nw-feature-wave-enter 760ms var(--nw-ease-out) backwards;
}

@keyframes nw-feature-wave-enter {
  from {
    opacity: 0;
    transform: scale(0.94);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* =============================================================
 * 适配：只压缩尺寸与间距，不改变左右对称的三段式构图
 * 两侧列始终是 fr（等宽），因此任何断点下音波都居中。
 * ============================================================= */
@media (max-width: 1180px) {
  .nw-feature__stage {
    --nw-feature-panel-width: clamp(140px, 20vw, 260px);

    grid-template-columns:
      minmax(0, 1fr)
      clamp(200px, 25vw, 320px)
      minmax(0, 1fr);
    gap: clamp(0.75rem, 2.2vw, 2rem);
  }
}

@media (max-width: 900px) {
  .nw-feature__stage {
    --nw-feature-panel-width: clamp(110px, 19vw, 190px);

    grid-template-columns:
      minmax(0, 1fr)
      clamp(160px, 24vw, 250px)
      minmax(0, 1fr);
    gap: var(--nw-space-sm);
  }
}

/* 极窄视口：改为纵向堆叠，保证基础可用性（桌面端布局不受影响） */
@media (max-width: 640px) {
  .nw-feature__main {
    padding-block: clamp(3rem, 10vh, 5rem) var(--nw-space-lg);
  }

  .nw-feature__stage {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: var(--nw-space-md);
    max-width: 360px;
  }

  .nw-feature__wave-slot {
    order: -1;
    width: min(70vw, 280px);
  }

  .nw-feature__panel-slot {
    width: min(78vw, 300px);
    height: calc(min(78vw, 300px) * 1.4);
  }
}

/* 减少动态效果：取消进入动画与联动缩放 */
@media (prefers-reduced-motion: reduce) {
  .nw-feature__wave-slot,
  .nw-feature__wave {
    transition: none;
    animation: none;
  }

  .nw-feature__wave-slot--engaged {
    transform: none;
  }
}
</style>
