<script setup lang="ts">
/**
 * BaseModal —— 模态框外壳
 * ---------------------------------------------------------------
 * 只负责「壳」的部分：遮罩、居中玻璃面板、Teleport 到 body、Esc 关闭、
 * 打开时把焦点移进面板、Tab 在面板内循环（不跑到背后的页面上）。
 * 表单内容与按钮由调用方通过默认插槽 / footer 插槽提供。
 *
 * 为什么 Teleport 到 body：弹窗若留在页面某个带 z-index / filter 的容器里，
 * 容易被祖先的层叠上下文裁切或压住；挂到 body 下最稳。
 *
 * 层级：面板用 --nw-z-modal，低于 --nw-z-toast，
 * 因此弹窗打开时提示条仍然可见。
 */
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

import GlassPanel from '@/components/base/GlassPanel.vue'

defineProps<{
  /** 标题文案（同时作为 aria-labelledby 的文本） */
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()

const titleId = useId()
const overlayElement = ref<HTMLElement | null>(null)

function requestClose(): void {
  emit('close')
}

/** 面板内可聚焦的控件，用于 Tab 循环与初始聚焦 */
function getFocusables(): HTMLElement[] {
  const root = overlayElement.value
  if (!root) {
    return []
  }

  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    requestClose()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusables = getFocusables()
  if (focusables.length === 0) {
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  const inside = active !== null && overlayElement.value?.contains(active) === true

  // 正向 Tab 走到最后一个、或焦点已经跑到面板外 → 回到第一个；反向同理
  if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault()
    first?.focus()
    return
  }
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault()
    last?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)

  // 打开后把焦点交给面板里的第一个控件，键盘用户不会还停在背后的页面上
  const focusables = getFocusables()
  const preferred = focusables.find((element) => element.matches('input, select, textarea'))
  ;(preferred ?? focusables[0])?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div ref="overlayElement" class="nw-modal" @click.self="requestClose">
      <GlassPanel
        class="nw-modal__panel"
        tone="strong"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="nw-modal__head">
          <h2 :id="titleId" class="nw-modal__title">{{ title }}</h2>

          <button class="nw-modal__close" type="button" aria-label="关闭" @click="requestClose">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>

        <div class="nw-modal__body">
          <slot />
        </div>

        <footer class="nw-modal__foot">
          <slot name="footer" />
        </footer>
      </GlassPanel>
    </div>
  </Teleport>
</template>

<style scoped>
.nw-modal {
  position: fixed;
  inset: 0;
  z-index: var(--nw-z-modal);
  display: grid;
  place-items: center;
  padding: var(--nw-layout-page-gutter);
  background-color: var(--nw-color-overlay);
  backdrop-filter: blur(var(--nw-blur-sm));
  -webkit-backdrop-filter: blur(var(--nw-blur-sm));
}

/* 玻璃面板本体：材质由 GlassPanel 提供，这里只管尺寸与内部排版 */
.nw-modal__panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 46rem);
  max-height: min(86vh, 86svh);
  overflow: hidden;
  border-radius: var(--nw-radius-lg);
}

.nw-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-sm);
  padding: var(--nw-space-sm) clamp(1rem, 2.4vw, 1.5rem);
  border-bottom: var(--nw-border-width) solid var(--nw-color-border);
}

.nw-modal__title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-modal__close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: var(--nw-border-width) solid transparent;
  border-radius: var(--nw-radius-pill);
  background: none;
  color: var(--nw-color-text-tertiary);
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-modal__close svg {
  width: 16px;
  height: 16px;
}

.nw-modal__close:hover {
  color: var(--nw-color-accent-contrast);
  background-color: var(--nw-color-hover);
}

.nw-modal__close:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

.nw-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(1rem, 2.4vw, 1.5rem);
  scrollbar-color: var(--nw-color-border-strong) transparent;
  scrollbar-width: thin;
}

.nw-modal__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--nw-space-xs);
  padding: var(--nw-space-sm) clamp(1rem, 2.4vw, 1.5rem);
  border-top: var(--nw-border-width) solid var(--nw-color-border);
  background-image: linear-gradient(180deg, transparent, var(--nw-color-glass-sheen));
}

.nw-modal__body::-webkit-scrollbar {
  width: 6px;
}

.nw-modal__body::-webkit-scrollbar-thumb {
  background-color: var(--nw-color-border-strong);
  border-radius: var(--nw-radius-pill);
}

@media (prefers-reduced-motion: reduce) {
  .nw-modal__close {
    transition: none;
  }
}
</style>
