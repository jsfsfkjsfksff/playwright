/**
 * 演示模式（Mock）的「本地假后端」
 * ---------------------------------------------------------------
 * 目标：在后端接入之前，让
 *   「主页 → 选择故事 → 资源添加 → 操作编辑 → 一键生成 → 播放页」
 * 这条链路可以**完整点通**，同时不改变任何接口契约。
 *
 * 四条设计约束（很重要，决定了接入真实后端时能不能零改动切换）：
 *   1. **只实现 services 层的形状**：store 与组件完全不知道数据来自这里，
 *      接入真实后端时把 services/studio.ts 里的 mock 分支去掉即可，界面代码不动；
 *   2. **严格保持契约的信息量**：例如 GET /properties 按契约只回 `{ nodeId, name, type }`，
 *      这里也照做 —— 绝不偷偷把 description 补上。否则接入真实后端后
 *      「列表接口未返回描述」这类界面表现会突然变化，前端会误以为是后端出了错；
 *   3. **数据只在内存**：等价于后端的进程内存，刷新页面即回到初始状态
 *      （播放页刷新拿不到场景时由 demoScenes.ts 的兜底剧情图接管）；
 *   4. **音频一律是前端合成的静音 WAV**（见 silentAudio.ts），不播放任何真实音频。
 *
 * TODO: 待后端接入，当前为演示用 Mock —— 接入后整个 services/mock 目录可以删除。
 */
import { ApiRequestError } from '@/services/api'
import { API_MOCK_LATENCY } from '@/services/config'
import { buildDemoScene, DEMO_ENTRY_SCENE_ID } from './demoScenes'
import { estimateSpeechSeconds, silentAudioUrlForText, silentAudioUrl } from './silentAudio'
import type {
  ExportSegmentData,
  InterpolateRequest,
  InterpolateResultData,
  PlayEdge,
  PlayScene,
  PropertyCreatePayload,
  PropertyCreateResult,
  PropertyListItem,
  PropertyType,
  PropertyUpdatePayload,
  PropertyUpdateResult,
  SceneAnchor,
  SceneAnchorListData,
  VoiceConfig,
  VoiceConfigData,
} from '@/types/studio'

/* =============================================================
 * 假后端的内存状态
 * ============================================================= */

/** 后端「数据库」里的一条资源记录（详情齐全，但列表接口只回轻量字段） */
interface MockPropertyRecord {
  nodeId: string
  type: PropertyType
  name: string
  description: string
  attributes: Record<string, unknown>
  status: 'CREATED'
}

const properties: MockPropertyRecord[] = []

/**
 * 全篇唯一的配音配置（null = 用户还没配过）。
 * 配音与资源无关：用户配的是「讲播客的这个人」的音色，所以这里不是按角色索引的字典。
 */
let voiceConfig: VoiceConfig | null = null

/**
 * 未配置时 GET /voices 返回的默认值。
 * ⚠️ 必须与后端 VoiceProfile.globalDefault() 保持一致，否则演示模式与真实后端表现不同。
 */
const DEFAULT_VOICE: VoiceConfig = {
  voiceName: 'zh-CN-Yunxi-Neural',
  promptStyle: '',
  pitch: 1,
  rate: 1,
}

/** 已登记的可播放场景：一键生成写进来，播放页按 sceneId 取 */
const sceneRegistry = new Map<string, PlayScene>()

/** 「一键生成」的输入锚点（由 store 在触发前同步进来） */
let anchorSnapshot: SceneAnchor[] = []

/** 资源 id 自增序号，形如 PROP_1001 */
let propertySeq = 0

/** 模拟网络往返：让加载态、按钮 loading 都能被真实触发 */
function respond<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), API_MOCK_LATENCY)
  })
}

/** 模拟一次失败的请求 */
function respondError(message: string, status: number | null = null): Promise<never> {
  return new Promise((_resolve, reject) => {
    window.setTimeout(() => reject(new ApiRequestError(message, status)), API_MOCK_LATENCY)
  })
}

/* =============================================================
 * 持久化（localStorage）—— 让演示数据在刷新后仍然存在
 * -------------------------------------------------------------
 * 为什么需要：真实后端的数据天然留在服务端；假后端若不持久化，
 * 用户刷新一次就要把资源与锚点重填一遍，「更接近真实体验」就无从谈起。
 *
 * 三条边界（重要）：
 *   1. **只在演示模式下生效**：本文件只在 isStudioMockMode 为 true 时被调用，
 *      接入真实后端后整个目录删除，不会污染真实环境；
 *   2. **不持久化音频**：静音音频的 object URL 在刷新后必然失效，
 *      因此只存场景文本与分支关系，装载时用 silentAudioUrlForText 重新合成；
 *   3. **写失败只当没存上**：隐私模式 / 配额满时静默降级为「仅内存」，
 *      绝不让一次存储失败打断假后端的正常工作。
 * ============================================================= */

