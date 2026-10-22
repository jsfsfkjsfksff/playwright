/**
 * 创作台状态（Pinia）
 * ---------------------------------------------------------------
 * 管理三块状态：资源（resources）、剧情锚点（anchors）、配音配置（voices）。
 * 配音配置的**唯一入口现在是播放页的音色选择**（POST /voices）；创作台侧的
 * 配音配置弹窗已随音色选择迁移一并删除，因此这里只保留读写「最近一次提交/回显」的能力。
 *
 * 关于「演示模式（Mock）」时的行为（本 store 最重要的约定）：
 *   - 本 store **不区分数据来源**：它只管调用 services 层，由 services 决定发真实请求
 *     还是返回本地假数据（见 services/studio.ts 的 isStudioMockMode）。
 *     这样接入真实后端时，本文件与所有组件都不需要改动。
 *   - 唯一的例外是用于界面提示的 demoMode，它只是为了让界面说的话与事实一致。
 *   - 演示模式的数据由假后端保存进浏览器 localStorage（见 services/mock/studioBackend.ts），
 *     因此刷新页面后资源与锚点仍在；界面上会如实说明这一点。
 *
 * TODO: 待后端接入，当前为演示用 Mock（假数据见 src/services/mock/）。
 *
 * 关于契约回执与视图模型的转换（接口文档 v1.0）：
 *   - POST /properties 只回传 `{ nodeId, status: "CREATED" }`；
 *   - GET  /properties 只回传 `{ nodeId, name, type }`（轻量列表，无描述 / 属性 / 状态）。
 *   因此本 store 负责把「契约 data」拼成卡片需要的视图模型：
 *   列表来的节点，详情字段一律置 null（= 后端没给），绝不 fill 上假值；
 *   新建 / 修改的节点，详情取用户刚提交的内容，状态取回执里的取值。
 *   POST /voices 的返回体契约同样未定义：回执不是配置对象时就以提交内容为准，
 *   避免一次成功的保存被显示成「未配置」。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiRequestError } from '@/services/api'
import {
  createProperty,
  deleteProperty,
  exportSegment as requestExportSegment,
  getVoiceConfig,
  interpolatePlan,
  isStudioMockMode,
  listProperties,
  readMockAnchors,
  readMockEdges,
  saveSceneAnchors,
  saveVoiceConfig,
  syncMockAnchors,
  syncMockEdges,
  updateProperty,
} from '@/services/studio'
import type {
  AnchorStageGroup,
  ExportSegmentData,
  InterpolateRequest,
  InterpolateResultData,
  PropertyCreatePayload,
  PropertyCreateResult,
  PropertyListItem,
  PropertyResponse,
  PropertyType,
  PropertyUpdatePayload,
  SceneAnchor,
  SceneAnchorPatch,
  StoryEdge,
  StoryGraphPayload,
  VoiceConfig,
} from '@/types/studio'
import { PROPERTY_TYPES } from '@/utils/studioVocabulary'

/** 资源类型分组的展示顺序（与词汇表保持一致，避免两处各写一份） */
const TYPE_ORDER = PROPERTY_TYPES

/**
 * 回执是否是一个可用的配音配置。
 * 契约未定义 POST /voices 的返回体，因此不能假定它一定回传完整配置对象。
 */
function isVoiceConfig(value: unknown): value is VoiceConfig {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<VoiceConfig>
  return typeof candidate.characterId === 'string' && typeof candidate.voiceName === 'string'
}

