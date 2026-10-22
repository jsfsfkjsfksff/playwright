<script setup lang="ts">
/**
 * NaiveModalShell —— Teleport 弹窗的 Naive 主题外壳
 * ---------------------------------------------------------------
 * 【为什么需要这个组件（踩过的坑，务必先读）】
 *   Naive UI 的 `<n-config-provider>` 只对**它的子树**生效，且**不穿过 `<Teleport>`**。
 *   而弹窗（`n-modal`）会 Teleport 到 `body`，于是：
 *     · App.vue 根部包的 provider —— 只挡得住常规组件；
 *     · 弹窗在 body 下，**在 provider 子树之外**，拿不到主题
 *       → 退回 Naive 默认**浅色**主题（白底黑字），与站内深色科幻风格割裂。
 *   这正是「存档弹窗白底黑字」的根因。
 *
 *   解法：在 **Teleport 的目标位置**再包一层 provider，让弹窗与主题处在同一棵子树里。
 *   本组件就是把 provider 送进 Teleport 的那层壳 ——
 *   这里用 Vue 的 `<Teleport to="body">` 把 provider 与弹窗一起送到 body。
 *
 * 【为什么不去掉弹窗自身的 Teleport】
 *   想过让 `<n-modal :to="false">` 就地渲染，省掉这层壳。**这条路不通**：
 *   1. `to` 的类型是 `[String, Object]`，传 `false` 会被 Vue 的类型校验拒绝，
 *      属性被静默忽略（控制台只有一行 warn），弹窗**根本不会渲染**；
 *   2. Naive 把弹窗交给 vueuc 的 `VLazyTeleport`，它确实有 `disabled` 能就地渲染，
 *      但 `n-modal` **没有把这个 prop 暴露出来**（Modal.mjs:244 只传 to 与 show）。
 *   所以「留在原地」只能由我们在外面补一层 Teleport 来达成，方向相反但结果一致。
 *
 * 【配色为什么直接取 naive-theme.ts 而不做成 prop】
 *   配色只能有一个来源。做成 prop 就会出现「某个弹窗传了别的配色」的情况，
 *   而弹窗恰恰最需要与页面一致。要改配色请改 naive-theme.ts。
 *
 * 【样式作用域（另一个坑）】
 *   不要给 `n-modal` 传 marker class 做作用域：
 *   n-modal 内部（BodyWrapper.mjs:279）会把 `$attrs` 的 class 合并**两次**，
 *   传字符串或数组都会在 DOM 上渲染出重复 class，调用方无法避免。
 *   因此覆盖层以 Naive 自己稳定的 `.n-modal-body-wrapper` 为锚点，
 *   见 styles/naive-overrides.css 的 Modal 段。
 */
import { NConfigProvider } from 'naive-ui'

import { NW_NAIVE_THEME, NW_NAIVE_THEME_OVERRIDES } from '@/styles/naive-theme'
</script>

<template>
  <!--
    把 provider 一并送进 body，与 n-modal 的 Teleport 目标一致 ——
    这样弹窗就落在这个 provider 的子树内，主题生效。
    （若只 Teleport 弹窗而 provider 留在页面里，弹窗依然拿不到主题。）
  -->
  <Teleport to="body">
    <NConfigProvider :theme="NW_NAIVE_THEME" :theme-overrides="NW_NAIVE_THEME_OVERRIDES">
      <slot />
    </NConfigProvider>
  </Teleport>
</template>
