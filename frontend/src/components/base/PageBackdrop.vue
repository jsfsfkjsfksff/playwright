<script setup lang="ts">
/**
 * PageBackdrop —— 全站内页背景层（静态图 + 压暗层）
 * ---------------------------------------------------------------
 * 图：`assets/studio-select-bg.jpg`（设计给定的成品图，与「选择故事」页同一张）。
 * 首页是唯一例外：它用自己的 `home-backdrop.jpg`，不走本组件。
 *
 * 本组件取代原先自绘的环境层（`components/ambient/*`：星空、山脊、水面、雾气、
 * 月球辉光及其关键帧）。那些手绘图层与其专属关键帧已随这次接入一并删除 ——
 * 否则成品图与自绘背景会两层叠着打架，也留下一堆没人引用的样式。
 *
 * 两层结构：
 *   1. 图片层：fixed + cover + 居中。图是 1275×1184（约 1.08，接近正方），
 *      宽屏下必然裁切，cover 保证不留白；16:9 视口上下各裁掉约 16%，
 *      星空带与地平线仍在视野内，不会裁到主体。
 *   2. 压暗层：静态图偏亮（下半部是发光地平线），直接铺满会让整页变成浅色、
 *      与主界面的深色体系不符；这里叠「竖向渐变压暗 + 站内暗角令牌」，
 *      让图退成夜空的底子，保证文字与玻璃面板有足够对比。
 *
 * 两层都是 pointer-events: none，不拦截任何交互；
 * 页面内容自己带 z-index: var(--nw-z-content) 即可浮在其上。
 */
import studioBackdrop from '@/assets/studio-select-bg.jpg'
</script>

<template>
  <div class="nw-page-backdrop" aria-hidden="true">
    <div class="nw-page-backdrop__image" :style="{ backgroundImage: `url(${studioBackdrop})` }" />
    <div class="nw-page-backdrop__scrim" />
  </div>
</template>

<style scoped>
.nw-page-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nw-z-background);
  pointer-events: none;
}

.nw-page-backdrop__image {
  position: absolute;
  inset: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.nw-page-backdrop__scrim {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--nw-color-page-bg) 74%, transparent) 0%,
      color-mix(in srgb, var(--nw-color-page-bg) 40%, transparent) 40%,
      color-mix(in srgb, var(--nw-color-page-bg) 64%, transparent) 100%
    ),
    var(--nw-bg-vignette);
}
</style>
