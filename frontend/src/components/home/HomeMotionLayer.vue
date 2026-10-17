<script setup lang="ts">
/**
 * HomeMotionLayer —— 主界面中央动态层（纯装饰）
 * ---------------------------------------------------------------
 * 对应参考稿 index.html 的 `.motion` 一整块，五层由下至上：
 *   1. 笔墨浸染 .ink        —— 柔焦晕染，五枚墨渍缓慢洇开
 *   2. 环绕光环 .halo        —— 两道倾斜轨道反向环绕主体
 *   3. 呼吸光   .glow        —— 透过主体的极淡冷光
 *   4. 水波纹   .wave        —— 自主体下方扩散的涟漪
 *   5. 漂浮光点 .motes       —— 缓慢上浮的细小光点
 *
 * 移植说明：
 *   - 结构、坐标、周期与关键帧全部按参考稿保留；容器仍以 `container-type: inline-size`
 *     配合 `cqw` 单位等比缩放，换分辨率不会跑偏；
 *   - 参考稿里写死的 rgba 色值改用 color-mix() 从主题令牌派生，
 *     这样色相随主题走、透明度仍保持参考稿的实测值；
 *   - .halo 依旧不加 transform —— 那会新建 stacking context，
 *     子元素的 mix-blend-mode 就混不到同一层内容上了。
 *
 * 本组件不参与任何交互，整体 aria-hidden；调用方无需传参。
 */
import type { HomeHaloRing, HomeInkBlot, HomeMote, HomeWaveRing } from '@/types/home'

/** 笔墨浸染：周期与相位错开，避免五枚墨渍同步呼吸 */
const INK_BLOTS: readonly HomeInkBlot[] = [
  { id: 'a', duration: 17, delay: 0 },
  { id: 'b', duration: 21, delay: 2.5 },
  { id: 'c', duration: 14, delay: 1.2 },
  { id: 'd', duration: 24, delay: 4.1 },
  { id: 'e', duration: 27, delay: 1.8 },
]

/** 环绕光环：外圈顺时针 38s，内圈逆时针 52s */
const HALO_RINGS: readonly HomeHaloRing[] = [
  { id: 'a', duration: 38 },
  { id: 'b', duration: 52 },
]

/** 涟漪：每隔 2.5s 起一圈 */
const WAVE_RINGS: readonly HomeWaveRing[] = [
  { id: 1, delay: 0 },
  { id: 2, delay: 2.5 },
  { id: 3, delay: 5 },
]

/** 漂浮光点：坐标与周期取自参考稿的实测值 */
const MOTES: readonly HomeMote[] = [
  { id: 1, x: -100, y: -124, delay: 0, duration: 15, size: 3 },
  { id: 2, x: -206, y: -6, delay: 2.4, duration: 18, size: 4 },
  { id: 3, x: 224, y: -142, delay: 1.2, duration: 16, size: 3 },
  { id: 4, x: 284, y: -16, delay: 3.1, duration: 20, size: 5 },
  { id: 5, x: 36, y: -196, delay: 4.3, duration: 17, size: 3 },
  { id: 6, x: -150, y: 52, delay: 5.2, duration: 19, size: 4 },
]
</script>

<template>
  <div class="nw-motion" aria-hidden="true">
    <!-- 1. 笔墨浸染 -->
    <div class="nw-motion__ink">
      <span
        v-for="blot in INK_BLOTS"
        :key="blot.id"
        class="nw-motion__blot"
        :class="`nw-motion__blot--${blot.id}`"
        :style="{
          '--nw-motion-duration': `${blot.duration}s`,
          '--nw-motion-delay': `${blot.delay}s`,
        }"
      />
    </div>

    <!-- 2. 环绕主体的两道倾斜光环 -->
    <div class="nw-motion__halo">
      <span
        v-for="ring in HALO_RINGS"
        :key="ring.id"
        class="nw-motion__ring"
        :class="`nw-motion__ring--${ring.id}`"
        :style="{ '--nw-motion-duration': `${ring.duration}s` }"
      />
    </div>

    <!-- 3. 透过主体的呼吸光 -->
    <div class="nw-motion__glow" />

    <!-- 4. 水波纹 -->
    <div class="nw-motion__wave">
      <span
        v-for="ring in WAVE_RINGS"
        :key="ring.id"
        class="nw-motion__wave-ring"
        :style="{ '--nw-motion-delay': `${ring.delay}s` }"
      />
    </div>

    <!-- 5. 漂浮光点 -->
    <div class="nw-motion__motes">
      <span
        v-for="mote in MOTES"
        :key="mote.id"
        class="nw-motion__mote"
        :style="{
          '--nw-motion-x': `${mote.x}px`,
          '--nw-motion-y': `${mote.y}px`,
          '--nw-motion-delay': `${mote.delay}s`,
          '--nw-motion-duration': `${mote.duration}s`,
          '--nw-motion-size': `${mote.size}px`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * 容器跟随视口等比缩放：1cqw == 1vw。
 * 坐标按参考稿的实测值（球心 49.5%、动态层中心 56%）定位，
 * 因此换分辨率时各层与主体的相对关系不变。
 */
