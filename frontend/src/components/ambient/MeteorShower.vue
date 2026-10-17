<script setup lang="ts">
/**
 * MeteorShower —— 背景层的流星雨（纯装饰）
 * ---------------------------------------------------------------
 * 职责：在背景图之上、页面内容之下，渲染 3–5 条随机斜向划过的流星。
 * 不接受任何 props，不参与任何业务逻辑 —— 纯粹的视觉层。
 *
 * 【为什么独立成组件，而不是塞进 PageBackdrop】
 *   PageBackdrop 是「一张成品图 + 压暗层」，流星是「一层动态装饰」，
 *   两者职责与生命周期都不同：换背景图不用动流星，关掉流星也不用动背景图。
 *
 * 【方向为什么是「左上 → 右下」】
 *   与背景图（assets/studio-select-bg.jpg）里光轨的走向保持一致：
 *   那张图上的流星全部落在「\」这个轴向（自左上向右下，倾角约 8°–45°），
 *   没有一条是「/」轴向的。因此这里也沿「\」划过，拖尾朝左上。
 *   每条流星的实际倾角由随机下落比决定，并换算成拖尾的旋转角，
 *   保证拖尾方向与运动方向严格相反（不会出现「斜着走、尾巴横着飘」）。
 *
 * 【性能】
 *   1. 条数硬性上限 5 条（见 MIN_COUNT / MAX_COUNT），不做无谓的 GPU 开销；
 *   2. 动画只改 transform(translate3d) 与 opacity，全程在合成层完成，
 *      不碰 top / left，因此不触发重排重绘；
 *   3. 位移长度统一用 vw，这样「下落比」就是屏幕上的真实倾角，
 *      不必再依赖视口宽高比去修正拖尾角度；
 *   4. 位移、时长、延迟、拖尾长度、起点全部由 Math.random() 生成且互不相同，
 *      不会出现节拍器那样整齐的节奏。
 *
 * 【层级与可点击性（硬性约束）】
 *   z-index 取 --nw-z-far（2）：高于 PageBackdrop 的 --nw-z-background（1），
 *   低于所有内容的 --nw-z-content（10），因此永远不会盖住卡片；
 *   根元素 pointer-events: none，鼠标完全穿透到下面的卡片。
 *
 * 主题：颜色全部取 --nw-* 令牌，不写死色值。
 */
import type { CSSProperties } from 'vue'

/** 流星条数区间：硬性上限 5 条 */
const MIN_COUNT = 3
const MAX_COUNT = 5

/** 一条流星的随机参数 */
interface MeteorSpec {
  readonly id: number
  /** 起始位置（百分比，允许为负 = 从画面外进入） */
  readonly top: number
  readonly left: number
  /** 头部光点直径（px） */
  readonly size: number
  /** 拖尾长度（px） */
  readonly tail: number
  /** 划过距离：向右、向下都为正（统一用 vw，见文件头说明） */
  readonly travelX: number
  readonly travelY: number
  /** 拖尾旋转角（度）：始终指向运动方向的反向 */
  readonly angle: number
  /** 一个完整循环的时长与起始延迟（秒） */
  readonly duration: number
  readonly delay: number
}

/** [min, max) 区间内的随机数 */
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * 生成流星参数。
 * 起点分散在画面左上区域（含画面外一点），划过距离与下落比各自随机，
 * 因此每条流星进入视野的位置、速度与倾角都不同。
 */
function createMeteors(): MeteorSpec[] {
  const count = Math.round(randomBetween(MIN_COUNT, MAX_COUNT))

  return Array.from({ length: count }, (_, index) => {
    const travelX = randomBetween(56, 86)
    // 下落比 0.34–0.92 → 屏幕倾角约 19°–43°，与背景图的光轨范围一致
    const travelY = travelX * randomBetween(0.34, 0.92)
    const slope = Math.atan2(travelY, travelX)

    return {
      id: index,
      top: randomBetween(-14, 32),
      left: randomBetween(-6, 48),
      /* 头部 3–4.5px：再小就被背景星空吃掉了，看不出是流星 */
      size: randomBetween(3, 4.5),
      tail: randomBetween(110, 230),
      travelX,
      travelY,
      // 拖尾沿本地 +x 轴绘制；要指向「运动方向的反向」，
      // 旋转角 = -(180° - 倾角)
      angle: -(180 - (slope * 180) / Math.PI),
      duration: randomBetween(7, 14),
      delay: randomBetween(0, 6),
    }
  })
}

