import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { initTheme } from './composables/useTheme'
import { router } from './router'
import './styles/index.css'

// 主题必须在挂载前对齐，避免首屏闪烁（HTML 中的预置脚本已先写入一次）
initTheme()

// Pinia 全站注册一次；各页面的 store 放在 src/stores/ 下按需创建
createApp(App).use(createPinia()).use(router).mount('#app')