/** 存储键：带版本号。将来结构变化时直接改 key，避免读到旧结构 */
const STORAGE_KEY = 'nw-demo-backend-v1'

/** 可持久化的分支：只记目标场景 id，装载时重新挂上场景对象 */
interface PersistedEdge {
  action: string
  condition: string
  targetSceneId: string
}

/** 可持久化的场景：刻意不含 audioUrl（见上面第 2 条） */
interface PersistedScene {
  sceneId: string
  text: string
  speaker: string
  edges: PersistedEdge[]
}

interface PersistedState {
  propertySeq: number
  properties: MockPropertyRecord[]
  voice: VoiceConfig | null
  anchors: SceneAnchor[]
  scenes: PersistedScene[]
}

/**
 * 把内存状态整体写进 localStorage。
 * 每次写操作后立即调用：数据量只有几 KB，同步写入的开销可以忽略，
 * 换来的是「用户改完随手刷新也不会丢」这个更重要的事。
 */
function persist(): void {
  const state: PersistedState = {
    propertySeq,
    properties,
    voice: voiceConfig === null ? null : { ...voiceConfig },
    anchors: anchorSnapshot,
    scenes: [...sceneRegistry.values()].map((scene) => ({
      sceneId: scene.sceneId,
      text: scene.text,
      speaker: scene.speaker,
      edges: scene.edges.map((edge) => ({
        action: edge.action,
        condition: edge.condition,
        targetSceneId: edge.targetScene.sceneId,
      })),
    })),
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储不可用时降级为「仅内存」，不影响本次会话
  }
}

/** 从 localStorage 恢复；任何异常都退回「空库」，不阻塞应用启动 */
function restore(): void {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }

  if (raw === null || raw === '') {
    return
  }

  let state: PersistedState
  try {
    state = JSON.parse(raw) as PersistedState
  } catch {
    console.warn('[演示模式] 本地存储的 Mock 数据已损坏，本次忽略并重新开始')
    return
  }

  if (typeof state.propertySeq === 'number' && Number.isFinite(state.propertySeq)) {
    propertySeq = state.propertySeq
  }
  if (Array.isArray(state.properties)) {
    properties.push(...state.properties)
  }
  if (state.voice !== null && state.voice !== undefined && typeof state.voice === 'object') {
    voiceConfig = { ...state.voice }
  }
  if (Array.isArray(state.anchors)) {
    anchorSnapshot = state.anchors.map((anchor) => ({ ...anchor }))
  }

  // 场景分两步恢复：先建节点，再挂分支（分支里存的是目标 id）
  const sceneList = Array.isArray(state.scenes) ? state.scenes : []
  const byId = new Map<string, PlayScene>()

  for (const item of sceneList) {
    byId.set(item.sceneId, {
      sceneId: item.sceneId,
      text: item.text,
      speaker: item.speaker,
      audioUrl: silentAudioUrlForText(item.text),
      edges: [],
    })
  }

  for (const item of sceneList) {
    const scene = byId.get(item.sceneId)
    if (scene === undefined) {
      continue
    }

    const edges: PlayEdge[] = []
    for (const edge of Array.isArray(item.edges) ? item.edges : []) {
      const target = byId.get(edge.targetSceneId)
      // 目标缺失（存储被外部裁剪过）时丢弃这条分支：宁可少一个选项，也不留点不动的按钮
      if (target === undefined) {
        continue
      }
      edges.push({
        action: edge.action,
        condition: edge.condition,
        // 嵌套层按契约清空 edges
        targetScene: { ...target, edges: [] },
      })
    }
    scene.edges = edges
  }

  byId.forEach((scene, sceneId) => {
    sceneRegistry.set(sceneId, scene)
  })
}

restore()

/* =============================================================
 * 资源：角色 / 规则 / 实体
 * ============================================================= */

/**
 * GET /api/v1/properties
 * 契约原文是「一个干净的 JSON 数组」，元素只有 `{ nodeId, name, type }` ——
 * description / attributes / status **一律不带**，前端据此显示「列表接口未返回描述」。
 */
export function mockListProperties(type?: PropertyType): Promise<PropertyListItem[]> {
  const items: PropertyListItem[] = properties
    .filter((item) => type === undefined || item.type === type)
    .map((item) => ({ nodeId: item.nodeId, name: item.name, type: item.type }))

  return respond(items)
}

/** POST /api/v1/properties：回执只有 `{ nodeId, status }` */
export function mockCreateProperty(payload: PropertyCreatePayload): Promise<PropertyCreateResult> {
  propertySeq += 1
  const nodeId = `PROP_${1000 + propertySeq}`

  properties.push({
    nodeId,
    type: payload.type,
    name: payload.name,
    description: payload.description,
    attributes: { ...payload.attributes },
    status: 'CREATED',
  })

  persist()
  return respond({ nodeId, status: 'CREATED' as const })
}

