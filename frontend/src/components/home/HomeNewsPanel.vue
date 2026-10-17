<script setup lang="ts">
/**
 * HomeNewsPanel —— 主界面右侧：快捷入口 + NEWS 面板
 * ---------------------------------------------------------------
 * 职责：呈现「订阅更新」快捷入口与站内公告列表。
 *
 * 移植说明（相对参考稿的 .right / .side-btn / .news）：
 *   1. NEWS 列表由参考稿里写死的四个 <li> 改为 TypeScript 数组 + v-for；
 *   2. 订阅入口在参考稿里只弹一条 toast（RSS 尚未开发），此处保持一致：
 *      渲染为 <button> 并向上抛 feedback，而不是造一个假的跳转目标；
 *   3. 公告条目不参与交互：用 <li> 呈现，并且**不给悬停位移与辉光** ——
 *      那会让条目看起来能点，点下去却什么也不发生（实测确认这属于误导）。
 *      在没有详情页之前，公告就是一段只读文本。
 */
import type { HomeNewsItem } from '@/types/home'

const emit = defineEmits<{
  /** 播报一条提示（用于尚未开发的入口） */
  feedback: [message: string]
}>()

/** 站内公告：日期 + 标题 */
const NEWS_ITEMS: readonly HomeNewsItem[] = [
  {
    id: 1,
    date: '1-4-2026',
    title: '[春季更新] Podcast Engine 1.0 正式版发布：全新故事编辑器与音效库',
  },
  {
    id: 2,
    date: '27-2-2026',
    title: '开发日志 #11 · 支线剧情分支、PHz 音频格式与更多',
  },
  {
    id: 3,
    date: '18-12-2025',
    title: '创作者访谈 #07：怎样让旁白听起来更自然',
  },
  {
    id: 4,
    date: '27-4-2025',
    title: 'Podcast Engine 0.20.2：修复若干问题并大幅提升 Windows 端性能',
  },
]

/** 订阅入口尚未接入后端订阅服务 */
const SUBSCRIBE_FEEDBACK = '订阅更新 · 功能开发中'

function requestSubscribe(): void {
  emit('feedback', SUBSCRIBE_FEEDBACK)
}
</script>

<template>
  <aside class="nw-home-news" aria-label="站内新闻">
    <div class="nw-home-news__actions">
      <button class="nw-home-news__subscribe" type="button" @click="requestSubscribe">
        <span class="nw-home-news__subscribe-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M5 11.5a7.5 7.5 0 0 1 7.5 7.5M5 5.5A13.5 13.5 0 0 1 18.5 19" />
            <circle cx="5.6" cy="18.4" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span class="nw-home-news__subscribe-label">订阅更新</span>
      </button>
    </div>

    <section class="nw-home-news__panel">
      <h2 class="nw-home-news__head">NEWS</h2>

      <ul class="nw-home-news__list">
        <li v-for="item in NEWS_ITEMS" :key="item.id" class="nw-home-news__item">
          <time class="nw-home-news__date">{{ item.date }}</time>
          <p class="nw-home-news__title">{{ item.title }}</p>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.nw-home-news {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: var(--nw-font-sans);
}

.nw-home-news__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* =============================================================
 * 快捷入口：左侧图标格 + 右侧文案的整条按钮
 * ============================================================= */
.nw-home-news__subscribe {
  display: flex;
  align-items: stretch;
  height: 54px;
  padding: 0;
  overflow: hidden;
  border: 1.5px solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-surface);
  background-image:
    linear-gradient(
      100deg,
      var(--nw-color-glass-highlight),
      var(--nw-color-glass-sheen) 60%,
      var(--nw-color-glass-highlight)
    ),
    linear-gradient(
      96deg,
      var(--nw-color-button-fill-primary-top),
      var(--nw-color-button-fill-primary-bottom)
    );
  box-shadow: var(--nw-shadow-inset-top), var(--nw-shadow-md);
  /* 只写标准属性：构建管线补前缀；手写两条会让标准那条被丢弃 */
  backdrop-filter: blur(var(--nw-blur-md)) saturate(118%);
  cursor: pointer;
  transition:
    transform 0.2s var(--nw-ease-out),
    border-color var(--nw-duration-base) var(--nw-ease-out),
    box-shadow var(--nw-duration-base) var(--nw-ease-out);
  /* backwards 而非 both：动画不能把 transform 钉住，否则悬停位移会失效 */
  animation: nw-home-news-in 0.55s var(--nw-ease-out) 0.22s backwards;
  -webkit-tap-highlight-color: transparent;
}

