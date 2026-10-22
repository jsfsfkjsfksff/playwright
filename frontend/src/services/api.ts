/**
 * 接口路径与通用请求封装
 * ---------------------------------------------------------------
 * 只做前端该做的事：拼装请求、透传错误。
 * 不伪造响应内容，也不吞掉失败。
 *
 * 传输层用浏览器原生 fetch（项目未引入 axios），因此这里是全站唯一的请求出口：
 *   - 路径集中登记在 API_ENDPOINTS；
 *   - 解包与错误语义集中在 readCodeEnvelope。
 *
 * 响应信封只有一种：契约的 `{ code, data }`（创作台 / 配音域 / 播放域）。
 * 唯一例外是播放域的单场景接口，契约示例给的是**裸对象**，因此多一个
 * requestFlexibleJson 兼容入口（信封与裸对象都认）。
 *
 * 历史：这里曾并行维护 `{ success, data }`（欢迎页用）与 `{ code, data }` 两套信封。
 * 欢迎页与其接口域已删除，`postJson` / `readSuccessEnvelope` / `ApiEnvelope` 随之移除，
 * 避免留下第二个没人调用的解包入口。
 */
import { buildApiUrl } from './config'
import type { CodeEnvelope } from '@/types/api'

/** 接口路径集中管理，避免散落在组件中 */
export const API_ENDPOINTS = {
  /** 创作台（/studio）与配音域：资源 / 配音 / 剧情锚点与生成 */
  studio: {
    /** 资源节点：列表用完整路径，单项（改 / 删）为 /{nodeId} */
    properties: '/api/v1/properties',
    /** 全篇配音配置：POST 保存 / GET 查询（后端无路径参数，全篇唯一） */
    voices: '/api/v1/voices',
    /** 保存剧情锚点（请求体是场景数组，见 services/studio.ts 的 saveSceneAnchors） */
    anchors: '/api/v1/plan/anchors',
    /** 按锚点插值补全剧情 */
    interpolate: '/api/v1/plan/interpolate',
    /** 导出片段 */
    exportSegment: '/api/v1/plan/export-segment',
  },
  /**
   * 消费播放域（Play）：听众侧按 sceneId 拉场景节点与分支。
   * 契约示例里该接口返回的是**裸对象**（没有 { code, data } 包装），
   * 因此走 requestFlexibleJson（信封与裸对象都兼容）。
   */
  play: {
    /** 单项场景：GET /api/v1/play/scene/{sceneId} */
    scene: '/api/v1/play/scene',
  },
} as const

/** 请求失败时抛出的错误类型，便于调用方区分网络错误与业务错误 */
export class ApiRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

/** 支持的请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 查询参数：值为 undefined 或空串时会被跳过，避免拼出空参数 */
export type QueryParams = Readonly<Record<string, string | number | undefined>>

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function buildQueryString(query?: QueryParams): string {
  if (!query) {
    return ''
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue
    }
    params.set(key, String(value))
  }

  const serialized = params.toString()
  return serialized === '' ? '' : `?${serialized}`
}

/** HTTP 状态非 2xx：统一抛出，各入口共用 */
async function ensureOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new ApiRequestError(`接口返回异常状态：${response.status}`, response.status)
  }
}

/**
 * 业务码信封里代表成功的 code。
 * 契约（接口文档 v1.0）示例统一为 `"code": 200`，因此这里取 200。
 * ⚠️ 若后端改为 0 或其它取值，只改这一个常量。
 */
export const API_SUCCESS_CODE = 200

/** 业务码信封：`{ code, msg?, errCode?, data }`（与后端 `R<T>` 一致） */
async function readCodeEnvelope<TData>(response: Response): Promise<TData> {
  await ensureOk(response)

  const envelope = (await response.json()) as CodeEnvelope<TData>
  if (envelope.code !== API_SUCCESS_CODE) {
    throw new ApiRequestError(
      envelope.msg ?? `接口返回业务失败码：${envelope.code}`,
      response.status,
    )
  }

  return envelope.data
}

