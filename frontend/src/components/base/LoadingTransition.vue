<script setup lang="ts">
/**
 * LoadingTransition —— 全屏过场动画（生成剧情 / 载入场景时）
 * ---------------------------------------------------------------
 * 用途：替换原来那个「正在加载场景…」的小面板。
 *   · 生成剧情：点击「一键生成」提交后立刻盖上，至少展示 MIN_DURATION 后跳播放页；
 *   · 载入场景：播放页拉取场景数据期间同样盖上，两张页面的过场视觉完全一致。
 *
 * 视觉构成（自上而下逐层）：
 *   1. 背景：站内统一星空背景图（PageBackdrop）；
 *   2. 流星：复用「选择故事」页的 MeteorShower，过场期间继续划过；
 *   3. 科技边框：紧贴屏幕的 1px 青色内发光描边 + 四角 HUD 折线；
 *   4. 中央文字：金属流光大字（background-clip: text + 背景平移动画）+ 呼吸副标题。
 *
 * 层级：`position: fixed; inset: 0; z-index: 9999`，盖住页面、弹窗与提示条，
 *   避免过场期间露出下面的旧界面（点击也穿不过去，等于一个全屏等待态）。
 *
 * 颜色：全部取 --nw-* 令牌。金属渐变按需求是「深蓝 → 银白 → 亮青蓝 → 银白 → 深蓝」，
 *   分别对应 --nw-color-page-bg / --nw-color-text-primary / --nw-color-accent，
 *   因此日夜主题切换时这道流光会跟着变，不会写死一套土金色。
 */
import { onBeforeUnmount, onMounted } from 'vue'

import MeteorShower from '@/components/ambient/MeteorShower.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'

withDefaults(
  defineProps<{
    /** 中央大字（默认用于「生成剧情」的过场） */
    title?: string
    /** 大字下方的呼吸副标题 */
    subtitle?: string
  }>(),
  {
    title: 'GENERATING STORY',
    subtitle: 'AI 正在编排时间线…',
  },
)

/**
 * 过场期间锁住页面滚动。
 * 不锁的话：① 右侧那条页面滚动条会压在屏幕边缘的 HUD 边框上；
 *          ② 用户还能把背后的页面滚走，遮罩揭开时位置已经变了。
 * 恢复时写回挂载前的值，避免把别的遮罩（如弹窗）留下的状态改坏。
 */
let previousBodyOverflow = ''