/**
 * PUT /api/v1/properties/{nodeId}
 * ⚠️ 契约未定义该接口，路径与回执形状是前端按 REST 惯例假定的（见 services/studio.ts 顶部说明）。
 *    这里按同一假定实现，好让「编辑」按钮在演示模式下也确实能改到数据。
 */
export function mockUpdateProperty(
  nodeId: string,
  payload: PropertyUpdatePayload,
): Promise<PropertyUpdateResult> {
  const index = properties.findIndex((item) => item.nodeId === nodeId)
  if (index < 0) {
    return respondError('资源不存在，可能已被删除', 404)
  }

  properties[index] = {
    nodeId,
    type: payload.type,
    name: payload.name,
    description: payload.description,
    attributes: { ...payload.attributes },
    status: 'CREATED',
  }

  persist()
  return respond({ nodeId, status: 'CREATED' as const })
}

/** DELETE /api/v1/properties/{nodeId}（⚠️ 同上，契约为空，属按惯例补充） */
export function mockDeleteProperty(nodeId: string): Promise<void> {
  const index = properties.findIndex((item) => item.nodeId === nodeId)
  if (index < 0) {
    return respondError('资源不存在，可能已被删除', 404)
  }

  properties.splice(index, 1)
  // 配音是全篇唯一配置，与资源无关：删资源不影响它，这里刻意不做任何清理

  persist()
  return respond(undefined)
}

/* =============================================================
 * 配音（全篇唯一）
 * ============================================================= */

/**
 * GET /api/v1/voices：全篇唯一配置。
 * 没配过时按「默认值」返回（configured = false），**不是 404** ——
 * 与真实后端一致，前端不需要为「还没配」写错误分支。
 */
export function mockGetVoiceConfig(): Promise<VoiceConfigData> {
  if (voiceConfig === null) {
    return respond({ ...DEFAULT_VOICE, configured: false })
  }

  return respond({ ...voiceConfig, configured: true })
}

/** POST /api/v1/voices：全篇唯一，重复提交只覆盖同一条 */
export function mockSaveVoiceConfig(payload: VoiceConfig): Promise<VoiceConfigData> {
  voiceConfig = { ...payload }
  persist()
  return respond({ ...voiceConfig, configured: true })
}

/* =============================================================
 * 剧情锚点与生成
 * ============================================================= */

/** 由 store 在锚点变动时同步进来（仅演示模式使用），同时落盘 */
export function setMockAnchors(anchors: readonly SceneAnchor[]): void {
  anchorSnapshot = anchors.map((anchor) => ({ ...anchor }))
  persist()
}

/** POST /api/v1/plan/anchors：回执按「保存后的锚点列表」返回 */
export function mockSaveSceneAnchors(anchors: readonly SceneAnchor[]): Promise<SceneAnchorListData> {
  setMockAnchors(anchors)
  return respond(anchors.map((anchor) => ({ ...anchor })))
}

/**
 * 演示模式专用：回读假后端持有的锚点（已持久化在 localStorage）。
 * 刻意**不加模拟延时**：这是一次本地读取，加延时只会让操作页先闪一下空状态。
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function mockReadAnchors(): SceneAnchorListData {
  return anchorSnapshot.map((anchor) => ({ ...anchor }))
}

/** 按 timeStage 升序分组：同一组内的锚点在时间线上绝对并列 */
function groupAnchorsByStage(anchors: readonly SceneAnchor[]): SceneAnchor[][] {
  const buckets = new Map<number, SceneAnchor[]>()

  for (const anchor of anchors) {
    const bucket = buckets.get(anchor.timeStage)
    if (bucket === undefined) {
      buckets.set(anchor.timeStage, [{ ...anchor }])
    } else {
      bucket.push({ ...anchor })
    }
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, items]) => items)
}

/** 取台词片段，用于分支按钮文案 */
function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > 14 ? `${compact.slice(0, 14)}…` : compact
}

/** 锚点 → 可播放场景（静音音频；edges 稍后按时间线关系补） */
function toPlayScene(anchor: SceneAnchor): PlayScene {
  return {
    sceneId: anchor.sceneId,
    text: anchor.text,
    speaker: anchor.speaker,
    audioUrl: silentAudioUrlForText(anchor.text),
    edges: [],
  }
}

/**
 * 嵌套的 targetScene：按后端 `@JsonIgnoreProperties("edges")` 的行为清空 edges。
 * 播放页据此走「先用嵌套数据即时开播 + 随后补拉分支」，与真实后端完全一致。
 */
function toNestedScene(scene: PlayScene): PlayScene {
  return { ...scene, edges: [] }
}

