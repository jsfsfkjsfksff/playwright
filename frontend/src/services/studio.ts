/**
 * 创作台接口封装
 * ---------------------------------------------------------------
 * 契约来源：《交互式播客引擎 API 接口文档 (v1.0 严格对齐版)》，基础路径 /api/v1。
 * 职责：把创作台的 UI 动作转换为后端调用，并保持与 services/welcome.ts 一致的三态：
 *   1. 已接入后端 → 真实请求（走 api.ts 的 requestCodeJson，按 `{ code, data }` 信封解包，
 *      契约的成功码是 200，见 api.ts 的 API_SUCCESS_CODE）
 *   2. 演示模式   → 返回 src/services/mock/ 里的本地假数据，链路可完整走通
 *   3. 请求失败   → 原样抛出 ApiRequestError，由调用方展示失败与重试
 *
 * 【演示模式（Mock）为什么必须收口在这一层】
 *   页面与 store 只认「调用这个函数会拿到契约形状的数据」，不关心数据从哪来。
 *   假数据放在这里，接入真实后端时只删本文件的 mock 分支即可，store 与组件零改动。
 *
 * 本层的返回类型一律是**契约原文的 data 形状**（可能很轻量），
 * 需要完整视图模型时由 stores/studio.ts 负责拼装，不在这里替后端补字段。
 *
 * ⚠️ 后端**尚未实现**的接口（见下方 BACKEND_READY）：无论是否接入后端都继续走 Mock，
 *    避免「编辑 / 删除资源」「导出片段」「播放场景」变成点不通的死链。
 *
 * 后端**已实现**、前端按原文接入的接口（对应 mid 模块的 PropertyController / VoiceController /
 * PEngineController，统一响应体是 `{ code, msg, data }`）：
 *    POST   /api/v1/properties               新建资源节点（回执只有 nodeId + status）
 *    GET    /api/v1/properties?type=          资源列表（轻量：nodeId / name / type）
 *    POST   /api/v1/voices                    保存全篇配音配置（全篇唯一，不带角色 id）
 *    GET    /api/v1/voices                     查询全篇配音配置（未配置返回 200 + 默认值）
 *    POST   /api/v1/plan/anchors              保存剧情锚点（请求体即锚点数组）
 *    POST   /api/v1/plan/interpolate           插值补全剧情（请求体对应后端 StepRequest）
 *    接入方式：在 frontend/.env.local 写入
 *      VITE_API_MOCK=false            # 唯一开关
 *      VITE_API_BASE_URL=<后端域名>    # 仅前后端不同源时需要；同源留空即可
 *    UI 层无需改动。
 *
 * TODO: 待后端接入，当前为演示用 Mock —— 下面每个函数里的 Mock 分支
 *       都是临时代码，后端补全接口后连同 src/services/mock/ 整个目录一起删除。
 */
import { API_ENDPOINTS, ApiRequestError, requestCodeJson, requestFlexibleJson } from './api'
import { API_DEMO_MODE } from './config'
import {
  mockCreateProperty,
  mockDeleteProperty,
  mockExportSegment,
  mockGetPlayScene,
  mockGetVoiceConfig,
  mockInterpolatePlan,
  mockListProperties,
  mockReadAnchors,
  mockSaveSceneAnchors,
  mockSaveVoiceConfig,
  mockUpdateProperty,
  setMockAnchors,
} from './mock/studioBackend'
import type {
  ExportSegmentData,
  ExportSegmentRequest,
  InterpolateRequest,
  InterpolateResultData,
  PlayEdge,
  PlayScene,
  PlaySubtitleCue,
  PropertyCreatePayload,
  PropertyCreateResult,
  PropertyListData,
  PropertyType,
  PropertyUpdatePayload,
  PropertyUpdateResult,
  SceneAnchor,
  SceneAnchorListData,
  VoiceConfig,
  VoiceConfigData,
} from '@/types/studio'

/**
 * 是否处于「演示模式（Mock 数据）」。
 * 为 true 时本文件不发出任何真实网络请求，全部返回本地假数据；UI 据此显示演示模式提示。
 */
export const isStudioMockMode: boolean = API_DEMO_MODE

