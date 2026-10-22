/**
 * 创作台接口封装
 * ---------------------------------------------------------------
 * 契约来源：《交互式播客引擎 API 接口文档 (v1.0 严格对齐版)》，基础路径 /api/v1。
 * 职责：把创作台与播放域、配音域的 UI 动作转换为后端调用，并保持三态：
 *   1. 已接入后端 → 真实请求（走 api.ts 的 requestCodeJson，按 `{ code, data }` 信封解包，
 *      契约的成功码是 200，见 api.ts 的 API_SUCCESS_CODE；
 *      播放域单场景接口的裸对象兼容见 requestFlexibleJson）
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
 * ⚠️ 契约未定义 / 后端未实现、由前端按惯例补齐的部分：
 *    PUT    /api/v1/properties/{nodeId}       更新资源节点  ← 后端**未实现**（Spring 回 405，
 *            store 会把 405 翻译成可读原因，不把「接口不存在」显示成网络异常）
 *    DELETE /api/v1/properties/{nodeId}       删除资源节点  ← 后端已实现，真实模式下直接可用
 *    GET    /api/v1/voices（音色列表）          音色列表     ← 契约没有该接口，
 *            getVoiceList 目前是**占位实现、不发请求**，只返回内置音色表
 *
 * 契约已定义、前端已按原文实现的接口：
 *    POST   /api/v1/properties               新建资源节点（回执只有 nodeId + status）
 *    GET    /api/v1/properties?type=          资源列表（轻量：nodeId / name / type）
 *    POST   /api/v1/voices                    保存配音配置（全篇唯一，不带 characterId）
 *    GET    /api/v1/voices                     查询配音配置（无路径参数，未配置返回默认值）
 *    POST   /api/v1/plan/anchors              保存剧情锚点（请求体是场景数组 List<Scene>）
 *    POST   /api/v1/plan/interpolate           插值补全剧情（对应后端 StepRequest）
 *    POST   /api/v1/plan/export-segment        导出片段（返回 url / finalAudioUrl / segments / durationMs）
 *    接入方式：在 frontend/.env.local 写入
 *      VITE_API_BASE_URL=https://<后端域名>
 *      VITE_API_MOCK=false
 *    UI 层无需改动。
 *
 * TODO: 待后端接入，当前为演示用 Mock —— 下面每个函数里的 `isStudioMockMode` 分支
 *       都是临时代码，接入时连同 src/services/mock/ 整个目录一起删除。
 */
import { API_ENDPOINTS, ApiRequestError, requestCodeJson, requestFlexibleJson } from './api'
import { API_DEMO_MODE } from './config'
import { TIMBRE_OPTIONS } from '@/types/studio'
import { parseSubtitles } from '@/utils/subtitles'
import {
  mockCreateProperty,
  mockDeleteProperty,
  mockExportSegment,
  mockGetPlayScene,
  mockGetVoiceConfig,
  mockInterpolatePlan,
  mockListProperties,
  mockReadAnchors,
  mockReadEdges,
  mockSaveSceneAnchors,
  mockSaveVoiceConfig,
  mockUpdateProperty,
  setMockAnchors,
  setMockEdges,
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
  SceneWireItem,
  StoryEdge,
  StoryGraphPayload,
  StoryNode,
  TimbreOption,
  VoiceConfig,
  VoiceConfigData,
} from '@/types/studio'

/**
 * 是否处于「演示模式（Mock 数据）」。
 * 为 true 时本文件不发出任何真实网络请求，全部返回本地假数据；UI 据此显示演示模式提示。
 */
export const isStudioMockMode: boolean = API_DEMO_MODE

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
 * ⚠️ 契约里没有改 / 删接口：路径、方法名与回执形状都是前端按 REST 惯例补的
 *    （回执假定与 POST 同形）。后端补上后若不一致，只改本函数与 PropertyUpdateResult。
 */
export async function updateProperty(
  nodeId: string,
  payload: PropertyUpdatePayload,
): Promise<PropertyUpdateResult> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockUpdateProperty(nodeId, payload)
  }
  return requestCodeJson<PropertyUpdateResult>('PUT', propertyPath(nodeId), { body: payload })
}