/** 把上一阶段的每个场景连到下一阶段的所有场景（同阶段并列 → 多条分支） */
function linkStages(from: readonly PlayScene[], to: readonly PlayScene[]): void {
  for (const scene of from) {
    scene.edges = to.map((next) => ({
      action: `前往：${next.speaker === '' ? '旁白' : next.speaker} · ${excerpt(next.text)}`,
      condition: 'NONE',
      targetScene: toNestedScene(next),
    }))
  }
}

/**
 * POST /api/v1/plan/interpolate（Mock 实现）
 *
 * ⚠️ 契约只约定「返回 200 表示图谱已成功裂变并缝合」，**没有定义 data 结构**。
 *    前端按 InterpolateResultData（补全出的场景列表）假定，因此这里返回的也是锚点列表。
 *
 * 生成规则（可预测、可解释，不做随机）：
 *   1. 用户锚点按 timeStage 分组，组内并列；
 *   2. 相邻阶段之间连成分支（上一阶段每个场景 → 下一阶段全部场景）；
 *   3. 若只有一个阶段（时间线上没有下一站），按插值语义补一个 AI 续写场景，
 *      用「剧情大纲」作为它的台词 —— 这样演示时一定有点得动的分支。
 */
export function mockInterpolatePlan(payload: InterpolateRequest): Promise<InterpolateResultData> {
  if (anchorSnapshot.length === 0) {
    // 正常流程走不到这里（锚点不足时页面会禁用生成按钮），兜底给演示剧情图
    const fallback = buildDemoScene(DEMO_ENTRY_SCENE_ID)
    sceneRegistry.set(fallback.sceneId, fallback)
    persist()
    return respond({ scenes: [{ sceneId: fallback.sceneId, text: fallback.text, speaker: fallback.speaker, timeStage: 1 }] })
  }

  const groups = groupAnchorsByStage(anchorSnapshot)
  const stageScenes = groups.map((group) => group.map(toPlayScene))

  for (let index = 0; index < stageScenes.length - 1; index += 1) {
    linkStages(stageScenes[index], stageScenes[index + 1])
  }

  const resultAnchors: SceneAnchor[] = []

  groups.forEach((group, stageIndex) => {
    group.forEach((anchor, anchorIndex) => {
      const scene = stageScenes[stageIndex][anchorIndex]
      // 登记进假后端，播放页才能按 sceneId 取到它
      sceneRegistry.set(scene.sceneId, scene)
      resultAnchors.push({ ...anchor })
    })
  })

  if (stageScenes.length === 1) {
    const lastStage = groups[0]
    const continuationStage = lastStage[0].timeStage + 1
    const continuationId = `${stageScenes[0][0].sceneId}_AI_01`
    const continuation = toPlayScene({
      sceneId: continuationId,
      text: payload.outline,
      speaker: '旁白',
      timeStage: continuationStage,
    })

    linkStages(stageScenes[0], [continuation])
    sceneRegistry.set(continuation.sceneId, continuation)
    resultAnchors.push({
      sceneId: continuationId,
      text: continuation.text,
      speaker: continuation.speaker,
      timeStage: continuationStage,
    })
  }

  persist()
  return respond({ scenes: resultAnchors })
}

/**
 * POST /api/v1/plan/export-segment
 * 契约要求成品由后端拼接交付（前端不得自己截取音频列表），
 * 因此这里返回一个「按选中场景总时长合成的静音音频」地址，形状与真实接口一致。
 */
export function mockExportSegment(sceneIds: readonly string[]): Promise<ExportSegmentData> {
  const totalSeconds = sceneIds.reduce((sum, sceneId) => {
    const scene = sceneRegistry.get(sceneId)
    return sum + estimateSpeechSeconds(scene?.text ?? '')
  }, 0)

  return respond({ url: silentAudioUrl(totalSeconds) })
}

/* =============================================================
 * 消费播放域
 * ============================================================= */

/** 深拷贝场景，避免调用方改动假后端里登记的那一份 */
function cloneScene(scene: PlayScene): PlayScene {
  return {
    ...scene,
    edges: scene.edges.map((edge) => ({
      ...edge,
      targetScene: { ...edge.targetScene, edges: [] },
    })),
  }
}

/**
 * GET /api/v1/play/scene/{sceneId}（Mock 实现）
 *   1. 先生成过的场景（内存登记表）→ 原样返回，链接关系完整；
 *   2. 否则用兜底的演示剧情图，保证刷新页面后播放页依然可演示。
 */
export function mockGetPlayScene(sceneId: string): Promise<PlayScene> {
  const registered = sceneRegistry.get(sceneId)
  if (registered !== undefined) {
    return respond(cloneScene(registered))
  }

  return respond(buildDemoScene(sceneId))
}