/**
 * 后端是否已实现某个接口 —— 后端没有的先不管。
 *
 * 本项目后端只有 properties / voices / plan 三个 Controller，因此下面这四项**尚未实现**，
 * 无论是否接入后端都继续由 Mock 提供，保证
 * 「主页 → 选择故事 → 资源添加 → 操作编辑 → 一键生成 → 播放页」这条链路仍然点得通。
 * 后端补上对应接口后，把这里改成 true 即可自动切到真实请求。
 */
const BACKEND_READY = {
  /** PUT /api/v1/properties/{nodeId} */
  updateProperty: false,
  /** DELETE /api/v1/properties/{nodeId} */
  deleteProperty: false,
  /** POST /api/v1/plan/export-segment */
  exportSegment: false,
  /** GET /api/v1/play/scene/{sceneId} */
  playScene: false,
} as const

/** 导出成品是否仍来自本地 Mock —— 界面用它说明成品来源，不能说成「后端已交付」 */
export const isExportMockMode: boolean = isStudioMockMode || !BACKEND_READY.exportSegment

/** 播放场景是否仍来自本地 Mock —— 播放页据此说明场景来源 */
export const isPlayMockMode: boolean = isStudioMockMode || !BACKEND_READY.playScene

/** 单项资源的路径：`/api/v1/properties/{nodeId}` */
function propertyPath(nodeId: string): string {
  return `${API_ENDPOINTS.studio.properties}/${encodeURIComponent(nodeId)}`
}

/* =============================================================
 * 资源：角色 / 规则 / 实体
 * ============================================================= */

/**
 * 新建资源节点 —— POST /api/v1/properties
 * 契约回执只有 `{ nodeId, status }`：**不含** name / description / attributes，
 * 调用方（stores/studio.ts）必须把提交内容与回执拼成视图模型。
 */
export async function createProperty(
  payload: PropertyCreatePayload,
): Promise<PropertyCreateResult> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockCreateProperty(payload)
  }
  return requestCodeJson<PropertyCreateResult>('POST', API_ENDPOINTS.studio.properties, {
    body: payload,
  })
}

/**
 * 更新资源节点 —— PUT /api/v1/properties/{nodeId}
 * ⚠️ 后端尚未实现该接口（BACKEND_READY.updateProperty = false），因此本条**始终**走 Mock；
 *    路径与回执形状是按 REST 惯例假定的（回执假定与 POST 同形）。后端补上后把开关改为 true，
 *    若回执不一致，再同步改 PropertyUpdateResult。
 */
export async function updateProperty(
  nodeId: string,
  payload: PropertyUpdatePayload,
): Promise<PropertyUpdateResult> {
  if (isStudioMockMode || !BACKEND_READY.updateProperty) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockUpdateProperty(nodeId, payload)
  }
  return requestCodeJson<PropertyUpdateResult>('PUT', propertyPath(nodeId), { body: payload })
}

/** 删除资源节点 —— DELETE /api/v1/properties/{nodeId}（⚠️ 同上，后端尚未实现，始终走 Mock） */
export async function deleteProperty(nodeId: string): Promise<void> {
  if (isStudioMockMode || !BACKEND_READY.deleteProperty) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockDeleteProperty(nodeId)
  }
  // 删除接口的 data 部分前端不消费，按 null 解包即可
  await requestCodeJson<null>('DELETE', propertyPath(nodeId))
}

/**
 * 查询资源节点列表 —— GET /api/v1/properties
 * 契约原文是「一个干净的 JSON 数组」，元素只有 `{ nodeId, name, type }`（不分页）。
 * @param type 不传则返回宇宙中所有节点
 */
export async function listProperties(type?: PropertyType): Promise<PropertyListData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock（同样只回轻量字段，不替后端补详情）
    return mockListProperties(type)
  }
  return requestCodeJson<PropertyListData>('GET', API_ENDPOINTS.studio.properties, {
    query: type ? { type } : undefined,
  })
}

/* =============================================================
 * 配音（全篇唯一，与资源无关）
 * ============================================================= */

/** 保存全篇配音配置 —— POST /api/v1/voices（全篇唯一，重复提交只更新同一条） */
export async function saveVoiceConfig(payload: VoiceConfig): Promise<VoiceConfigData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockSaveVoiceConfig(payload)
  }
  return requestCodeJson<VoiceConfigData>('POST', API_ENDPOINTS.studio.voices, { body: payload })
}