/** 删除资源节点 —— DELETE /api/v1/properties/{nodeId}（⚠️ 同上，契约为空，属按惯例补充） */
export async function deleteProperty(nodeId: string): Promise<void> {
  if (isStudioMockMode) {
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
 * 配音
 * ============================================================= */

/**
 * 保存配音配置 —— POST /api/v1/voices
 *
 * 当前唯一的调用方是**播放页的音色选择**：听众选定音色后，由
 * `types/studio.ts` 的 buildTimbreVoiceConfig 组装请求体，经 stores/studio.ts 的
 * saveVoice 落到这里（组装规则与待确认项写在该函数上）。
 * 创作台侧的配音配置弹窗已随「音色选择迁到播放页」一并删除。
 */
export async function saveVoiceConfig(payload: VoiceConfig): Promise<VoiceConfigData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockSaveVoiceConfig(payload)
  }
  return requestCodeJson<VoiceConfigData>('POST', API_ENDPOINTS.studio.voices, { body: payload })
}

/**
 * 查询全篇配音配置 —— **GET /api/v1/voices**（后端无路径参数）。
 * ⚠️ 与后端实际实现对齐：配音域是「全篇唯一」的一条配置，因此该接口既没有
 *    characterId 路径参数，也不会在未配置时返回 404（返回 200 + 默认值，configured=false）。
 *    入参 characterId 仅用于前端本地缓存的键（见 stores/studio.ts 的 loadVoice）。
 *
 * 当前**没有调用方**：播放页只提交音色（POST），不做回显 ——
 * 要「进入播放页时预选上次保存的音色」时，在 stores/studio.ts 的 loadVoice 接上即可。
 */
export async function getVoiceConfig(characterId: string): Promise<VoiceConfigData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock（该角色没配过时按 404 拒绝）
    return mockGetVoiceConfig(characterId)
  }
  // ⚠️ 与后端实际实现对齐：`VoiceController.get()` 映射的是 **GET /api/v1/voices**（无路径参数），
  //    查询「全篇唯一」的那条配置，未配置时也返回 200 + 默认值（configured=false），不是 404。
  //    characterId 仅作为前端本地缓存的键随结果回填，后端并不按角色区分。
  const profile = await requestCodeJson<VoiceConfigData>('GET', API_ENDPOINTS.studio.voices)
  return { ...profile, characterId }
}

/**
 * 音色列表 —— 播放页「音色选择」面板的数据源。
 *
 * ⚠️ **占位实现，当前不发任何请求**：
 *   契约 v1.0 只定义了「按角色查询配音配置」（GET /voices/{characterId}），
 *   **没有**「音色列表」接口。播放页要的是「可选音色」（与角色无关），
 *   因此这里先按面板需要的形状（id / label / description）占位，
 *   等后端确认接口后，把函数体换成一次 requestCodeJson<VoiceListData>(...) 即可，
 *   store 与组件都不需要改。
 *
 *   TODO: 后端就绪后改为真实请求（例如 GET /api/v1/voices?available=true 或
 *   GET /api/v1/voices/timbres），并在 API_ENDPOINTS.studio 里登记路径。
 */
export async function getVoiceList(): Promise<TimbreOption[]> {
  // 未接后端：返回内置音色表的拷贝（不是引用，避免调用方改到模块级常量）
  return TIMBRE_OPTIONS.map((option) => ({ ...option }))
}

/* =============================================================
 * 剧情锚点与生成
 * ============================================================= */

/**
 * 保存剧情图 —— POST /api/v1/plan/anchors
 *
 * 前端内部用**扁平双 List**表达剧情图（见 types/studio.ts 的 StoryGraphPayload）：
 *   nodes（点集，含坐标 / 文本 / 音频）+ edges（边集，只存 id 引用），互不嵌套。
 *
 * ⚠️ 提交给后端时**只发 nodes 里的场景字段**（见下方 toSceneWireItems）：
 *    后端该接口的请求体是 `@RequestBody List<Scene>`（直接是场景数组）。
 *    `Scene` 实体没有 cardName / x / y，也没有接收连线的字段 ——
 *    「双 List + 画布连线」的持久化属于后端尚未支持的契约缺口，暂时留在前端本地态。
 */