/**
 * 按「业务码信封」发起请求（创作台 / 配音域 /api/v1/* 全部走这里）。
 * 一个入口覆盖 GET / POST / PUT / PATCH / DELETE：不为每种方法各写一份，
 * 解包与错误语义自然保持一致。
 *
 * @param options.body  需要请求体时传入（GET / DELETE 不传）
 * @param options.query 查询参数；为空的值会被跳过
 */
export async function requestCodeJson<TData>(
  method: HttpMethod,
  path: string,
  options: { readonly body?: unknown; readonly query?: QueryParams } = {},
): Promise<TData> {
  const hasBody = options.body !== undefined

  const response = await fetch(`${buildApiUrl(path)}${buildQueryString(options.query)}`, {
    method,
    headers: hasBody ? JSON_HEADERS : { Accept: 'application/json' },
    credentials: 'same-origin',
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  return readCodeEnvelope<TData>(response)
}

/**
 * 说明：本文件只负责「真实请求」这一条路径。
 * 「是否处于演示模式」由 services/config.ts 的 API_DEMO_MODE 统一判定，
 * 具体接口在演示模式下返回什么由 services/mock/ 决定 —— 请求封装层不参与这个决策。
 */

/** 读出业务码：只认数字形态的 code，没有则返回 null（说明响应体不是信封） */
function readBusinessCode(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || !('code' in payload)) {
    return null
  }

  const code = (payload as { code?: unknown }).code
  return typeof code === 'number' ? code : null
}

/** 读出后端给的人类可读说明（错误信封一般是 code + msg） */
function readBusinessMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const source = payload as { msg?: unknown; message?: unknown }
  const raw = typeof source.msg === 'string' ? source.msg : source.message
  return typeof raw === 'string' && raw !== '' ? raw : null
}

/**
 * 按「信封或裸对象都兼容」的方式发起请求 —— 消费播放域 /play/* 使用。
 *
 * 为什么需要这个入口：
 *   创作台 /api/v1/* 统一是 `{ code, data }` 信封（见 requestCodeJson），
 *   但契约里 GET /play/scene/{sceneId} 的示例是**裸对象**（直接就是场景对象）。
 *   两种后端实现都可能出现，与其猜一种，不如两种都认。
 *
 * 判定规则（只认数字 code）：
 *   · 响应体没有数字 code        → 整体就是数据（裸对象，契约示例的形态）；
 *   · 有 code 且等于成功码 200   → 取 data 作为数据；
 *   · 有 code 但不等于 200       → 抛业务错误，并把后端 message 原样透出。
 *
 * 为什么错误分支必须透出 message：
 *   错误信封常常是 `{ code: 404, message: '场景不存在' }`，**没有 data 字段**。
 *   如果只把「同时有 code 与 data」当信封，这种响应会被当成裸对象继续往下解析，
 *   最终被误报成「数据格式不对」——把「场景不存在」说成「字段缺失」是误导，
 *   所以这里宁可把数字 code 一律视为业务码。
 *   （场景对象本身没有 code 字段，因此不会误判。）
 */
export async function requestFlexibleJson<TData>(
  method: HttpMethod,
  path: string,
  options: { readonly body?: unknown; readonly query?: QueryParams } = {},
): Promise<TData> {
  const hasBody = options.body !== undefined

  const response = await fetch(`${buildApiUrl(path)}${buildQueryString(options.query)}`, {
    method,
    headers: hasBody ? JSON_HEADERS : { Accept: 'application/json' },
    credentials: 'same-origin',
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  await ensureOk(response)

  const payload: unknown = await response.json()
  const code = readBusinessCode(payload)

  if (code === null) {
    return payload as TData
  }

  if (code !== API_SUCCESS_CODE) {
    throw new ApiRequestError(
      readBusinessMessage(payload) ?? `接口返回业务失败码：${code}`,
      response.status,
    )
  }

  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new ApiRequestError('接口返回成功码，但响应体缺少 data 字段', response.status)
  }

  return (payload as { data: unknown }).data as TData
}