/**
 * 查询全篇配音配置 —— GET /api/v1/voices（**无路径参数**）
 * 未配置时后端同样返回 200 + 默认值（data.configured = false），不会 404。
 */
export async function getVoiceConfig(): Promise<VoiceConfigData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockGetVoiceConfig()
  }
  return requestCodeJson<VoiceConfigData>('GET', API_ENDPOINTS.studio.voices)
}

/* =============================================================
 * 剧情锚点与生成
 * ============================================================= */

/**
 * 保存剧情锚点 —— POST /api/v1/plan/anchors
 * 请求体直接是锚点数组，不额外包一层（数组元素即契约里的
 * `{ sceneId, text, speaker, timeStage }`，其中 timeStage 是数字坐标）。
 * ⚠️ 契约未明确收单对象还是数组（文档给的是两个并列对象），当前按数组实现。
 */
export async function saveSceneAnchors(
  anchors: readonly SceneAnchor[],
): Promise<SceneAnchorListData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockSaveSceneAnchors(anchors)
  }
  return requestCodeJson<SceneAnchorListData>('POST', API_ENDPOINTS.studio.anchors, {
    body: anchors,
  })
}

/**
 * 演示模式专用：把当前锚点同步给本地假后端。
 *
 * 两个用途：
 *   1. 「一键生成」需要知道锚点 —— `POST /plan/interpolate` 的请求体（StepRequest）里
 *      **没有锚点**，真实后端从自己的库里读，假后端同样需要一个来源；
 *   2. 锚点变动时顺带落盘（假后端会写 localStorage），刷新后锚点还在。
 * 真实后端模式下它是空操作。
 *
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function syncMockAnchors(anchors: readonly SceneAnchor[]): void {
  if (!isStudioMockMode) {
    return
  }
  setMockAnchors(anchors)
}

/**
 * 演示模式专用：回读假后端持有的锚点（已持久化在浏览器本地），
 * 让「刷新页面后时间线还在」成为可能。
 *
 * ⚠️ 契约**没有**「查询锚点」接口（只有 POST /plan/anchors），所以：
 *   - 真实后端模式下本函数返回空数组，调用方**必须自己判断模式**，
 *     绝不能拿这个空数组去覆盖会话里已有的时间线；
 *   - store 里的 fetchAnchors 就是这么做的。
 *
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function readMockAnchors(): SceneAnchorListData {
  return isStudioMockMode ? mockReadAnchors() : []
}

/**
 * 按锚点插值补全剧情 —— POST /api/v1/plan/interpolate
 * 请求体严格对应后端 StepRequest（注意 MustBeSceneId 的大写 M；
 * static 为 true 时 layer 无效）。
 * ⚠️ 契约只说「返回 200 状态码，表示图谱已成功裂变并缝合」，未定义 data 结构；
 *    这里按 InterpolateResultData 假定，待后端确认。
 */
export async function interpolatePlan(
  payload: InterpolateRequest,
): Promise<InterpolateResultData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock（用同步进来的锚点按时间线连成分支）
    return mockInterpolatePlan(payload)
  }
  return requestCodeJson<InterpolateResultData>('POST', API_ENDPOINTS.studio.interpolate, {
    body: payload,
  })
}

/**
 * 导出片段 —— POST /api/v1/plan/export-segment
 * ⚠️ 后端尚未实现该接口（BACKEND_READY.exportSegment = false），因此本条**始终**走 Mock；
 *    契约定死了「导出不能由前端直接截取后端返回的 list」，成品必须由后端交付，
 *    所以后端补上之前宁可给本地合成的静音音频，也不在前端自行拼接。
 */
export async function exportSegment(payload: ExportSegmentRequest): Promise<ExportSegmentData> {
  if (isStudioMockMode || !BACKEND_READY.exportSegment) {
    // TODO: 待后端接入，当前为演示用 Mock（成品是本地合成的静音音频地址）
    return mockExportSegment(payload.sceneIds)
  }
  return requestCodeJson<ExportSegmentData>('POST', API_ENDPOINTS.studio.exportSegment, {
    body: payload,
  })
}

/* =============================================================
 * 消费播放域（Play）
 * ============================================================= */

/** 单场景路径：`/api/v1/play/scene/{sceneId}` */
function playScenePath(sceneId: string): string {
  return `${API_ENDPOINTS.play.scene}/${encodeURIComponent(sceneId)}`
}

