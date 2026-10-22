/**
 * 接口类型定义（前端契约）
 * ---------------------------------------------------------------
 * 全站只有**一种**响应信封：后端的统一响应体 `R<T>`（创作台 / 配音域都是它）。
 *
 * 历史：这里曾有一套 `{ success, data }` 信封（`ApiEnvelope`）与欢迎域的三个类型
 * （`WelcomeActionPayload` / `WelcomeActionData` / `WelcomeAction`），
 * 只服务于 `/api/v1/welcome/*` 与已删除的欢迎页。该页面与那套接口一并移除，
 * 相关类型随之删除 —— 需要时从 git 历史取回即可，不要在 services 层留两套解包入口。
 */

/**
 * 业务码信封（后端 `R<T>` 的对外形状）
 * ---------------------------------------------------------------
 * 与后端 `cn.edu.zut.aigcgal.R.R` 逐字段对齐：
 *   `{ code, msg, errCode, data }`。
 *
 * 成功判定只有一个口径：`code === API_SUCCESS_CODE`（见 services/api.ts）。
 */
export interface CodeEnvelope<TData> {
  /** 业务码：等于 services/api.ts 的 API_SUCCESS_CODE 才视为成功 */
  code: number
  data: TData
  /**
   * 后端给的人类可读说明（成功为「操作成功」，失败为具体原因）。
   * ⚠️ 字段名是 `msg`，不是 `message` —— 后端 `R` 里没有 message 字段。
   */
  msg?: string
  /**
   * 业务码（见后端 `BusinessCodeEnum`）：为空表示只是一次普通的成功 / 失败；
   * 有值时才需要前端**按码分支**（如 AUDIO_SEGMENT_EMPTY / BGM_FILE_REQUIRED），
   * 而不是去猜 msg 文案。
   */
  errCode?: string | null
}