onMounted(() => {
  const current = document.body.style.overflow
  previousBodyOverflow = current === 'hidden' ? '' : current
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <!-- 全屏遮罩：传送到 body，避免被页面容器的 overflow / transform 裁切 -->
  <Teleport to="body">
    <div class="nw-loading-transition" role="status" aria-live="polite">
      <!-- 1. 背景：与「选择故事」页同一张星空图 -->
      <PageBackdrop />

      <!-- 2. 流星：过场期间继续在背后划过 -->
      <MeteorShower />

      <!-- 3. 科技边框：紧贴屏幕边缘的内发光细线 + 四角 HUD 折线 -->
      <div class="nw-loading-transition__frame" aria-hidden="true">
        <span class="nw-loading-transition__corner nw-loading-transition__corner--tl" />
        <span class="nw-loading-transition__corner nw-loading-transition__corner--tr" />
        <span class="nw-loading-transition__corner nw-loading-transition__corner--bl" />
        <span class="nw-loading-transition__corner nw-loading-transition__corner--br" />
      </div>

      <!-- 4. 中央文字：金属流光大字 + 呼吸副标题 -->
      <div class="nw-loading-transition__center">
        <h2 class="nw-loading-transition__title">{{ title }}</h2>

        <p class="nw-loading-transition__subtitle">{{ subtitle }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nw-loading-transition {
  position: fixed;
  inset: 0;
  /* 盖住页面内容、弹窗（--nw-z-modal）与提示条（--nw-z-toast） */
  z-index: 9999;
  display: grid;
  place-items: center;
  overflow: hidden;
  background-color: var(--nw-color-page-bg);
}

/* =============================================================
 * 科技边框：1px 描边 + 内发光 + 四角折线
 * ============================================================= */
.nw-loading-transition__frame {
  position: absolute;
  inset: 0;
  z-index: var(--nw-z-content);
  border: var(--nw-border-width) solid var(--nw-color-accent);
  /* 内发光用令牌里的强调色（半透明），等效于需求里的 inset 蓝光；
     第二条极近的亮边让描边在星空背景上更「锋利」 */
  box-shadow:
    inset 0 0 40px var(--nw-color-accent-hover),
    inset 0 0 2px var(--nw-color-accent-strong);
  pointer-events: none;
}

/* 四角 HUD：两条直角边拼出的 L 形折线，比整圈描边更像仪表盘 */
.nw-loading-transition__corner {
  position: absolute;
  width: clamp(1.5rem, 3vw, 2.75rem);
  height: clamp(1.5rem, 3vw, 2.75rem);
  border-color: var(--nw-color-accent-contrast);
  border-style: solid;
  border-width: 0;
  filter: drop-shadow(0 0 6px var(--nw-color-focus-ring));
}

.nw-loading-transition__corner--tl {
  top: clamp(0.5rem, 1.4vw, 1rem);
  left: clamp(0.5rem, 1.4vw, 1rem);
  border-top-width: var(--nw-border-width-strong);
  border-left-width: var(--nw-border-width-strong);
}

.nw-loading-transition__corner--tr {
  top: clamp(0.5rem, 1.4vw, 1rem);
  right: clamp(0.5rem, 1.4vw, 1rem);
  border-top-width: var(--nw-border-width-strong);
  border-right-width: var(--nw-border-width-strong);
}

.nw-loading-transition__corner--bl {
  bottom: clamp(0.5rem, 1.4vw, 1rem);
  left: clamp(0.5rem, 1.4vw, 1rem);
  border-bottom-width: var(--nw-border-width-strong);
  border-left-width: var(--nw-border-width-strong);
}

.nw-loading-transition__corner--br {
  right: clamp(0.5rem, 1.4vw, 1rem);
  bottom: clamp(0.5rem, 1.4vw, 1rem);
  border-right-width: var(--nw-border-width-strong);
  border-bottom-width: var(--nw-border-width-strong);
}

/* =============================================================
 * 中央文字
 * ============================================================= */
.nw-loading-transition__center {
  /*
   * 金属渐变的「暗端」：不直接用页面底色，否则扫到暗端时字在星空上几乎看不见。
   * 用 color-mix 调成「深蓝里掺一点亮青」—— 既有金属暗部，又保持可读。
   */
  --nw-loading-metal-dark: color-mix(
    in srgb,
    var(--nw-color-page-bg) 45%,
    var(--nw-color-accent)
  );

  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-sm);
  width: 100%;
  max-width: 100%;
  padding-inline: var(--nw-layout-page-gutter);
  text-align: center;
}

/*
 * 金属流光大字。
 * 镂空：background-clip: text + 透明字色；
 * 扫光：背景横向铺 200%，keyframes 把 background-position 从 0% 推到 200%，
 *       于是那道「亮青蓝」会反复从左向右流过字面。
 * 渐变配色（深蓝 → 银白 → 亮青蓝 → 银白 → 深蓝）全部用 --nw-* 令牌。
 */
.nw-loading-transition__title {
  margin: 0;
  background-image: linear-gradient(
    100deg,
    var(--nw-loading-metal-dark) 0%,
    var(--nw-color-text-primary) 24%,
    var(--nw-color-accent) 46%,
    var(--nw-color-text-primary) 68%,
    var(--nw-loading-metal-dark) 100%
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  font-family: var(--nw-font-sans);
  /* 需求要求 3rem；窄屏按视口收，避免这行字被裁掉 */
  font-size: clamp(1.65rem, 6vw, 3rem);
  font-weight: 900;
  letter-spacing: var(--nw-letter-spacing-wide);
  line-height: var(--nw-line-height-tight);
  white-space: nowrap;
  animation: nw-loading-sheen 3.2s linear infinite;
  /* 深色底上给字缘一点冷光，金属感更立起来 */
  filter: drop-shadow(0 0 18px var(--nw-color-accent-hover));
}

@keyframes nw-loading-sheen {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 200% 50%;
  }
}

/* 副标题：呼吸闪烁，提示「还在处理」而不是卡住 */
.nw-loading-transition__subtitle {
  margin: 0;
  color: var(--nw-color-text-tertiary);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-widest);
  animation: nw-loading-breathe 2.4s var(--nw-ease-in-out) infinite;
}

@keyframes nw-loading-breathe {
  0%,
  100% {
    opacity: 0.62;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-loading-transition__title {
    animation: none;
    background-position: 50% 50%;
  }

  .nw-loading-transition__subtitle {
    animation: none;
    opacity: 0.8;
  }
}
</style>