/** 把任意值收敛成字符串（缺字段 / 类型不对时给空串，而不是把 undefined 传进界面） */
function readText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

/**
 * 把一条分支收敛成 PlayEdge。
 * 返回 null 表示这条分支不可用（缺 targetScene 或没有 sceneId），由调用方丢弃并计数 ——
 * 宁可少一个点不动的选项，也不要渲染出点下去没有反应的卡片。
 */
function readEdge(value: unknown): PlayEdge | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const raw = value as Record<string, unknown>
  const target = readPlayScene(raw.targetScene, 0)
  if (target === null) {
    return null
  }

  return {
    action: readText(raw.action),
    condition: readText(raw.condition),
    targetScene: target,
  }
}

/**
 * 把后端返回的场景对象收敛成 PlayScene。
 *
 * `depth` 是递归深度保护：
 *   契约保证只有一层嵌套（targetScene.edges 恒为空），但真实后端若返回环形结构
 *   （targetScene 指回祖先），无保护的递归会直接把页面挂死。这里最多下探一层，
 *   第二层的 edges 强制为空数组 —— 与后端 @JsonIgnoreProperties("edges") 的行为一致。
 */
function readPlayScene(value: unknown, depth: number): PlayScene | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const raw = value as Record<string, unknown>
  const sceneId = readText(raw.sceneId)
  if (sceneId === '') {
    return null
  }

  const edges: PlayEdge[] = []
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : []

  if (depth === 0) {
    for (const item of rawEdges) {
      const edge = readEdge(item)
      if (edge !== null) {
        edges.push(edge)
      }
    }
  }

  const scene: PlayScene = {
    sceneId,
    text: readText(raw.text),
    speaker: readText(raw.speaker),
    audioUrl: readText(raw.audioUrl),
    edges,
  }

  const id = raw.id
  if (typeof id === 'string' || typeof id === 'number') {
    scene.id = id
  }

  const subtitles = readSubtitles(raw.subtitles)
  if (subtitles.length > 0) {
    scene.subtitles = subtitles
  }

  return scene
}

/** 真实字幕时间轴（契约未定义）：只有形状完全可用时才采信，否则返回空数组走估算 */
function readSubtitles(value: unknown): PlaySubtitleCue[] {
  if (!Array.isArray(value)) {
    return []
  }

  const cues: PlaySubtitleCue[] = []

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return []
    }

    const raw = item as Record<string, unknown>
    const start = raw.start
    const end = raw.end

    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
      return []
    }

    cues.push({ text: readText(raw.text), start, end })
  }

  return cues
}

/**
 * 把原始响应收敛成形状正确的 PlayScene。
 * 真实后端与演示模式**共用同一条收敛路径** —— 这样演示模式不会掩盖
 * 「后端返回字段不对」这类问题，两边走的是同一套校验。
 */
function requirePlayScene(payload: unknown): PlayScene {
  const scene = readPlayScene(payload, 0)
  if (scene === null) {
    throw new ApiRequestError('后端返回的场景数据缺少 sceneId，无法播放')
  }

  return scene
}

/**
 * 拉取场景节点与分支 —— GET /api/v1/play/scene/{sceneId}
 *
 * 契约示例里该接口返回**裸对象**（不是 `{ code, data }`），所以走 requestFlexibleJson：
 * 信封与裸对象都兼容，后端两种实现都能跑。
 *
 * 返回值已经过收敛：字段类型不对、分支缺 targetScene 等情况在这里就地处理，
 * 页面拿到的一定是形状正确的对象（拿不到场景则抛错，由 store 展示失败）。
 */
export async function getPlayScene(sceneId: string): Promise<PlayScene> {
  if (isStudioMockMode || !BACKEND_READY.playScene) {
    // TODO: 待后端接入，当前为演示用 Mock
    // 后端尚未实现 GET /play/scene/{sceneId}，所以这里的场景图由假后端提供；
    // 返回的场景同样要过 requirePlayScene：形状与真实后端完全一致；
    // 音频是前端合成的静音 WAV（见 mock/silentAudio.ts），仍由真实 <audio> 的 currentTime 驱动。
    return requirePlayScene(await mockGetPlayScene(sceneId))
  }

  const payload = await requestFlexibleJson<unknown>('GET', playScenePath(sceneId))
  return requirePlayScene(payload)
}