export async function saveSceneAnchors(
  graph: StoryGraphPayload,
): Promise<SceneAnchorListData> {
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    return mockSaveSceneAnchors(graph)
  }
  // ⚠️ 与后端实际实现对齐：`PEngineController.firstTwo` 的请求体是
  //    `@RequestBody List<Scene>` —— **直接是场景数组**，不是 `{ nodes, edges }` 双 List
  //    （发双 List 会被后端判成反序列化失败）。后端 Scene 只有
  //    sceneId / text / speaker / audioUrl / timeStage，画布连线与 cardName / x / y
  //    在当前后端无处安放，因此这里只提交后端认得的字段，其余留在前端本地态。
  return requestCodeJson<SceneAnchorListData>('POST', API_ENDPOINTS.studio.anchors, {
    body: toSceneWireItems(graph.nodes),
  })
}

/**
 * 剧情节点（前端扁平结构）→ 后端 `Scene` 实体的线上形状。
 * 字段名转换：`audioURL`（前端编辑态）→ `audioUrl`（后端 `Scene.audioUrl`）。
 * 只提交后端 `Scene` 里存在的字段 —— 未知字段会被后端忽略，也不要指望它入库。
 */
function toSceneWireItems(nodes: readonly StoryNode[]): readonly SceneWireItem[] {
  return nodes.map((node) => ({
    sceneId: node.sceneId,
    text: node.text,
    speaker: node.speaker,
    audioUrl: node.audioURL,
    timeStage: node.timeStage,
  }))
}

/**
 * 演示模式专用：把当前锚点（点集）同步给本地假后端。
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
 * 演示模式专用：把连线（边集）同步给本地假后端并落盘。
 * 与 syncMockAnchors 一样，真实后端模式下是空操作。
 *
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function syncMockEdges(edges: readonly StoryEdge[]): void {
  if (!isStudioMockMode) {
    return
  }
  setMockEdges(edges)
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
 * 演示模式专用：回读假后端持有的连线；真实后端模式下返回空数组
 * （调用方同样要先判断模式，不要拿它覆盖会话里的边集）。
 *
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function readMockEdges(): StoryEdge[] {
  return isStudioMockMode ? mockReadEdges() : []
}

/**
 * 按锚点插值补全剧情 —— POST /api/v1/plan/interpolate
 * 请求体严格对应后端 StepRequest（键名 mustBeSceneId / isStatic，见 types/studio.ts）；
 * isStatic 为 true 时 layer 无效。
 * ⚠️ 与后端实际回执对齐：data 是起点场景的**数字 id**（`startScene.getId()`），
 *    不是 `{ scenes: [...] }`；类型见 InterpolateResultData，调用方需先做形状判断。
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
 * ⚠️ 契约未定义返回体，且明确要求「导出不能由前端直接截取后端返回的 list」，
 *    成品（拼接好的纯音频）由后端交付；这里按 ExportSegmentData 假定。
 */
export async function exportSegment(payload: ExportSegmentRequest): Promise<ExportSegmentData> {
  if (isStudioMockMode) {
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

/** 去掉 action 里的固定分支协议标记（Java 落库时原样保留了它） */
function stripUserFixedMarker(action: string): string {
  return action.replace(/\[\[USER_FIXED\]\]/g, '').trim()
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
    action: stripUserFixedMarker(readText(raw.action)),
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

/**
 * 真实字幕时间轴（契约未定义）。
 *
 * 本轮需求：后端可能给「结构化数组」，也可能直接扔一段 LRC / SRT / VTT / JSON 文本，
 * 因此这里统一交给 utils/subtitles.ts 的 parseSubtitles：
 *   - 数组 → 校验并规范化；
 *   - 字符串 → 按格式解析（解析不出来返回空数组）；
 *   - 空 → 空数组，播放页据此退回「按句长估算」。
 */
function readSubtitles(value: unknown): PlaySubtitleCue[] {
  if (typeof value !== 'string' && !Array.isArray(value)) {
    return []
  }

  return parseSubtitles(value)
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
  if (isStudioMockMode) {
    // TODO: 待后端接入，当前为演示用 Mock
    // 返回的场景同样要过 requirePlayScene：形状与真实后端完全一致；
    // 音频是前端合成的静音 WAV（见 mock/silentAudio.ts），仍由真实 <audio> 的 currentTime 驱动。
    return requirePlayScene(await mockGetPlayScene(sceneId))
  }

  const payload = await requestFlexibleJson<unknown>('GET', playScenePath(sceneId))
  return requirePlayScene(payload)
}
