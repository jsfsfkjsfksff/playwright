<script setup lang="ts">
/**
 * App 根组件
 * ---------------------------------------------------------------
 * 渲染当前路由对应的页面，并统一处理页面切换过渡。
 *
 * 变更说明：更早的版本里本文件直接挂载主界面 HomeView、不经过路由出口，
 * 结果是任何 router.push 都只改地址、不换画面。现在改由 <RouterView> 渲染，
 * 站内跳转真实生效；而 `/` 依旧指向主界面 —— 打开应用看到的就是这张主菜单。
 *
 * 路由表（src/router/routes.ts）：
 *   /          → HomeView（主界面，默认入口）
 *   /welcome   → WelcomeView（欢迎页，保留可用）
 *   /features  → FeatureView（功能选择页）
 *   /studio    → StudioView（创作台）
 *   /create    → 重定向到 /studio（旧地址兜底）
 *   /resources → ResourcesView（资源，占位）
 *
 * 主题状态仍由 main.ts 统一初始化；Pinia 也在 main.ts 注册。
 */
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="nw-page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>

<style scoped>
/* 页面切换：淡入 + 极轻微位移，时长克制 */
.nw-page-enter-active,
.nw-page-leave-active {
  transition:
    opacity var(--nw-duration-base) var(--nw-ease-out),
    transform var(--nw-duration-base) var(--nw-ease-out);
}

.nw-page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.nw-page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .nw-page-enter-active,
  .nw-page-leave-active {
    transition: none;
  }

  .nw-page-enter-from,
  .nw-page-leave-to {
    transform: none;
  }
}
</style>
