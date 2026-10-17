/**
 * 接口类型定义（前端契约）
 * ---------------------------------------------------------------
 * ⚠️ 待接入：以下结构为前端约定的请求/响应契约，
 *    需后端按此实现；字段如有调整需同步更新本文件与 services 层。
 */

/** 通用业务信封（项目现存接口：欢迎页） */
export interface ApiEnvelope<TData> {
  success: boolean
  data: TData
  message?: string
}

/**
 * 业务码信封（创作台 /api/v1/* 契约）
 * ---------------------------------------------------------------
 * 项目现存接口用 `{ success, data }`；创作台系列接口按后端契约用 `{ code, data }`。
 * 两种信封在 services/api.ts 里各有一个解包入口（postJson / requestCodeJson），
 * 调用方不要混用。
 */
export interface CodeEnvelope<TData> {
  /** 业务码：等于 services/api.ts 的 API_SUCCESS_CODE 才视为成功 */
  code: number
  data: TData
  /**
   * 后端统一响应体（cn.edu.zut.aigcgal.R.R）里的说明字段名是 **msg**，
   * 成功时为「操作成功」，失败时为具体原因（可用 error 重载覆盖）。
   */
  msg?: string
  /** 兼容写法：若后端改用 message，同样能读出说明 */
  message?: string
  /**
   * 业务码（后端 cn.edu.zut.aigcgal.R.BusinessCodeEnum），
   * 只有业务冲突（HTTP 409）这类需要前端**按码分支**的失败才带；
   * 普通成功 / 失败为 null，按 code + msg 处理即可。
   */
  errCode?: string | null
}

/** 欢迎页动作入参（进入 / 教程） */
export interface WelcomeActionPayload {
  /** 界面语言，便于后端返回对应文案 */
  locale: string
}

/** 欢迎页动作响应 */
export interface WelcomeActionData {
  /** 是否放行 */
  accepted: boolean
  /** 后端可下发的跳转地址（可选） */
  redirectUrl?: string
}

/** 欢迎页动作类型 */
export type WelcomeAction = 'enter' | 'tutorial'
