<script setup lang="ts">
/**
 * HomeMenu —— 主界面左侧主菜单
 * ---------------------------------------------------------------
 * 职责：把菜单项的「文案 + 图标 + 目标」映射成一组可键盘操作的入口。
 *
 * 移植说明（相对参考稿的 .menu）：
 *   1. 斜切玻璃块仍用参考稿的做法 —— 伪元素 skewX(-13deg) + 描边 + 扫光层，
 *      边框会跟着一起倾斜，因此切角边缘仍是完整的 1.5px 描边；
 *   2. 参考稿里写死的四条 <a> 改为 **TypeScript 数组 + v-for**；
 *   3. 已有对应页面的项渲染为 <RouterLink> 真实跳转，页面尚未开发的项渲染为
 *      <button> 并只播报提示 —— 参考稿 app.js 对四个入口一律 preventDefault +
 *      toast，本项目里「创作台」「资源」两个页面已经存在，没有理由不接上真实路由；
 *      「设置」没有独立页面，但它是音色选择的宿主（见下），因此点击后向上抛
 *      `settings` 事件，同样不制造无效跳转；
 *   4. 参考稿的 ↑↓ 键导航保留，并补上 Home / End；参考稿里那条
 *      「焦点在 body 时按 Enter 激活选中项」依赖全局状态、容易与页面其它控件
 *      冲突，且 <RouterLink> 本身支持 Enter 激活，故不再移植。
 */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

import { ROUTE_NAMES } from '@/router/routes'
import type { HomeMenuItem } from '@/types/home'

const emit = defineEmits<{
  /** 播报一条提示（用于尚未开发的入口） */
  feedback: [message: string]
  /** 打开设置面板（音色选择）—— 设置没有独立页面，由 HomeView 就地弹面板 */
  settings: []
}>()

/** 「设置」项的稳定 id：它不跳页，而是就地打开音色面板 */
const SETTINGS_ITEM_ID = 'settings'

/**
 * 四条菜单项。跳转目标一律引用 ROUTE_NAMES，不写死路径字符串。
 * 「开始新故事」进入创作台（/studio）；「我的故事库」进入资源页。
 * 教程：项目目前没有对应页面，只给 feedback，不制造无效跳转。
 * 设置：无独立页面，但承载音色选择 —— 见 select() 的分支。
 */
const MENU_ITEMS: readonly HomeMenuItem[] = [
  {
    id: 'new-story',
    label: '开始新故事',
    iconPaths: ['M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0', 'M12 8.2v7.6', 'M8.2 12h7.6'],
    to: { name: ROUTE_NAMES.studio },
  },
  {
    id: 'library',
    label: '我的故事库',
    iconPaths: ['M4 5.4h4.1v13.2H4z', 'M9.6 4.2h3.7v14.4H9.6z', 'M15.6 6.6l3.6 1-3.2 11.4-3.6-1z'],
    to: { name: ROUTE_NAMES.resources },
  },
  {
    id: 'tutorial',
    label: '教程',
    iconPaths: [
      'M3.2 9.2L12 5.4l8.8 3.8-8.8 3.8z',
      'M7.4 11.6v4c0 1.2 2.1 2.2 4.6 2.2s4.6-1 4.6-2.2v-4',
    ],
    feedback: '教程 · 页面开发中',
  },
  {
    id: 'settings',
    label: '设置',
    iconPaths: [
      'M9.1 12a2.9 2.9 0 1 0 5.8 0 2.9 2.9 0 1 0-5.8 0',
      'M12 3.4v2.3',
      'M12 18.3v2.3',
      'M4.6 7.7l2 1.1',
      'M17.4 15.2l2 1.1',
      'M4.6 16.3l2-1.1',
      'M17.4 8.8l2-1.1',
    ],
  },
]

/** 选中项：标记「刚刚点过」的入口，对应参考稿的 is-active */
const activeId = ref<string | null>(null)

/** 菜单项入场动画的基准延迟与步长（对应参考稿的 nth-child 递增延迟） */
const ENTER_DELAY_BASE = 0.12
const ENTER_DELAY_STEP = 0.07

function enterDelay(index: number): string {
  return `${(ENTER_DELAY_BASE + index * ENTER_DELAY_STEP).toFixed(2)}s`
}

const navElement = ref<HTMLElement | null>(null)

/** 统一的取值选择器：RouterLink 渲染为 <a>，占位项渲染为 <button> */
const ITEM_SELECTOR = '[data-menu-item]'
const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End']