.nw-motion {
  position: fixed;
  top: 56%;
  left: 49.5%;
  z-index: var(--nw-z-glow);
  width: min(100vw, 1600px);
  height: min(56.6vw, 900px);
  transform: translate(-50%, -50%);
  pointer-events: none;
  container-type: inline-size;
}

/* =============================================================
 * 1. 笔墨浸染
 * ============================================================= */
.nw-motion__ink {
  position: absolute;
  inset: 0;
  z-index: 0;
  mix-blend-mode: screen;
  filter: blur(2.6cqw) saturate(1.15);
}

.nw-motion__blot {
  position: absolute;
  border-radius: var(--nw-radius-circle);
  /* 总强度由关键帧的 opacity 控制，避免与这里的取值相乘被压没 */
  animation: nw-motion-ink var(--nw-motion-duration) ease-in-out var(--nw-motion-delay) infinite;
}

/* 冷色高光：主体受光面 */
.nw-motion__blot--a {
  top: 25.5%;
  left: 34.5%;
  width: 30cqw;
  height: 20cqw;
  --nw-motion-rotate: -3deg;

  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-text-primary) 34%, transparent),
    transparent 72%
  );
}

/* 淡蓝墨渍：主体下半与水面交界 */
.nw-motion__blot--b {
  top: 38%;
  left: 38.5%;
  width: 25cqw;
  height: 17cqw;
  --nw-motion-rotate: 4deg;

  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-accent-strong) 30%, transparent),
    transparent 74%
  );
}

/* 音条区域的洇开：让竖直音条边缘柔和下来 */
.nw-motion__blot--c {
  top: 45.5%;
  left: 35%;
  width: 26cqw;
  height: 11cqw;
  --nw-motion-rotate: -2deg;

  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-accent-contrast) 26%, transparent),
    transparent 78%
  );
}

/* 水面上的淡色倒影 */
.nw-motion__blot--d {
  top: 59%;
  left: 30%;
  width: 32cqw;
  height: 15cqw;
  --nw-motion-rotate: 3deg;

  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-text-secondary) 22%, transparent),
    transparent 80%
  );
}

/* 更大的外围洇染，把动态与背景缝在一起 */
.nw-motion__blot--e {
  top: 22%;
  left: 28%;
  width: 40cqw;
  height: 31cqw;
  --nw-motion-rotate: -5deg;

  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-text-primary) 16%, transparent),
    transparent 78%
  );
}

/* =============================================================
 * 2. 环绕光环
 * 注意：这里不能加 transform —— 会新建 stacking context，
 * 子元素的 mix-blend-mode 就混不到同一层内容上了。
 * ============================================================= */
.nw-motion__halo {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
}

.nw-motion__ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: var(--nw-border-width) solid var(--nw-color-border-strong);
  border-radius: var(--nw-radius-circle);
}

/* 环 A：左倾轨道，顺时针缓慢环绕 */
.nw-motion__ring--a {
  width: 26cqw;
  height: 11cqw;
  margin: -5.5cqw 0 0 -13cqw;

  mix-blend-mode: screen;
  box-shadow: 0 0 0.7cqw var(--nw-color-focus-ring);
  animation: nw-motion-orbit-a var(--nw-motion-duration) linear infinite;
}

/* 环 B：右倾轨道，略小一圈，反向环绕 */
.nw-motion__ring--b {
  width: 24cqw;
  height: 10.5cqw;
  margin: -5.25cqw 0 0 -12cqw;
  border-color: var(--nw-color-glass-edge);

  mix-blend-mode: multiply;
  animation: nw-motion-orbit-b var(--nw-motion-duration) linear infinite;
}