export const useStudioStore = defineStore('studio', () => {
  /* =============================================================
   * 状态
   * ============================================================= */

  const resources = ref<PropertyResponse[]>([])

  /** 剧情锚点（时间线）：由操作编辑页维护，提交走 POST /plan/anchors */
  const anchors = ref<SceneAnchor[]>([])

  /** 配音配置：按 characterId 索引 */
  const voices = ref<Record<string, VoiceConfig>>({})

  /**
   * 剧情连线（**扁平结构**：只有 id 引用，不嵌套节点数据）。
   * 与 anchors 一起构成「点集 + 边集」，提交时组装成 StoryGraphPayload。
   */
  const edges = ref<StoryEdge[]>([])

  /** 初始加载中 */
  const loading = ref(false)

  /** 写入中（新增 / 编辑 / 删除 / 保存配音 / 保存锚点共用，用于按钮加载态与防重复提交） */
  const saving = ref(false)

  /** AI 插值生成中（HTN 演算在后端，前端只等待一次响应） */
  const generating = ref(false)

  /** 音频片段导出中 */
  const exporting = ref(false)

  /** 最近一次插值生成的结果（契约未定义结构，按 InterpolateResultData 假定） */
  const interpolateResult = ref<InterpolateResultData | null>(null)

  /** 最近一次导出的结果（契约未定义结构，按 ExportSegmentData 假定） */
  const exportResult = ref<ExportSegmentData | null>(null)

  /** 最近一次失败的原因；成功后清空 */
  const lastError = ref<string | null>(null)

  /* =============================================================
   * 派生状态
   * ============================================================= */

  /** 是否处于演示模式（Mock 数据）—— 来自 services 层的唯一判定，UI 据此提示用户 */
  const demoMode = computed(() => isStudioMockMode)

  const resourceCount = computed(() => resources.value.length)
  const anchorCount = computed(() => anchors.value.length)

  /** 连线数量（画布上的边） */
  const edgeCount = computed(() => edges.value.length)

  /**
   * 按类型分组，供资源面板直接 v-for 渲染。
   *
   * 先排契约三类（角色 → 规则 → 实体），再把**三类之外**的取值各自成组追加在后面。
   * 为什么必须有这段兜底：后端落库时并不校验 type —— 自动创建的关联实体默认是
   * `ITEM`，调用方也可能直接传 `LOCATION`。如果只按契约三类分组，这些资源会
   * 匹配不到任何分组，在界面上**整条消失**（库里明明有，看起来像「没读到」）。
   */
  const resourceGroups = computed(() => {
    const groupOf = (type: string) => ({
      type,
      items: resources.value.filter((item) => item.type === type),
    })

    const extraTypes = [
      ...new Set(resources.value.map((item) => item.type as string)),
    ]
      .filter((type) => !TYPE_ORDER.includes(type as PropertyType))
      .sort()

    return [...TYPE_ORDER.map(groupOf), ...extraTypes.map(groupOf)]
  })

  /**
   * 时间线分组：按 timeStage 升序（契约：数值越小时间越靠前）。
   * 同一组 = 相同 timeStage = 时间线上绝对并列，页面据此横向并排渲染。
   */
  const anchorGroups = computed<AnchorStageGroup[]>(() => {
    const buckets = new Map<number, SceneAnchor[]>()

    for (const anchor of anchors.value) {
      const bucket = buckets.get(anchor.timeStage)
      if (bucket) {
        bucket.push(anchor)
      } else {
        buckets.set(anchor.timeStage, [anchor])
      }
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([timeStage, items]) => ({ timeStage, anchors: items }))
  })

  /**
   * 提交给后端的图数据（**扁平双 List**）：
   *   { nodes: [...], edges: [...] }
   * nodes 里没有任何子节点，edges 里没有任何节点数据 —— 关系只靠 id 引用。
   * 坐标缺失（例如刚新增、还没在画布上落位）时按 0 提交，由画布先落位再保存。
   */
  const storyGraph = computed<StoryGraphPayload>(() => ({
    nodes: anchors.value.map((anchor) => ({
      sceneId: anchor.sceneId,
      // 卡片名称随 nodes 提交（需求 1）：创作者改过的标题必须能存到后端
      cardName: anchor.cardName,
      x: Math.round(anchor.x ?? 0),
      y: Math.round(anchor.y ?? 0),
      text: anchor.text,
      speaker: anchor.speaker,
      audioURL: anchor.audioURL,
      timeStage: anchor.timeStage,
    })),
    edges: edges.value.map((edge) => ({ ...edge })),
  }))

  /**
   * 清空失败原因。
   * lastError 是所有写操作共用的一条状态，打开某个面板（生成 / 导出）前先清掉，
   * 否则弹窗里会显示上一个操作留下的错误，看起来像是这次操作失败了。
   */
  function clearError(): void {
    lastError.value = null
  }

  /** 取某个角色的配音配置；没有则返回 null */
  function voiceOf(characterId: string): VoiceConfig | null {
    return voices.value[characterId] ?? null
  }

  /* =============================================================
   * 内部工具
   * ============================================================= */

  /** 把任意错误收敛成可展示的文案 */
  function describeError(error: unknown, fallback: string): string {
    if (error instanceof ApiRequestError) {
      return error.message
    }
    if (error instanceof Error && error.message !== '') {
      return error.message
    }
    return fallback
  }

  /**
   * 资源更新失败的文案。
   * 后端当前未实现 `PUT /api/v1/properties/{nodeId}`，Spring 对未映射的方法回 405；
   * 这里把状态码翻译成可读原因，避免用户只看到「接口返回异常状态：405」。
   */
  function describeUpdateError(error: unknown): string {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
      return '后端未提供资源更新接口（PUT /api/v1/properties/{nodeId}），当前无法编辑资源'
    }
    return describeError(error, '资源修改失败')
  }

  /**
   * 列表项 → 视图模型。
   * 列表接口回传 nodeId / name / type，并已扩展出 description / attributes，
   * 因此这两个字段**有值就用**（刷新后能看到自己刚改的内容）；
   * 只有后端确实没给（演示模式或未升级的后端）才置 null —— 含义是「后端没给这个字段」，
   * 卡片据此显示「列表接口未返回描述」，而不是谎称「内容为空」。
   * status 依旧置 null：它是写接口回执里的创建标记，列表接口本就不回传。
   */
  function fromListItem(item: PropertyListItem): PropertyResponse {
    return {
      nodeId: item.nodeId,
      type: item.type,
      name: item.name,
      description: item.description ?? null,
      attributes: item.attributes ?? null,
      status: null,
    }
  }

  /**
   * 创建 / 更新回执 + 提交内容 → 视图模型。
   * 契约的 POST / PUT 只回传 `{ nodeId, status }`，因此描述与属性表取用户刚提交的内容
   * —— 这是前端自己掌握的事实，不是伪造后端数据；状态用回执里的取值。
   */
  function fromWriteResult(
    payload: PropertyCreatePayload,
    result: PropertyCreateResult,
  ): PropertyResponse {
    return {
      nodeId: result.nodeId,
      type: payload.type,
      name: payload.name,
      description: payload.description,
      attributes: { ...payload.attributes },
      status: result.status,
    }
  }

  /* =============================================================
   * 资源
   * ============================================================= */

  /** 拉取资源列表 */
  async function loadResources(): Promise<void> {
    loading.value = true
    lastError.value = null
    try {
      // 列表是轻量数据（契约只有 nodeId / name / type）：逐个映射成视图模型，
      // 详情字段标为 null，由卡片区分「后端没给」与「内容为空」
      resources.value = (await listProperties()).map(fromListItem)
    } catch (error) {
      lastError.value = describeError(error, '资源列表加载失败')
    } finally {
      loading.value = false
    }
  }

  /** 新增资源；返回是否成功（供页面决定是否关闭弹窗与播报） */
  async function addResource(payload: PropertyCreatePayload): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      // 回执只有 `{ nodeId, status }`，详情用刚提交的内容拼（见 fromWriteResult）
      const result = await createProperty(payload)
      resources.value.push(fromWriteResult(payload, result))
      return true
    } catch (error) {
      lastError.value = describeError(error, '资源新增失败')
      return false
    } finally {
      saving.value = false
    }
  }

  /** 修改资源（nodeId 走路径参数） */
  async function editResource(nodeId: string, payload: PropertyUpdatePayload): Promise<boolean> {
    const index = resources.value.findIndex((item) => item.nodeId === nodeId)
    if (index < 0) {
      lastError.value = '要修改的资源不存在，可能已被删除'
      return false
    }

    saving.value = true
    lastError.value = null
    try {
      // PUT 的回执同样假定只有 `{ nodeId, status }`：视图模型由提交内容 + 回执重建
      const result = await updateProperty(nodeId, payload)
      resources.value[index] = fromWriteResult(payload, result)
      return true
    } catch (error) {
      // ⚠️ 后端当前**没有** PUT /api/v1/properties/{nodeId}（只有 POST / GET / DELETE），
      //    Spring 会对 PUT 回 405；这里把状态码翻译成可读原因。
      lastError.value = describeUpdateError(error)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 删除资源；连带清掉它的本地配音配置 */
  async function removeResource(nodeId: string): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      await deleteProperty(nodeId)

      resources.value = resources.value.filter((item) => item.nodeId !== nodeId)
      delete voices.value[nodeId]
      return true
    } catch (error) {
      lastError.value = describeError(error, '资源删除失败')
      return false
    } finally {
      saving.value = false
    }
  }

  /* =============================================================
   * 剧情锚点（时间线）
   * ============================================================= */

  /**
   * 演示模式：锚点一有变动就同步给假后端（它会顺带写进 localStorage）。
   * 这样用户刷新页面后锚点还在，不必先点一次「保存锚点」。
   * 真实后端模式下这是空操作 —— 数据本来就在服务端。
   * TODO: 待后端接入，当前为演示用 Mock
   */
  function syncAnchorsForDemo(): void {
    syncMockAnchors(anchors.value)
    syncMockEdges(edges.value)
  }

  /**
   * 新增锚点（本地）。
   * sceneId 是锚点的身份与后端引用键，重复直接返回 false ——
   * 两个同 id 的锚点在后端会被当成同一个场景。
   */
  function addAnchor(anchor: SceneAnchor): boolean {
    if (anchors.value.some((item) => item.sceneId === anchor.sceneId)) {
      lastError.value = `场景 id 重复：${anchor.sceneId}`
      return false
    }

    anchors.value.push({ ...anchor })
    syncAnchorsForDemo()
    return true
  }

  /** 系统占位 id：只有这种形态才允许用户填写一次（见 updateAnchor） */
  const AUTO_SCENE_ID_PATTERN = /^SCENE_ANCHOR_\d+$/

  /**
   * 修改锚点：只改补丁里出现的字段。
   *
   * sceneId 的特殊规则 —— **一经填写就不能再修改**：
   *   - 新建时页面给的是占位 id（SCENE_ANCHOR_xx），它还不算「填写」，
   *     允许改成用户自己的名字，这是唯一一次；
   *   - 一旦不是占位 id 了，再想改就直接拒绝（即使绕过 UI 调进来也一样）。
   * 改名等于换身份，所以还要同步所有连线的端点与边 id，避免悬空边。
   */
  function updateAnchor(sceneId: string, patch: SceneAnchorPatch): boolean {
    const index = anchors.value.findIndex((item) => item.sceneId === sceneId)
    if (index < 0) {
      lastError.value = '要修改的锚点不存在，可能已被删除'
      return false
    }

    const nextId = patch.sceneId?.trim()

    // 没改名：普通字段更新
    if (nextId === undefined || nextId === sceneId) {
      anchors.value[index] = { ...anchors.value[index], ...patch }
      syncAnchorsForDemo()
      return true
    }

    if (!AUTO_SCENE_ID_PATTERN.test(sceneId)) {
      lastError.value = '场景 id 一经填写就不能再修改'
      return false
    }

    if (nextId === '') {
      lastError.value = '场景 id 不能为空'
      return false
    }

    if (anchors.value.some((item, itemIndex) => itemIndex !== index && item.sceneId === nextId)) {
      lastError.value = `场景 id 已存在：${nextId}`
      return false
    }

    anchors.value[index] = { ...anchors.value[index], ...patch, sceneId: nextId, cardName: nextId }

    edges.value = edges.value.map((edge) => {
      const sourceId = edge.sourceId === sceneId ? nextId : edge.sourceId
      const targetId = edge.targetId === sceneId ? nextId : edge.targetId

      if (sourceId === edge.sourceId && targetId === edge.targetId) {
        return edge
      }

      return { id: `EDGE_${sourceId}__${targetId}`, sourceId, targetId }
    })

    syncAnchorsForDemo()
    return true
  }

  /** 删除锚点 */
  function removeAnchor(sceneId: string): void {
    anchors.value = anchors.value.filter((item) => item.sceneId !== sceneId)
    // 同时删掉与它相连的所有连线 —— 否则会留下指向不存在节点的「悬空边」
    edges.value = edges.value.filter((edge) => edge.sourceId !== sceneId && edge.targetId !== sceneId)
    syncAnchorsForDemo()
  }

  /* =============================================================
   * 画布坐标与连线（散点式编排）
   * -------------------------------------------------------------
   * 语义：anchors 是「点集」，edges 是「边集」，两者都平铺，互不嵌套。
   * 画布只负责把 anchors 的 x / y 改掉、把 edges 增删，提交时由 storyGraph
   * 组装成两条数组 —— 因此**不存在任何树形结构**。
   * ============================================================= */

  /** 画布落位：列 = timeStage 序号，行 = 同阶段内的序号 */
  const CANVAS_ORIGIN_X = 48
  const CANVAS_ORIGIN_Y = 40
  const CANVAS_COLUMN_GAP = 300
  const CANVAS_ROW_GAP = 210

  /**
   * 给还没有坐标的锚点补一个初始位置（已落位的不动，避免每次进画布都跳位置）。
   * 落位规则与列表视图一致：timeStage 升序 = 从左到右，同阶段自上而下。
   */
  function ensureAnchorPositions(): void {
    const groups = anchorGroups.value
    let changed = false

    groups.forEach((group, column) => {
      group.anchors.forEach((anchor, row) => {
        if (anchor.x !== undefined && anchor.y !== undefined) {
          return
        }

        const index = anchors.value.findIndex((item) => item.sceneId === anchor.sceneId)
        if (index < 0) {
          return
        }

        anchors.value[index] = {
          ...anchors.value[index],
          x: CANVAS_ORIGIN_X + column * CANVAS_COLUMN_GAP,
          y: CANVAS_ORIGIN_Y + row * CANVAS_ROW_GAP,
        }
        changed = true
      })
    })

    if (changed) {
      syncAnchorsForDemo()
    }
  }

  /** 拖拽结束：把画布坐标写回锚点（提交时就是节点的 x / y） */
  function updateAnchorPosition(sceneId: string, x: number, y: number): void {
    const index = anchors.value.findIndex((item) => item.sceneId === sceneId)
    if (index < 0) {
      return
    }

    const nextX = Math.round(x)
    const nextY = Math.round(y)
    const current = anchors.value[index]

    if (current.x === nextX && current.y === nextY) {
      return
    }

    anchors.value[index] = { ...current, x: nextX, y: nextY }
    syncAnchorsForDemo()
  }

  /** 两个节点之间是否已有连线（同一方向） */
  function hasEdge(sourceId: string, targetId: string): boolean {
    return edges.value.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId)
  }

  /**
   * 建立一条连线。
   * 拒绝三种情况并给出可展示的原因：自环、重复、端点不存在。
   * 反向连线（B→A）是允许的 —— 剧情可以有双向分支。
   */
  function addEdge(sourceId: string, targetId: string): boolean {
    if (sourceId === targetId) {
      lastError.value = '不能把卡片连到它自己'
      return false
    }

    const nodes = new Set(anchors.value.map((anchor) => anchor.sceneId))
    if (!nodes.has(sourceId) || !nodes.has(targetId)) {
      lastError.value = '连线两端必须是已存在的卡片'
      return false
    }

    if (hasEdge(sourceId, targetId)) {
      lastError.value = '这两个节点之间已经有连线了'
      return false
    }

    edges.value.push({ id: `EDGE_${sourceId}__${targetId}`, sourceId, targetId })
    syncAnchorsForDemo()
    return true
  }

  /** 删除一条连线 */
  function removeEdge(edgeId: string): void {
    edges.value = edges.value.filter((edge) => edge.id !== edgeId)
    syncAnchorsForDemo()
  }

  /**
   * 读取锚点列表。
   * ⚠️ 契约缺口：接口文档只提供 POST /plan/anchors（保存），**没有查询锚点的接口**。
   *    - 演示模式：假后端持有已持久化的锚点，可以真正回读 —— 刷新后时间线还在；
   *    - 真实后端：没有接口可打，因此保持会话内存里的那一份，不做任何覆盖。
   *      后端补上 GET 之后，只需把真实分支换成真实请求，调用方无需改动。
   */
  async function fetchAnchors(): Promise<SceneAnchor[]> {
    if (isStudioMockMode) {
      // TODO: 待后端接入，当前为演示用 Mock
      anchors.value = readMockAnchors()
      edges.value = readMockEdges()
    }

    return anchors.value
  }

  /**
   * 保存锚点与连线 —— POST /api/v1/plan/anchors。
   *
   * 请求体是**扁平双 List**（见 types/studio.ts 的 StoryGraphPayload）：
   *   { nodes: [...], edges: [...] }
   * 不再是把锚点数组直接当 body —— 那样连线没有地方放，只能塞进节点里（树形结构，已禁止）。
   * ⚠️ 契约未定义返回体：只有回执确实是数组时才采信它，否则保留本地锚点 ——
   *    不然后端回 null / 空对象时，一次成功的保存会把时间线清空或显示成失败。
   */
  async function saveAnchors(): Promise<boolean> {
    if (anchors.value.length === 0) {
      lastError.value = '还没有锚点可保存'
      return false
    }

    saving.value = true
    lastError.value = null
    try {
      const saved = await saveSceneAnchors(storyGraph.value)
      if (Array.isArray(saved) && saved.length > 0) {
        anchors.value = saved.map((anchor) => ({ ...anchor }))
      }
      return true
    } catch (error) {
      lastError.value = describeError(error, '锚点保存失败')
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * 一键生成：触发 AI 插值 —— POST /api/v1/plan/interpolate。
   * 演算全部在后端（HTN → Agent → TTS），前端只等待一次响应，
   * 因此这里**不伪造进度**：契约没有进度接口，界面只能表示「已提交、等待返回」。
   */
  async function triggerInterpolate(
    payload: InterpolateRequest,
  ): Promise<InterpolateResultData | null> {
    // 演示模式下假后端需要知道「当前锚点是什么」才能按时间线把它们连成分支；
    // 真实后端模式这是空操作（后端库里本来就有锚点）。
    // TODO: 待后端接入，当前为演示用 Mock
    syncMockAnchors(anchors.value)

    generating.value = true
    lastError.value = null
    try {
      const result = await interpolatePlan(payload)
      interpolateResult.value = result ?? null
      return interpolateResult.value
    } catch (error) {
      lastError.value = describeError(error, 'AI 插值生成失败')
      return null
    } finally {
      generating.value = false
    }
  }

  /**
   * 导出纯音频片段 —— POST /api/v1/plan/export-segment。
   * 契约明确要求：成品由后端把选中节点的音频按顺序拼接后交付，
   * 前端**不能**自己截取后端返回的音频列表来充当导出结果。
   */
  async function exportSegment(sceneIds: string[]): Promise<ExportSegmentData | null> {
    if (sceneIds.length === 0) {
      lastError.value = '请先勾选要导出的场景'
      return null
    }

    exporting.value = true
    lastError.value = null
    try {
      const result = await requestExportSegment({ sceneIds })
      exportResult.value = result ?? null
      return exportResult.value
    } catch (error) {
      lastError.value = describeError(error, '片段导出失败')
      return null
    } finally {
      exporting.value = false
    }
  }

  /* =============================================================
   * 配音
   * ============================================================= */

  /**
   * 读取某个角色的配音配置（GET /voices/{characterId}）。
   *
   * ⚠️ 当前**没有调用方**：创作台侧的配音配置弹窗删除后，没有界面需要「回显某角色已存的音色」。
   *    保留它是因为它已按契约实现、且是「进播放页预选上次保存的音色」的唯一现成入口 ——
   *    真要接，在 PlayerView 的 onMounted 调一次即可（404 = 未配置，不报错）。
   *    若长期不需要，与 voiceOf 一起删掉。
   */
  async function loadVoice(characterId: string): Promise<VoiceConfig | null> {
    try {
      const config = await getVoiceConfig(characterId)
      voices.value[characterId] = config
      return config
    } catch (error) {
      // 「这个角色还没配过音」不是错误：演示模式的假后端以 404 表示未配置，
      // 按「未配置」返回 null 即可 —— 平白弹一条错误会让人以为功能坏了。
      if (error instanceof ApiRequestError && error.status === 404) {
        return null
      }

      lastError.value = describeError(error, '配音配置读取失败')
      return null
    }
  }

  /** 保存配音配置 */
  async function saveVoice(config: VoiceConfig): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      // 契约未定义 POST /voices 的返回体：只有回执确实是配置对象时才采信它，
      // 否则以刚提交的内容为准 —— 不然后端回 null / 空对象时，
      // 一次成功的保存会被界面显示成「未配置」。
      const saved = await saveVoiceConfig(config)
      voices.value[config.characterId] = isVoiceConfig(saved) ? saved : { ...config }
      return true
    } catch (error) {
      lastError.value = describeError(error, '配音配置保存失败')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    // 状态
    resources,
    anchors,
    edges,
    voices,
    loading,
    saving,
    generating,
    exporting,
    interpolateResult,
    exportResult,
    lastError,
    // 派生
    demoMode,
    resourceCount,
    anchorCount,
    edgeCount,
    resourceGroups,
    anchorGroups,
    storyGraph,
    // 查询
    voiceOf,
    clearError,
    hasEdge,
    // 资源
    loadResources,
    addResource,
    editResource,
    removeResource,
    // 剧情锚点（时间线）
    addAnchor,
    updateAnchor,
    removeAnchor,
    fetchAnchors,
    saveAnchors,
    // 画布（坐标与连线）
    ensureAnchorPositions,
    updateAnchorPosition,
    addEdge,
    removeEdge,
    // 生成与导出
    triggerInterpolate,
    exportSegment,
    // 配音
    loadVoice,
    saveVoice,
  }
})
