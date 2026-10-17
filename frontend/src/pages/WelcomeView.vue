<script setup lang="ts">
/**
 * WelcomeView —— 欢迎页
 * ---------------------------------------------------------------
 * 构图严格对齐参考图，自上而下分三层：
 *   1. 标题层：居中“欢迎”+ 两侧细线与几何光点
 *   2. 中央视觉层：AudioOrb 声音主体
 *   3. 操作层：纵向排列的“进入”“教程”两枚宽幅按钮
 *
 * 主题说明：本页不写任何主题专属色值。日间 / 夜间完全共用同一套 DOM 与布局，
 * 仅由 tokens.css 中的同名令牌决定外观，因此切换主题不会引起任何位移或尺寸变化。
 *
 * 接口说明：按钮会真实调用 services/welcome.ts。后端尚未接入时该层返回
 * 本地模拟响应，页面据实播报「后端接口待接入」，不伪装成业务已完成。
 *
 * 导航说明：「进入」成功后跳转到功能选择页（第二个页面）；「教程」的目标页面
 * 尚未开发，因此只完成请求调用与状态反馈，不做无依据的跳转。
 * 左上角另有「返回首页」入口：本页目前只能通过 /welcome 直接访问，
 * 不给返回入口就会变成死胡同（只能靠浏览器后退）。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

import AudioOrb from '@/components/audio/AudioOrb.vue'
import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { requestWelcomeAction, isWelcomeBackendPending, WELCOME_ACTION_LABEL } from '@/services/welcome'
import type { WelcomeAction } from '@/types/api'

const router = useRouter()

/** 正在请求中的动作；用于按钮加载态与防重复提交 */
const pendingAction = ref<WelcomeAction | null>(null)

/** 状态播报文案（屏幕阅读器可见） */
const liveMessage = ref('')

/* =============================================================
 * 可见提示条（ToastPill）
 * ============================================================= */

const TOAST_DURATION = 1900

const toastMessage = ref('')
const toastVisible = ref(false)

/** 定时器句柄：不参与渲染，因此用普通变量而不是 ref */
let toastTimer = 0

function notify(message: string): void {
  toastMessage.value = message
  toastVisible.value = true

  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, TOAST_DURATION)
}

/**
 * 统一的结果反馈：无障碍播报 + 可见提示条。
 * 只有「进入成功」这一条不发提示条 —— 它紧接着就跳转到功能选择页，
 * 页面会立刻卸载，提示条根本来不及被看见，跳转本身就是成功反馈。
 */
function report(message: string): void {
  liveMessage.value = message
  notify(message)
}

async function runAction(action: WelcomeAction): Promise<void> {
  if (pendingAction.value) {
    return
  }

  pendingAction.value = action
  liveMessage.value = `${WELCOME_ACTION_LABEL[action]}中`

  try {
    const result = await requestWelcomeAction(action)

    // 「进入」：后端确认放行、或后端尚未接入时，都进入功能选择页
    // （前端路由属于前端职责，不依赖后端返回跳转地址）
    if (action === 'enter') {
      if (isWelcomeBackendPending || result.accepted) {
        await router.push({ name: ROUTE_NAMES.features })
        return
      }
      report('进入请求已被拒绝')
      return
    }

    if (isWelcomeBackendPending) {
      // 后端未接入：如实说明，不声称已完成。
      report(`${WELCOME_ACTION_LABEL[action]}操作已触发，后端接口待接入`)
      return
    }

    report(
      result.accepted
        ? `${WELCOME_ACTION_LABEL[action]}成功`
        : `${WELCOME_ACTION_LABEL[action]}请求已被拒绝`,
    )
  } catch (error) {
    report(`${WELCOME_ACTION_LABEL[action]}失败，请稍后重试`)
    console.error('[welcome] 接口调用失败', error)
  } finally {
    pendingAction.value = null
  }
}

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
})

const isEnterPending = computed(() => pendingAction.value === 'enter')
const isTutorialPending = computed(() => pendingAction.value === 'tutorial')
</script>

