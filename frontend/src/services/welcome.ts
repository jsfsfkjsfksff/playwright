/**
 * 欢迎页接口封装
 * ---------------------------------------------------------------
 * 职责：把 UI 动作转换为一次后端调用，并明确区分三种状态：
 *   1. 已接入后端  → 真实请求
 *   2. 未接入后端  → 本地模拟响应（仅用于呈现实时交互状态）
 *   3. 请求失败    → 原样抛出，由调用方展示失败与重试
 *
 * ⚠️ 后端**没有**「欢迎域」：mid 模块只有 properties / voices / plan 三个 Controller，
 *    因此这里**先不管** —— 无论 .env.local 是否关闭 Mock，都继续走本地模拟响应，
 *    避免「进入 / 教程」两个按钮变成 404。后端补上后把 WELCOME_BACKEND_READY 改为 true 即可。
 *    届时接口定义如下：
 *      POST /api/v1/welcome/enter、POST /api/v1/welcome/tutorial
 *      入参：{ locale: string }
 *      出参：{ code, msg, data: { accepted: boolean, redirectUrl?: string } }
 */
import { API_ENDPOINTS, postJson } from './api'
import { API_MOCK_LATENCY } from './config'
import type { WelcomeAction, WelcomeActionData, WelcomeActionPayload } from '@/types/api'

/**
 * 后端是否已提供欢迎域接口。
 * 当前为 false：后端没有对应 Controller，所以这一域始终由前端模拟（后端没有的先不管）。
 * 显式标注 boolean，是为了让「关闭 Mock」这条真实分支保留下来而不是被判成不可达代码。
 */
const WELCOME_BACKEND_READY: boolean = false

/** 是否处于「前端可交互、后端未接入」状态，UI 据此展示待接入提示 */
export const isWelcomeBackendPending = !WELCOME_BACKEND_READY

function buildMockResponse(): Promise<WelcomeActionData> {
  // 本地模拟：不伪造“已完成业务”的结果，accepted 保持 false，
  // 仅用于让加载态与状态播报可以被真实触发和验证。
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ accepted: false })
    }, API_MOCK_LATENCY)
  })
}

/**
 * 触发欢迎页动作。
 * @param action 动作类型（进入 / 教程）
 */
export function requestWelcomeAction(action: WelcomeAction): Promise<WelcomeActionData> {
  const path = action === 'enter' ? API_ENDPOINTS.enter : API_ENDPOINTS.tutorial
  const payload: WelcomeActionPayload = { locale: document.documentElement.lang || 'zh-CN' }

  if (!WELCOME_BACKEND_READY) {
    return buildMockResponse()
  }

  return postJson<WelcomeActionData>(path, payload)
}

/** 供 UI 提示文案使用：进入 / 教程 对应的中文名 */
export const WELCOME_ACTION_LABEL: Record<WelcomeAction, string> = {
  enter: '进入',
  tutorial: '教程',
}