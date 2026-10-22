<script setup lang="ts">
/**
 * HomeBrand —— 主界面品牌区（Logo + 标题）
 * ---------------------------------------------------------------
 * 职责：只呈现品牌标识，不含任何交互。
 *
 * 移植说明（相对参考稿 podcast-engine/index.html 的 .brand）：
 *   1. Logo 仍是参考稿的耳形 + 声波刻线，路径数据一字未改；
 *      渐变的三个色站改为语义化令牌（--nw-color-text-primary /
 *      --nw-color-accent-strong / --nw-color-accent），随主题变化。
 *   2. 标题保留参考稿的「渐变填充 + 浅色描边 + 分层投影」处理。参考稿的像素
 *      显示字体（assets/pixel-arcade.ttf）不在本项目资源内，且本次不允许新增
 *      字体文件，因此改用项目字体栈 --nw-font-sans，只换字形不换工艺。
 *   3. SVG 渐变的 id 加了 nw 前缀：同一个页面可能出现多个实例，
 *      避免与其它组件的同名 id 冲突。
 */
</script>

<template>
  <header class="nw-home-brand">
    <span class="nw-home-brand__logo" aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <defs>
          <linearGradient id="nwHomeEarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="var(--nw-color-text-primary)" />
            <stop offset="0.45" stop-color="var(--nw-color-accent-strong)" />
            <stop offset="1" stop-color="var(--nw-color-accent)" />
          </linearGradient>
        </defs>

        <g class="nw-home-brand__mark">
          <path
            class="nw-home-brand__ear-outline"
            d="M23 59C13.4 55.6 7.5 47.3 7.5 37.2V27.6C7.5 14.1 18 3.5 32 3.5c13.9 0 24.5 10.6 24.5 24.1 0 7.6-2.6 12.5-6.3 16.6-2.1 2.3-2.9 3.8-2.9 7 0 8.2-5.4 13.3-13.3 13.3H23"
          />
          <path
            class="nw-home-brand__ear-inner"
            d="M34 54c-1.8-1.1-2.8-3-2.8-5.3 0-3 1.9-4.8 4.4-4.8 2.3 0 4-1.6 4-4 0-4.6-3.7-8-8.8-8s-9 3.7-9 9"
          />
        </g>

        <path class="nw-home-brand__ear-bar" d="M22 47.5h7.5l2.9 6.4" />
        <path class="nw-home-brand__ear-signal" d="M39.4 39.2h13.8" />
        <path class="nw-home-brand__ear-signal nw-home-brand__ear-signal--2" d="M36.6 31.6h16.6" />
        <path class="nw-home-brand__ear-signal nw-home-brand__ear-signal--3" d="M33.4 24h19.8" />
      </svg>
    </span>

    <h1 class="nw-home-brand__title">TaleTrellis</h1>
  </header>
</template>

<style scoped>
.nw-home-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  animation: nw-home-brand-rise 0.8s var(--nw-ease-out) 0.05s both;
}

/* ---------- Logo ---------- */
.nw-home-brand__logo {
  flex: 0 0 auto;
  display: block;
  width: clamp(62px, 6vw, 88px);
  height: clamp(62px, 6vw, 88px);
  filter: drop-shadow(0 8px 18px var(--nw-color-page-bg)) var(--nw-glow-subject);
}

.nw-home-brand__logo svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.nw-home-brand__ear-outline,
.nw-home-brand__ear-inner,
.nw-home-brand__ear-bar,
.nw-home-brand__ear-signal {
  fill: none;
  stroke: url(#nwHomeEarFill);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nw-home-brand__ear-outline {
  stroke-width: 6.4;
}

.nw-home-brand__ear-inner {
  stroke-width: 5;
  opacity: 0.92;
}

.nw-home-brand__ear-bar {
  stroke-width: 5;
}

.nw-home-brand__ear-signal {
  stroke-width: 4.4;
  opacity: 0.9;
}

.nw-home-brand__ear-signal--2 {
  opacity: 0.68;
}

.nw-home-brand__ear-signal--3 {
  opacity: 0.46;
}

/* ---------- 标题：渐变填充 + 浅色描边 ---------- */
.nw-home-brand__title {
  margin: 0;
  padding: 0.06em 0.1em 0.1em;
  color: transparent;
  font-family: var(--nw-font-sans);
  font-size: clamp(36px, 3.8vw, 58px);
  font-weight: var(--nw-font-weight-semibold);
  line-height: 0.96;
  letter-spacing: 0.04em;
  white-space: nowrap;
  background-image: linear-gradient(
    180deg,
    var(--nw-color-accent-strong) 4%,
    var(--nw-color-accent) 40%,
    color-mix(in srgb, var(--nw-color-accent) 72%, var(--nw-color-page-bg)) 72%,
    color-mix(in srgb, var(--nw-color-accent) 46%, var(--nw-color-page-bg)) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  /*
   * 描边压在填充之下，只露出外侧一半。
   * 参考稿用的是像素字体（笔画很粗，0.1em 描边刚好形成一圈亮边）；
   * 这里换成常规无衬线字体，同样的 0.1em 会把字形内部吃掉，
   * 因此收细到 0.085em —— 工艺不变，只是按字体重新配平。
   */
  -webkit-text-stroke: 0.085em var(--nw-color-accent-contrast);
  paint-order: stroke fill;
  filter:
    drop-shadow(0 0.035em 0 var(--nw-color-page-bg))
    drop-shadow(0 0.12em 0.18em var(--nw-color-page-bg));
}

@keyframes nw-home-brand-rise {
  from {
    opacity: 0;
    transform: translateY(-14px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-home-brand,
  .nw-home-brand__logo {
    animation: none;
    filter: none;
  }
}
</style>