.nw-home-news__subscribe:hover,
.nw-home-news__subscribe:focus-visible {
  outline: none;
  border-color: var(--nw-color-border-strong);
  box-shadow: var(--nw-shadow-inset-top), var(--nw-shadow-md), var(--nw-glow-accent-soft);
  transform: translateX(-6px);
}

.nw-home-news__subscribe:active {
  transform: translateX(-6px) scale(0.99);
  transition-duration: var(--nw-duration-fast);
}

.nw-home-news__subscribe-icon {
  display: grid;
  flex: 0 0 54px;
  place-items: center;
  color: var(--nw-color-accent-strong);
  background-image: linear-gradient(
    160deg,
    var(--nw-color-glass-highlight),
    var(--nw-color-glass-sheen)
  );
  border-right: var(--nw-border-width) solid var(--nw-color-glass-edge);
}

.nw-home-news__subscribe-icon svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nw-home-news__subscribe-label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  padding: 0 20px;
  color: var(--nw-color-text-primary);
  font-size: 15.5px;
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: 0.5px;
  text-shadow: 0 1px 0 var(--nw-color-glass-highlight);
}

/* =============================================================
 * NEWS 面板
 * ============================================================= */
.nw-home-news__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1.5px solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-surface);
  background-image: linear-gradient(
    180deg,
    var(--nw-color-glass-highlight),
    var(--nw-color-glass-sheen)
  );
  box-shadow: var(--nw-shadow-inset-top), var(--nw-shadow-md);
  backdrop-filter: blur(var(--nw-blur-md)) saturate(112%);
  animation: nw-home-news-in 0.55s var(--nw-ease-out) 0.3s backwards;
}

/* 标题条：参考稿的品红渐变在本项目里落到强调色上 */
.nw-home-news__head {
  padding: 12px 20px;
  color: var(--nw-color-on-accent);
  font-size: 13.5px;
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: 3px;
  text-align: center;
  text-indent: 3px;
  text-shadow: 0 2px 6px var(--nw-color-page-bg);
  background-image: linear-gradient(
    96deg,
    var(--nw-color-accent),
    var(--nw-color-accent-strong)
  );
  border-bottom: var(--nw-border-width) solid var(--nw-color-glass-edge);
}

.nw-home-news__list {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 11px;
  min-height: 0;
  max-height: 100%;
  padding: 14px;
  overflow-y: auto;
  scrollbar-color: var(--nw-color-border-strong) transparent;
  scrollbar-width: thin;
}

.nw-home-news__list::-webkit-scrollbar {
  width: 6px;
}

.nw-home-news__list::-webkit-scrollbar-thumb {
  background-color: var(--nw-color-border-strong);
  border-radius: var(--nw-radius-pill);
}

.nw-home-news__item {
  padding: 11px 13px;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-xs);
  background-image: linear-gradient(
    180deg,
    var(--nw-color-glass-highlight),
    var(--nw-color-glass-sheen)
  );
  /* 刻意不做悬停反馈：公告条目没有点击行为，任何位移 / 辉光都在暗示「能点」 */
  cursor: default;
}

.nw-home-news__date {
  display: block;
  margin-bottom: 4px;
  color: var(--nw-color-accent-strong);
  font-size: 12px;
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: 0.6px;
  font-variant-numeric: tabular-nums;
}

.nw-home-news__title {
  color: var(--nw-color-text-primary);
  font-size: 13.5px;
  font-weight: var(--nw-font-weight-medium);
  line-height: 1.48;
}

/* =============================================================
 * 入场：自右侧滑入
 * ============================================================= */
@keyframes nw-home-news-in {
  from {
    opacity: 0;
    transform: translateX(26px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .nw-home-news__subscribe,
  .nw-home-news__panel {
    background-color: var(--nw-color-glass-fallback);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-home-news__subscribe,
  .nw-home-news__panel,
  .nw-home-news__item,
  .nw-home-news__list {
    transition: none;
  }

  .nw-home-news__subscribe,
  .nw-home-news__panel {
    animation: none;
  }

  .nw-home-news__subscribe:hover,
  .nw-home-news__subscribe:focus-visible,
  .nw-home-news__subscribe:active,
  .nw-home-news__item:hover {
    transform: none;
  }

  .nw-home-news__item {
    transition: none;
  }
}
</style>
