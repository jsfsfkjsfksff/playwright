/**
 * 创作台状态（Pinia）
 * ---------------------------------------------------------------
 * 管理三块状态：资源（resources）、剧情锚点（anchors）、配音配置（voices）。
 *
 * 关于「演示模式（Mock）」时的行为（本 store 最重要的约定）：
 *   - 本 store **不区分数据来源**：它只管调用 services 层，由 services 决定发真实请求
 *     还是返回本地假数据（见 services/studio.ts 的 isStudioMockMode）。
 *     这样接入真实后端时，本文件与所有组件都不需要改动。
 *   - 唯一的例外是 loadVoice 的演示模式早退（见该函数注释），以及用于界面提示的
 *     demoMode；两者都只是为了让界面说的话与事实一致。
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
  saveSceneAnchors,
  saveVoiceConfig,
  syncMockAnchors,
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
  PropertyUpdatePayload,
  SceneAnchor,
  SceneAnchorPatch,
  VoiceConfig,
  VoiceConfigData,
} from '@/types/studio'
import { PROPERTY_TYPES } from '@/utils/studioVocabulary'

/** 资源类型分组的展示顺序（与词汇表保持一致，避免两处各写一份） */
const TYPE_ORDER = PROPERTY_TYPES

/**
 * 回执是否是一个可用的配音配置。
 * 后端结构由我们定义（VoiceConfigData），但保存回执仍可能是 null / 空对象，
 * 因此只有确实带回 voiceName 时才采信它，否则以刚提交的内容为准 ——
 * 不然后端回 null 时，一次成功的保存会被界面显示成「未配置」。
 */
function isVoiceConfig(value: unknown): value is VoiceConfig {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<VoiceConfig>
  return typeof candidate.voiceName === 'string'
}

export const useStudioStore = defineStore('studio', () => {
  /* =============================================================
   * 状态
   * ============================================================= */

  const resources = ref<PropertyResponse[]>([])

  /** 剧情锚点（时间线）：由操作编辑页维护，提交走 POST /plan/anchors */
  const anchors = ref<SceneAnchor[]>([])

  /**
   * 全篇唯一的配音配置。
   * null = 还没读过；读取后即使后端从未配置过也会拿到默认值（configured = false）。
   */
  const voice = ref<VoiceConfigData | null>(null)

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

  /**
   * 配音是否是用户真的配过的。
   * false 表示当前显示的是后端默认值，界面据此说明「还没配过」，
   * 不把默认音色说成用户的选择。
   */
  const voiceConfigured = computed(() => voice.value?.configured === true)

  const resourceCount = computed(() => resources.value.length)
  const anchorCount = computed(() => anchors.value.length)

  /** 按类型分组，供资源面板直接 v-for 渲染 */
  const resourceGroups = computed(() =>
    TYPE_ORDER.map((type) => ({
      type,
      items: resources.value.filter((item) => item.type === type),
    })),
  )

  /** 角色名列表：锚点「说话人」下拉的数据来源（只取 CHARACTER 类型资源） */
  const characters = computed(() =>
    resources.value.filter((item) => item.type === 'CHARACTER').map((item) => item.name),
  )

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
   * 清空失败原因。
   * lastError 是所有写操作共用的一条状态，打开某个面板（生成 / 导出）前先清掉，
   * 否则弹窗里会显示上一个操作留下的错误，看起来像是这次操作失败了。
   */
  function clearError(): void {
    lastError.value = null
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
   * 列表项 → 视图模型。
   * 契约的列表接口只回传 `nodeId / name / type`，所以 description / attributes / status
   * 一律置 null（含义是「后端没给这个字段」），卡片据此显示「列表接口未返回描述」，
   * 而不是谎称「内容为空」。
   */
  function fromListItem(item: PropertyListItem): PropertyResponse {
    return {
      nodeId: item.nodeId,
      type: item.type,
      name: item.name,
      description: null,
      attributes: null,
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
      lastError.value = describeError(error, '资源修改失败')
      return false
    } finally {
      saving.value = false
    }
  }

  /** 删除资源（配音是全篇唯一配置，与资源无关，这里不做任何清理） */
  async function removeResource(nodeId: string): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      await deleteProperty(nodeId)

      resources.value = resources.value.filter((item) => item.nodeId !== nodeId)
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

  /** 修改锚点：只改补丁里出现的字段（sceneId 不可改） */
  function updateAnchor(sceneId: string, patch: SceneAnchorPatch): boolean {
    const index = anchors.value.findIndex((item) => item.sceneId === sceneId)
    if (index < 0) {
      lastError.value = '要修改的锚点不存在，可能已被删除'
      return false
    }

    anchors.value[index] = { ...anchors.value[index], ...patch }
    syncAnchorsForDemo()
    return true
  }

  /** 删除锚点 */
  function removeAnchor(sceneId: string): void {
    anchors.value = anchors.value.filter((item) => item.sceneId !== sceneId)
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
    }

    return anchors.value
  }

  /**
   * 保存锚点 —— POST /api/v1/plan/anchors（契约：请求体直接是锚点数组）。
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
      const saved = await saveSceneAnchors(anchors.value.map((anchor) => ({ ...anchor })))
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
   * 配音（全篇唯一）
   * ============================================================= */

  /**
   * 读取全篇配音配置。
   * 后端在「从未配置」时也返回 200 + 默认值（configured = false），
   * 所以这里只有真正的请求失败才写 lastError —— 「还没配过」不是错误。
   */
  async function loadVoice(): Promise<void> {
    try {
      voice.value = await getVoiceConfig()
    } catch (error) {
      lastError.value = describeError(error, '配音配置读取失败')
    }
  }

  /** 保存全篇配音配置（全篇唯一，重复保存只更新同一条） */
  async function saveVoice(config: VoiceConfig): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      const saved = await saveVoiceConfig(config)
      // 只有回执确实带回 voiceName 时才采信它，否则以刚提交的内容为准（configured 视为 true：刚存成功）
      voice.value = isVoiceConfig(saved)
        ? { ...saved, configured: true }
        : { ...config, configured: true }
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
    voice,
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
    resourceGroups,
    characters,
    anchorGroups,
    voiceConfigured,
    // 查询
    clearError,
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
    // 生成与导出
    triggerInterpolate,
    exportSegment,
    // 配音
    loadVoice,
    saveVoice,
  }
})
