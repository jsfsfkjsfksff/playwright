<script setup lang="ts">
/**
 * ThemeToggle —— 主题切换入口（当前为占位控件）
 * ---------------------------------------------------------------
 * 现状说明：本站目前只实现了夜间主题（themes/night.css），日间主题
 * （themes/day.css）是留好的接入位、尚无取值。因此这里的按钮**不做真实切换**
 * —— 切成 day 会因为没有日间取值而毫无视觉变化，属于「看起来能用、实则无效」，
 * 比明确说明更糟。点击后只播报「日间主题将单独设计」。
 *
 * 接入方式：日间取值补齐后，本组件改为调用 useTheme 暴露的切换方法即可，
 * 视觉与布局无需改动。
 *
 * 主题状态来源：composables/useTheme.ts（项目唯一的主题机制入口）。项目目前
 * 没有引入 Pinia，也没有 useThemeStore，因此这里接入既有的 useTheme，而不是
 * 另建一套并行的主题状态。
 */
import { computed } from 'vue'

import { useTheme, type ResolvedTheme } from '@/composables/useTheme'

const emit = defineEmits<{
  /** 触发提示播报（文案由本组件给出，页面负责显示） */
  feedback: [message: string]
}>()

const { resolvedTheme } = useTheme()

/**
 * 主题标识 → 中文名。
 * 新增主题时必须在此补充取值，否则类型检查会失败 —— 这是刻意的：
 * 漏改会让界面显示错误的主题名。
 */
const THEME_LABEL: Record<ResolvedTheme, string> = {
  night: '夜间主题',
}

const themeLabel = computed(() => THEME_LABEL[resolvedTheme.value])

/** 尚未实现的主题说明，集中一处便于后续替换为真实切换 */
const PENDING_THEME_HINT = '日间主题将单独设计，敬请期待'

function requestThemeSwitch(): void {
  emit('feedback', PENDING_THEME_HINT)
}
</script>

<template>
  <div class="nw-theme-toggle">
    <button class="nw-theme-toggle__button" type="button" @click="requestThemeSwitch">
      <span class="nw-theme-toggle__dot" aria-hidden="true" />
      <span>切换主题</span>
    </button>

    <p class="nw-theme-toggle__hint">当前：{{ themeLabel }} · 日间主题将单独设计</p>
  </div>
</template>

<style scoped>
.nw-theme-toggle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: -2px;
  padding-left: 6px;
}

/* ---------- 胶囊按钮：深玻璃底 + 状态色文字 ---------- */
.nw-theme-toggle__button {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 9px;
  padding: 7px 15px;
  border: 1.5px solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-surface-elevated);
  background-image: linear-gradient(
    96deg,
    var(--nw-color-button-fill-primary-top),
    var(--nw-color-button-fill-primary-bottom)
  );
  box-shadow: var(--nw-shadow-inset-top), var(--nw-shadow-md);
  color: var(--nw-color-success);
  font-family: var(--nw-font-sans);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: 0.5px;
  text-shadow: 0 0 12px var(--nw-color-success-soft);
  /*
   * 只声明标准属性：构建管线（Vite 8 的 CSS 转换器）会自行补 -webkit- 前缀。
   * 反过来手写「标准 + -webkit-」两条，会让标准那条被丢掉 ——
   * 见 HomeMenu 中的同类说明。
   */
  backdrop-filter: blur(var(--nw-blur-md));
  cursor: pointer;
  transition: var(--nw-transition-interactive);
  -webkit-tap-highlight-color: transparent;
}

.nw-theme-toggle__button:hover,
.nw-theme-toggle__button:focus-visible {
  border-color: var(--nw-color-border-strong);
  color: var(--nw-color-accent-contrast);
  box-shadow: var(--nw-shadow-inset-top), var(--nw-glow-accent), var(--nw-glow-accent-soft);
  transform: translateY(-1px);
}

.nw-theme-toggle__button:active {
  transform: translateY(0);
  transition-duration: var(--nw-duration-fast);
}

/* 状态指示灯：低幅度呼吸，不做高频闪烁 */
.nw-theme-toggle__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--nw-radius-circle);
  background-color: currentColor;
  box-shadow: 0 0 10px currentColor;
  animation: nw-theme-toggle-pulse 2.2s var(--nw-ease-in-out) infinite;
}

.nw-theme-toggle__hint {
  padding-left: 4px;
  color: var(--nw-color-text-tertiary);
  font-size: 12.5px;
  letter-spacing: 0.4px;
}

@keyframes nw-theme-toggle-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-theme-toggle__button {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-theme-toggle__button {
    transition: none;
  }

  .nw-theme-toggle__button:hover,
  .nw-theme-toggle__button:active {
    transform: none;
  }

  .nw-theme-toggle__dot {
    animation: none;
  }
}
</style>