const meteors = createMeteors()

/** 把随机参数翻译成行内 CSS 自定义属性；样式表里只读变量 */
function meteorStyle(meteor: MeteorSpec): CSSProperties {
  return {
    top: `${meteor.top}%`,
    left: `${meteor.left}%`,
    '--nw-meteor-size': `${meteor.size}px`,
    '--nw-meteor-tail': `${meteor.tail}px`,
    '--nw-meteor-angle': `${meteor.angle}deg`,
    '--nw-meteor-x': `${meteor.travelX}vw`,
    '--nw-meteor-y': `${meteor.travelY}vw`,
    '--nw-meteor-duration': `${meteor.duration}s`,
    '--nw-meteor-delay': `${meteor.delay}s`,
  }
}
</script>

<template>
  <!-- 纯装饰：整体对辅助技术隐藏，且不接收任何指针事件 -->
  <div class="nw-meteor-shower" aria-hidden="true">
    <div
      v-for="meteor in meteors"
      :key="meteor.id"
      class="nw-meteor"
      :style="meteorStyle(meteor)"
    />
  </div>
</template>

<style scoped>
.nw-meteor-shower {
  position: absolute;
  inset: 0;
  /* 高于背景图（--nw-z-background = 1），低于所有内容（--nw-z-content = 10） */
  z-index: var(--nw-z-far);
  /* 必须裁剪：流星会平移到画面之外，不裁会撑出页面滚动条 */
  overflow: hidden;
  /* 硬性约束：绝不拦截鼠标，点击要能穿透到下面的卡片 */
  pointer-events: none;
}

.nw-meteor {
  position: absolute;
  width: var(--nw-meteor-size);
  height: var(--nw-meteor-size);
  border-radius: var(--nw-radius-circle);
  /* 头部光点；颜色用 currentColor 下发，拖尾会自动跟着走 */
  color: var(--nw-color-accent-contrast);
  background-color: currentColor;
  /* 双层辉光：靠近头部一圈紧实的亮边 + 外层柔光 */
  box-shadow:
    0 0 10px var(--nw-color-accent-strong),
    var(--nw-glow-accent);
  opacity: 0;
  /* 提前分层，保证 transform / opacity 全程在合成层上完成 */
  will-change: transform, opacity;
  animation-name: nw-meteor-fall;
  animation-duration: var(--nw-meteor-duration);
  animation-delay: var(--nw-meteor-delay);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}

/*
 * 拖尾：从头部沿「运动方向的反向」（左上）拉出一条渐隐细线。
 *   · 垂直居中用 margin-top 而不是 translate，避免与 rotate 的变换顺序纠缠；
 *   · clip-path 把尾巴收成从头部到末端的锥形 —— 真实流星就是「头粗尾细」，
 *     纯矩形细线看着像一根棍子；
 *   · 渐变 + blur(1px) 让它自然融进夜空。
 */
.nw-meteor::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--nw-meteor-tail);
  height: 3px;
  margin-top: -1.5px;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  border-radius: var(--nw-radius-pill);
  transform-origin: 0 50%;
  transform: rotate(var(--nw-meteor-angle));
  background-image: linear-gradient(
    90deg,
    currentColor 0%,
    var(--nw-color-accent-strong) 34%,
    transparent 100%
  );
  filter: blur(1px);
}

/*
 * 划过：一个循环里只有前 26% 在动，其余时间不可见地停在终点 ——
 * 于是每条流星是「偶尔划一次」，而不是一直在天上跑，
 * 再叠加各自不同的时长与延迟，整体节奏就不会像节拍器。
 */
@keyframes nw-meteor-fall {
  0% {
    transform: translate3d(0, 0, 0);
    opacity: 0;
  }

  4% {
    opacity: 1;
  }

  20% {
    opacity: 1;
  }

  26% {
    transform: translate3d(var(--nw-meteor-x), var(--nw-meteor-y), 0);
    opacity: 0;
  }

  100% {
    transform: translate3d(var(--nw-meteor-x), var(--nw-meteor-y), 0);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-meteor {
    /* 装饰性动效：直接不显示，而不是留在原地闪 */
    animation: none;
    opacity: 0;
  }
}
</style>