function select(item: HomeMenuItem): void {
  activeId.value = item.id

  // 设置：就地打开音色面板（音色选择已按需求从播放页移到这里）
  if (item.id === SETTINGS_ITEM_ID) {
    emit('settings')
    return
  }

  // 有真实目标时交给 <RouterLink> 处理跳转，这里只更新选中态
  if (item.feedback !== undefined) {
    emit('feedback', item.feedback)
  }
}

/**
 * 上下键在菜单项之间移动焦点。事件绑在 <nav> 上靠冒泡接管，
 * 因此不需要为每个菜单项单独挂监听，菜单项增删也不必改这里。
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!NAV_KEYS.includes(event.key)) {
    return
  }

  const items = Array.from(navElement.value?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
  if (items.length === 0) {
    return
  }

  event.preventDefault()

  const current = items.findIndex((element) => element === document.activeElement)
  let next = 0

  if (event.key === 'ArrowDown') {
    next = current < 0 ? 0 : (current + 1) % items.length
  } else if (event.key === 'ArrowUp') {
    next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
  } else if (event.key === 'End') {
    next = items.length - 1
  }

  items[next]?.focus()
}
</script>

<template>
  <nav ref="navElement" class="nw-home-menu" aria-label="主菜单" @keydown="handleKeydown">
    <template v-for="(item, index) in MENU_ITEMS" :key="item.id">
      <!-- 已有对应页面：真实跳转 -->
      <RouterLink
        v-if="item.to"
        class="nw-home-menu__item"
        :class="{ 'nw-home-menu__item--active': activeId === item.id }"
        :style="{ animationDelay: enterDelay(index) }"
        :to="item.to"
        data-menu-item
        @click="select(item)"
      >
        <span class="nw-home-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path v-for="(path, pathIndex) in item.iconPaths" :key="pathIndex" :d="path" />
          </svg>
        </span>
        <span class="nw-home-menu__label">{{ item.label }}</span>
      </RouterLink>

      <!-- 页面尚未开发：只播报提示，不做无效跳转 -->
      <button
        v-else
        class="nw-home-menu__item"
        :class="{ 'nw-home-menu__item--active': activeId === item.id }"
        :style="{ animationDelay: enterDelay(index) }"
        type="button"
        data-menu-item
        @click="select(item)"
      >
        <span class="nw-home-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path v-for="(path, pathIndex) in item.iconPaths" :key="pathIndex" :d="path" />
          </svg>
        </span>
        <span class="nw-home-menu__label">{{ item.label }}</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
.nw-home-menu {
  display: flex;
  flex-direction: column;
  gap: 11px;
  width: 100%;
  max-width: 486px;
}

/* =============================================================
 * 菜单项：平行四边形 + 白玻璃 + 悬停扫光
 * ============================================================= */
.nw-home-menu__item {
  --nw-home-menu-skew: -13deg;

  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  height: 51px;
  padding: 0 20px;
  isolation: isolate;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
  font-size: 15.5px;
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: 0.4px;
  text-align: left;
  text-decoration: none;
  text-shadow: 0 1px 0 var(--nw-color-glass-highlight);
  cursor: pointer;
  transition: transform 0.22s var(--nw-ease-out);
  /*
   * 这里用 backwards 而不是参考稿的 both：
   * 动画的 to 关键帧把 transform 钉成 none，而「动画来源」在层叠中优先于普通声明，
   * 于是 :hover 的 translateX(9px) 会被永久压掉、悬停位移完全失效。
   * backwards 只负责在延迟期间套用 from 取值，动画结束后交还给声明值，
   * 入场效果与参考稿一致，悬停位移则能正常生效。
   */
  animation: nw-home-menu-in 0.55s var(--nw-ease-out) backwards;
  -webkit-tap-highlight-color: transparent;
}

/* ---------- 主体：斜切玻璃块 ---------- */
.nw-home-menu__item::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: '';
  background-color: var(--nw-color-surface);
  background-image:
    linear-gradient(
      100deg,
      var(--nw-color-glass-highlight),
      var(--nw-color-glass-sheen) 52%,
      var(--nw-color-glass-highlight)
    ),
    linear-gradient(
      96deg,
      var(--nw-color-button-fill-primary-top),
      var(--nw-color-button-fill-primary-bottom)
    );
  border: 1.5px solid var(--nw-color-glass-edge);
  border-radius: 3px;
  box-shadow:
    var(--nw-shadow-inset-top),
    inset 0 -1px 0 var(--nw-color-border),
    var(--nw-shadow-md);
  /*
   * 只声明标准属性。构建管线会自行补上 -webkit- 前缀；
   * 反过来手写「backdrop-filter + -webkit-backdrop-filter」两条时，
   * 转换器会判定前缀已由手写覆盖、把标准那条删掉，结果 Chromium 家族
   * 完全不认（它们只支持无前缀写法），毛玻璃静默失效。
   */
  backdrop-filter: blur(var(--nw-blur-sm)) saturate(110%);
  transform: skewX(var(--nw-home-menu-skew));
  transition:
    background-color var(--nw-duration-base) var(--nw-ease-out),
    border-color var(--nw-duration-base) var(--nw-ease-out),
    box-shadow var(--nw-duration-base) var(--nw-ease-out);
}

