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
 *   3. **模拟后端的存储语义**：内存里的状态与 `localStorage`（键 `nw-demo-backend-v1`）
 *      保持一致 —— 每次写操作后立即落盘，刷新页面后原样恢复，等价于「数据留在服务端」。
 *      存储不可用（隐私模式 / 配额满）时静默降级为仅内存，不打断本次会话；
 *      只有**未知 sceneId** 才由 demoScenes.ts 的兜底剧情图接管（那说明库里确实没有这张图）；
 *   4. **音频一律是前端合成的静音 WAV**（见 silentAudio.ts），不播放任何真实音频，
 *      也刻意不持久化（object URL 刷新即失效，装载时按台词长度重新合成）。
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
  StoryEdge,
  StoryGraphPayload,
  StoryNode,
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
const voices = new Map<string, VoiceConfig>()

/** 已登记的可播放场景：一键生成写进来，播放页按 sceneId 取 */
const sceneRegistry = new Map<string, PlayScene>()

/** 「一键生成」的输入锚点（由 store 在触发前同步进来） */
let anchorSnapshot: SceneAnchor[] = []

/**
 * 画布连线（**扁平**：只有 id 引用）。
 * 与锚点一样由 store 同步进来、并落盘 —— 提交给后端时就是 edges 这条 List。
 */
let edgeSnapshot: StoryEdge[] = []

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
  voices: VoiceConfig[]
  anchors: SceneAnchor[]
  /** 画布连线（扁平 id 引用） */
  edges: StoryEdge[]
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
    voices: [...voices.values()],
    anchors: anchorSnapshot,
    edges: edgeSnapshot,
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
  if (Array.isArray(state.voices)) {
    for (const voice of state.voices) {
      voices.set(voice.characterId, voice)
    }
  }
  if (Array.isArray(state.anchors)) {
    anchorSnapshot = state.anchors.map((anchor) => ({ ...anchor }))
  }
  if (Array.isArray(state.edges)) {
    edgeSnapshot = state.edges.map((edge) => ({ ...edge }))
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
  voices.delete(nodeId)

  persist()
  return respond(undefined)
}

/* =============================================================
 * 配音
 * ============================================================= */

/** GET /api/v1/voices/{characterId}：没配过就按「未配置」处理（404） */
export function mockGetVoiceConfig(characterId: string): Promise<VoiceConfigData> {
  const config = voices.get(characterId)
  if (config === undefined) {
    return respondError('该角色还没有保存过配音配置', 404)
  }

  return respond({ ...config })
}

/** POST /api/v1/voices */
export function mockSaveVoiceConfig(payload: VoiceConfig): Promise<VoiceConfigData> {
  voices.set(payload.characterId, { ...payload })
  persist()
  return respond({ ...payload })
}

/* =============================================================
 * 剧情锚点与生成
 * ============================================================= */

/** 由 store 在锚点变动时同步进来（仅演示模式使用），同时落盘 */
export function setMockAnchors(anchors: readonly SceneAnchor[]): void {
  anchorSnapshot = anchors.map((anchor) => ({ ...anchor }))
  persist()
}

/** 由 store 在连线变动时同步进来（仅演示模式使用），同时落盘 */
export function setMockEdges(edges: readonly StoryEdge[]): void {
  edgeSnapshot = edges.map((edge) => ({ ...edge }))
  persist()
}

/**
 * POST /api/v1/plan/anchors：收**扁平双 List**（nodes + edges），
 * 回执按「保存后的节点列表」返回（与真实接口的假定一致）。
 */
export function mockSaveSceneAnchors(graph: StoryGraphPayload): Promise<SceneAnchorListData> {
  setMockAnchors(graph.nodes.map(nodeToAnchor))
  setMockEdges(graph.edges)
  return respond(anchorSnapshot.map((anchor) => ({ ...anchor })))
}

/** 节点（扁平提交格式）→ 锚点（编辑态）；坐标与音频地址原样带过 */
function nodeToAnchor(node: StoryNode): SceneAnchor {
  return {
    sceneId: node.sceneId,
    // 卡片名称（需求 1）：创作者改过的标题要跟着双 List 一起走
    cardName: node.cardName,
    text: node.text,
    speaker: node.speaker,
    timeStage: node.timeStage,
    audioURL: node.audioURL,
    x: node.x,
    y: node.y,
  }
}

/**
 * 演示模式专用：回读假后端持有的锚点（已持久化在 localStorage）。
 * 刻意**不加模拟延时**：这是一次本地读取，加延时只会让操作页先闪一下空状态。
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function mockReadAnchors(): SceneAnchorListData {
  return anchorSnapshot.map((anchor) => ({ ...anchor }))
}

/**
 * 演示模式专用：回读假后端持有的连线（已持久化在 localStorage）。
 * TODO: 待后端接入，当前为演示用 Mock
 */