/* =============================================================
 * 3. 呼吸光：很轻，只做「活着」的感觉
 * ============================================================= */
.nw-motion__glow {
  position: absolute;
  top: 35.55%;
  left: 50%;
  z-index: 2;
  width: 40cqw;
  height: 34cqw;
  background-image: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--nw-color-text-primary) 13%, transparent),
    color-mix(in srgb, var(--nw-color-accent-contrast) 4%, transparent) 54%,
    transparent 78%
  );
  mix-blend-mode: screen;
  transform: translate(-50%, -50%);
  animation: nw-motion-breath 8s ease-in-out infinite;
}

/* =============================================================
 * 4. 水波纹：很淡，只在水面留一点涟漪
 * ============================================================= */
.nw-motion__wave {
  position: absolute;
  top: 74%;
  left: 50%;
  z-index: 2;
  width: 0;
  height: 0;
}

.nw-motion__wave-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9cqw;
  height: 1.7cqw;
  margin: -0.85cqw 0 0 -4.5cqw;
  border: var(--nw-border-width) solid var(--nw-color-border-strong);
  border-radius: var(--nw-radius-circle);
  opacity: 0;
  animation: nw-motion-ripple 9s ease-out var(--nw-motion-delay) infinite;
}

/* =============================================================
 * 5. 漂浮光点
 * ============================================================= */
.nw-motion__motes {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.nw-motion__mote {
  position: absolute;
  top: calc(50% + var(--nw-motion-y));
  left: calc(50% + var(--nw-motion-x));
  width: var(--nw-motion-size);
  height: var(--nw-motion-size);
  border-radius: var(--nw-radius-circle);
  background-color: var(--nw-color-text-primary);
  box-shadow:
    0 0 0.7cqw var(--nw-color-focus-ring),
    var(--nw-glow-accent-soft);
  animation: nw-motion-drift var(--nw-motion-duration) ease-in-out var(--nw-motion-delay) infinite;
}

/* =============================================================
 * 关键帧：全部照搬参考稿的幅度与周期
 * ============================================================= */

/* 笔墨缓慢洇开 */
@keyframes nw-motion-ink {
  0%,
  100% {
    opacity: 0.15;
    transform: scale(0.95) rotate(var(--nw-motion-rotate, 0deg));
  }

  45% {
    opacity: 0.28;
    transform: scale(1.05) rotate(var(--nw-motion-rotate, 0deg));
  }
}

/* 光环沿各自的倾斜轨道缓慢环绕（倾斜角固定，只是椭圆在转） */
@keyframes nw-motion-orbit-a {
  from {
    transform: rotate(22deg) rotate(0deg);
  }

  to {
    transform: rotate(22deg) rotate(360deg);
  }
}

@keyframes nw-motion-orbit-b {
  from {
    transform: rotate(-34deg) rotate(0deg);
  }

  to {
    transform: rotate(-34deg) rotate(-360deg);
  }
}

/* 中心光晕呼吸 */
@keyframes nw-motion-breath {
  0%,
  100% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    opacity: 0.95;
    transform: translate(-50%, -50%) scale(1.07);
  }
}

/* 水波纹扩散 */
@keyframes nw-motion-ripple {
  0% {
    opacity: 0;
    transform: scale(0.28);
  }

  12% {
    opacity: 0.78;
  }

  100% {
    opacity: 0;
    transform: scale(5.4);
  }
}

/* 光点漂浮 */
@keyframes nw-motion-drift {
  0% {
    opacity: 0;
    transform: translate3d(0, 12px, 0) scale(0.7);
  }

  25% {
    opacity: 0.95;
  }

  50% {
    opacity: 0.55;
    transform: translate3d(16px, -16px, 0) scale(1.1);
  }

  75% {
    opacity: 0.85;
  }

  100% {
    opacity: 0;
    transform: translate3d(-10px, -34px, 0) scale(0.8);
  }
}

/* =============================================================
 * 窄屏：动态层收窄并整体压暗，避免抢走菜单的注意力
 * ============================================================= */
@media (max-width: 900px) {
  .nw-motion {
    left: 50%;
    width: 92vw;
    height: 56vw;
    opacity: 0.55;
  }
}

/* =============================================================
 * 尊重「减少动态效果」：整层隐藏，画面回到静态
 * ============================================================= */
@media (prefers-reduced-motion: reduce) {
  .nw-motion {
    display: none;
  }
}
</style>