<template>
  <div class="nw-welcome">
    <PageBackdrop />

    <!-- 返回入口：本页的上一级是主界面 -->
    <div class="nw-welcome__utility">
      <BackLink label="返回首页" :to="{ name: ROUTE_NAMES.home }" />
    </div>

    <div class="nw-welcome__content">
      <!-- 1. 标题层 -->
      <PageHeader class="nw-welcome__header" title="欢迎" />

      <!-- 2. 中央视觉层 -->
      <div class="nw-welcome__stage">
        <AudioOrb class="nw-welcome__orb" />
      </div>

      <!-- 3. 操作层 -->
      <nav class="nw-welcome__actions" aria-label="欢迎页操作">
        <AppButton
          class="nw-welcome__button nw-welcome__button--enter"
          variant="primary"
          size="xl"
          notched
          block
          :loading="isEnterPending"
          loading-label="进入请求处理中"
          @click="runAction('enter')"
        >
          <template #leading>
            <svg class="nw-welcome__button-glyph" viewBox="0 0 20 12" aria-hidden="true" focusable="false">
              <g fill="currentColor">
                <rect x="0" y="4.6" width="1.4" height="2.8" rx="0.7" />
                <rect x="3.4" y="3.2" width="1.4" height="5.6" rx="0.7" />
                <rect x="6.8" y="1.6" width="1.4" height="8.8" rx="0.7" />
              </g>
            </svg>
          </template>

          进入

          <template #trailing>
            <svg class="nw-welcome__button-glyph" viewBox="0 0 20 12" aria-hidden="true" focusable="false">
              <g fill="currentColor">
                <rect x="11.8" y="1.6" width="1.4" height="8.8" rx="0.7" />
                <rect x="15.2" y="3.2" width="1.4" height="5.6" rx="0.7" />
                <rect x="18.6" y="4.6" width="1.4" height="2.8" rx="0.7" />
              </g>
            </svg>
          </template>
        </AppButton>

        <AppButton
          class="nw-welcome__button nw-welcome__button--tutorial"
          variant="secondary"
          size="xl"
          notched
          block
          :loading="isTutorialPending"
          loading-label="教程请求处理中"
          @click="runAction('tutorial')"
        >
          <template #leading>
            <svg class="nw-welcome__button-glyph" viewBox="0 0 20 12" aria-hidden="true" focusable="false">
              <g fill="currentColor">
                <rect x="0" y="4.6" width="1.4" height="2.8" rx="0.7" />
                <rect x="3.4" y="3.2" width="1.4" height="5.6" rx="0.7" />
                <rect x="6.8" y="1.6" width="1.4" height="8.8" rx="0.7" />
              </g>
            </svg>
          </template>

          教程

          <template #trailing>
            <svg class="nw-welcome__button-glyph" viewBox="0 0 20 12" aria-hidden="true" focusable="false">
              <g fill="currentColor">
                <rect x="11.8" y="1.6" width="1.4" height="8.8" rx="0.7" />
                <rect x="15.2" y="3.2" width="1.4" height="5.6" rx="0.7" />
                <rect x="18.6" y="4.6" width="1.4" height="2.8" rx="0.7" />
              </g>
            </svg>
          </template>
        </AppButton>
      </nav>
    </div>

    <!-- 状态播报：status 自带 aria-live，语言随交互更新 -->
    <p class="nw-visually-hidden" role="status">{{ liveMessage }}</p>

    <!-- 可见提示条：成功 / 失败 / 待接入都用同一条提示，不新增页面文案 -->
    <ToastPill :message="toastMessage" :visible="toastVisible" />
  </div>
</template>

<style scoped>
/* =============================================================
 * 页面骨架：全屏纵向三段式构图
 * ============================================================= */
.nw-welcome {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
}

/* 左上角返回入口：绝对定位，不参与中段的纵向居中构图 */
.nw-welcome__utility {
  position: absolute;
  top: var(--nw-layout-header-inset);
  left: var(--nw-layout-page-gutter);
  z-index: var(--nw-z-content);
}

.nw-welcome__content {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: clamp(1rem, 2.4vh, 2rem);
  width: 100%;
  max-width: var(--nw-layout-stage-max);
  margin-inline: auto;
  padding-block: var(--nw-layout-header-inset) clamp(1.25rem, 4.4vh, 3rem);
  padding-inline: var(--nw-layout-page-gutter);
}

/* =============================================================
 * 1. 标题层
 * ============================================================= */
.nw-welcome__header {
  flex-shrink: 0;
}

/* =============================================================
 * 2. 中央视觉层
 * 使用 flex: 1 占据剩余空间，保证球体在任何视口高度下都居中且不挤压按钮
 * ============================================================= */
.nw-welcome__stage {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 0;
}

.nw-welcome__orb {
  width: min(88vw, 62vh, 640px);
  /* 声场范围略大于球体本身，允许溢出到舞台留白区 */
  max-width: none;
}

/* =============================================================
 * 3. 操作层
 * ============================================================= */
.nw-welcome__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.875rem, 2.4vh, 1.75rem);
  width: min(92%, 800px);
  flex-shrink: 0;
}

.nw-welcome__button {
  /* 宽高比常量：与参考图一致，配合 max-height 保证两枚按钮比例稳定 */
  --nw-button-aspect: 12.2;

  width: 100%;
  aspect-ratio: var(--nw-button-aspect);
  max-height: clamp(50px, 6.2vh, 72px);
}

/* 按钮文字两侧的波形装饰：极细，不参与信息传达 */
.nw-welcome__button-glyph {
  width: 20px;
  height: 12px;
  color: currentColor;
  opacity: 0.62;
  transition: opacity var(--nw-duration-base) var(--nw-ease-out);
}

.nw-welcome__button:hover .nw-welcome__button-glyph {
  opacity: 0.9;
}

/* =============================================================
 * 响应式适配
 * ============================================================= */

/* 窄屏：收紧标题字距，避免两侧装饰线被挤出视口 */
@media (max-width: 767px) {
  .nw-welcome__content {
    padding-block: clamp(1.25rem, 5vh, 2.25rem) clamp(1.5rem, 4.5vh, 2.5rem);
  }

  .nw-welcome__orb {
    width: min(94vw, 46vh, 420px);
  }

  .nw-welcome__actions {
    width: 100%;
  }

  .nw-welcome__button {
    max-height: 64px;
  }
}

/* 横屏矮视口：压缩纵向留白，防止球体与按钮重叠 */
@media (max-height: 620px) and (min-width: 768px) {
  .nw-welcome__orb {
    width: min(70vw, 52vh, 460px);
  }
}
</style>