/* ---------- 悬停扫光层 ---------- */
.nw-home-menu__item::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: '';
  background-image: linear-gradient(
    96deg,
    var(--nw-color-button-fill-primary-hover),
    var(--nw-color-accent-hover)
  );
  border-radius: 3px;
  opacity: 0;
  transform: skewX(var(--nw-home-menu-skew)) translateX(-105%);
  transition:
    transform 0.45s var(--nw-ease-out),
    opacity 0.3s var(--nw-ease-out);
}

/* ---------- 悬停 / 键盘聚焦 ---------- */
.nw-home-menu__item:hover,
.nw-home-menu__item:focus-visible {
  /* 参考稿此处用边框高亮与辉光顶替系统焦点框，视觉更贴合斜切外形 */
  outline: none;
  /* 显式钉住文字色：<RouterLink> 是 <a>，否则会被全局 a:hover 改成链接色 */
  color: var(--nw-color-text-primary);
  transform: translateX(9px);
}

.nw-home-menu__item:hover::before,
.nw-home-menu__item:focus-visible::before {
  border-color: var(--nw-color-border-strong);
  box-shadow:
    var(--nw-shadow-inset-top),
    inset 0 -1px 0 var(--nw-color-border),
    var(--nw-shadow-md),
    var(--nw-glow-accent-soft);
}

.nw-home-menu__item:hover::after,
.nw-home-menu__item:focus-visible::after {
  opacity: 1;
  transform: skewX(var(--nw-home-menu-skew)) translateX(0);
}

.nw-home-menu__item:active {
  transform: translateX(9px) scale(0.985);
  transition-duration: var(--nw-duration-fast);
}

/* ---------- 选中态 ---------- */
.nw-home-menu__item--active::before {
  border-color: var(--nw-color-border-strong);
  background-image:
    linear-gradient(
      100deg,
      var(--nw-color-glass-highlight),
      var(--nw-color-glass-sheen) 55%,
      var(--nw-color-glass-highlight)
    ),
    linear-gradient(
      96deg,
      var(--nw-color-button-fill-primary-top),
      var(--nw-color-button-fill-primary-bottom)
    );
}

/* ---------- 图标与文案 ---------- */
.nw-home-menu__icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  transition: transform 0.25s var(--nw-ease-out);
}

.nw-home-menu__icon svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: var(--nw-color-accent-strong);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke 0.25s var(--nw-ease-out);
}

.nw-home-menu__item:hover .nw-home-menu__icon,
.nw-home-menu__item:focus-visible .nw-home-menu__icon {
  transform: translateX(2px) scale(1.07);
}

.nw-home-menu__item:hover .nw-home-menu__icon svg,
.nw-home-menu__item:focus-visible .nw-home-menu__icon svg {
  stroke: var(--nw-color-accent-contrast);
}

.nw-home-menu__label {
  flex: 1 1 auto;
}

/* ---------- 入场 ---------- */
@keyframes nw-home-menu-in {
  from {
    opacity: 0;
    transform: translateX(-26px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

/* 不支持 backdrop-filter 时退化为不透明填充，保证文字可读 */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-home-menu__item::before {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (max-width: 900px) {
  /* 堆叠布局下菜单铺满一列，与下方新闻面板同宽 */
  .nw-home-menu {
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-home-menu__item {
    animation: none;
    transition: none;
  }

  .nw-home-menu__item::before,
  .nw-home-menu__item::after,
  .nw-home-menu__icon,
  .nw-home-menu__icon svg {
    transition: none;
  }

  .nw-home-menu__item:hover,
  .nw-home-menu__item:focus-visible,
  .nw-home-menu__item:active,
  .nw-home-menu__item:hover .nw-home-menu__icon,
  .nw-home-menu__item:focus-visible .nw-home-menu__icon {
    transform: none;
  }

  .nw-home-menu__item:hover::after,
  .nw-home-menu__item:focus-visible::after {
    opacity: 0;
  }
}
</style>