export function mockReadEdges(): StoryEdge[] {
  return edgeSnapshot.map((edge) => ({ ...edge }))
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

/** 锚点 → 可播放场景（优先用锚点自带的 audioURL，没有才合成静音音频） */
function toPlayScene(anchor: SceneAnchor): PlayScene {
  return {
    sceneId: anchor.sceneId,
    text: anchor.text,
    speaker: anchor.speaker,
    audioUrl: anchor.audioURL !== '' ? anchor.audioURL : silentAudioUrlForText(anchor.text),
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
      // 选项文案用「卡片名 · 台词摘要」而不是说话人：
      // 需求 2 之后所有场景的 speaker 恒为「旁白」，拿它做标签会得到一排
      // 「前往：旁白 · …」，认不出区别。卡片名（回退 sceneId）才是可辨认的。
      action: `前往：${sceneLabel(next)} · ${excerpt(next.text)}`,
      condition: 'NONE',
      targetScene: toNestedScene(next),
    }))
  }
}

/**
 * 由播放场景推一个可辨认的标签。
 * 播放域契约（4.1）没有 cardName 字段，因此优先用「场景文本摘要」；
 * 文本为空时退回 sceneId —— 保证选项永远有内容，不会渲染成空白按钮。
 */
function sceneLabel(scene: PlayScene): string {
  const summary = excerpt(scene.text)
  return summary === '' ? scene.sceneId : summary
}

/**
 * POST /api/v1/plan/interpolate（Mock 实现）
 *
 * ⚠️ 契约只约定「返回 200 表示图谱已成功裂变并缝合」，**没有定义 data 结构**。
 *    前端按 InterpolateResultData（补全出的场景列表）假定，因此这里返回的也是锚点列表。
 *
 * 生成规则（可预测、可解释，不做随机）：
 *   1. **有画布连线时以连线为准**：用户在画布上点选建立的 edges 就是剧情分支，
 *      这是「散点式编排」最直接的表达，不再按 timeStage 自动串；
 *   2. 没画连线时退回按 timeStage 分组串联（上一阶段每个场景 → 下一阶段全部场景），
 *      保证只填了时间线也能生成；
 *   3. 若只有一个阶段且没有连线，按插值语义补一个 AI 续写场景，
 *      用「剧情大纲」作为它的台词 —— 这样演示时一定有点得动的分支。
 */
export function mockInterpolatePlan(payload: InterpolateRequest): Promise<InterpolateResultData> {
  if (anchorSnapshot.length === 0) {
    // 正常流程走不到这里（锚点不足时页面会禁用生成按钮），兜底给演示剧情图
    const fallback = buildDemoScene(DEMO_ENTRY_SCENE_ID)
    sceneRegistry.set(fallback.sceneId, fallback)
    persist()
    return respond({
      scenes: [
        {
          sceneId: fallback.sceneId,
          cardName: excerpt(fallback.text),
          text: fallback.text,
          speaker: fallback.speaker,
          timeStage: 1,
          audioURL: '',
        },
      ],
    })
  }

  const groups = groupAnchorsByStage(anchorSnapshot)
  const stageScenes = groups.map((group) => group.map(toPlayScene))

  /** sceneId → 可播放场景，供连线与登记共用 */
  const sceneById = new Map<string, PlayScene>()
  groups.forEach((group, stageIndex) => {
    group.forEach((anchor, anchorIndex) => {
      sceneById.set(anchor.sceneId, stageScenes[stageIndex][anchorIndex])
    })
  })

  const resultAnchors: SceneAnchor[] = anchorSnapshot.map((anchor) => ({ ...anchor }))

  if (edgeSnapshot.length > 0) {
    // 以画布连线为准：source → target 各成一条分支
    for (const edge of edgeSnapshot) {
      const source = sceneById.get(edge.sourceId)
      const target = sceneById.get(edge.targetId)
      if (source === undefined || target === undefined) {
        continue
      }

      source.edges.push({
        action: `前往：${sceneLabel(target)} · ${excerpt(target.text)}`,
        condition: 'NONE',
        targetScene: toNestedScene(target),
      })
    }
  } else {
    for (let index = 0; index < stageScenes.length - 1; index += 1) {
      linkStages(stageScenes[index], stageScenes[index + 1])
    }
  }

  if (edgeSnapshot.length === 0 && stageScenes.length === 1) {
    const lastStage = groups[0]
    const continuationStage = lastStage[0].timeStage + 1
    const continuationId = `${stageScenes[0][0].sceneId}_AI_01`
    const continuationAnchor: SceneAnchor = {
      sceneId: continuationId,
      cardName: excerpt(payload.outline),
      text: payload.outline,
      speaker: '旁白',
      timeStage: continuationStage,
      audioURL: '',
    }
    const continuation = toPlayScene(continuationAnchor)

    linkStages(stageScenes[0], [continuation])
    sceneById.set(continuation.sceneId, continuation)
    resultAnchors.push(continuationAnchor)
  }

  // 全部登记进假后端，播放页才能按 sceneId 取到它
  sceneById.forEach((scene, sceneId) => {
    sceneRegistry.set(sceneId, scene)
  })

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
