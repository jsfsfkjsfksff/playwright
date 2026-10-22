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
 * 路由表（src/router/routes.ts，完整清单以那里为准）：
 *   /                   → HomeView（主界面，默认入口）
 *   /studio             → StudioView（创作台 · 选择故事）
 *   /studio/resources   → StudioResourcesView（资源管理）
 *   /studio/operations  → StudioOperationsView（操作编辑 / 时间线）
 *   /player/:sceneId    → PlayerView（消费播放页，空 sceneId 由守卫退回 /studio）
 *   /player             → 重定向到 /studio
 *   /resources          → ResourcesView（我的故事库，占位页）
 *   /create             → 重定向到 /studio（旧地址兜底）
 *   /:pathMatch(.*)*    → 重定向到首页（已删除的 /welcome、/features 也走这条）
 *
 * 页面标题由 router/index.ts 的 afterEach 按 meta.title 写入 document.title。
 * 主题状态仍由 main.ts 统一初始化；Pinia 也在 main.ts 注册。
 *
 * 【Naive UI 的主题为什么必须挂在这里（排查记录）】
 *   Naive UI 的 `<n-config-provider>` 只对**它的子树**生效，而且**不会**穿过
 *   `<Teleport>` —— 弹窗是 Teleport 到 body 的，因此即使页面里写了 config-provider，
 *   弹窗也拿不到主题，会退回 Naive 默认的**浅色**主题（白底黑字），
 *   与站内深色玻璃拟态完全割裂。
 *   把 provider 放在根组件、包住 <RouterView> 也没用：Teleport 的目标是 body，
 *   仍在 provider 子树之外。
 *
 *   真正可行的做法是**两层一起上**：
 *     1. 本组件用 provider 包住页面 —— 覆盖非 Teleport 的常规组件（如音色单选）；
 *     2. 每个弹窗**自己**再包一层 provider（见 NaiveModalShell.vue）——
 *        覆盖 Teleport 出去的那部分。
 *   两者共用 styles/naive-theme.ts 的同一份主题对象，不会出现两套配色。
 */
import { NConfigProvider } from 'naive-ui'
import { RouterView } from 'vue-router'

import { NW_NAIVE_THEME, NW_NAIVE_THEME_OVERRIDES } from '@/styles/naive-theme'
</script>

<template>
  <!--
    root 上挂 .nw-naive-scope：naive-overrides.css 的材质覆盖都以它为作用域前缀，
    避免这些第三方 class 覆盖泄漏到站内自有组件上。
  -->
  <NConfigProvider
    class="nw-naive-scope"
    :theme="NW_NAIVE_THEME"
    :theme-overrides="NW_NAIVE_THEME_OVERRIDES"
  >
    <RouterView v-slot="{ Component }">
      <Transition name="nw-page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </NConfigProvider>
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
