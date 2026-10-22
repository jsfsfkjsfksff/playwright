/**
 * 存读档服务（Save & Load）
 * ---------------------------------------------------------------
 * 职责：把《世界线存档》读写到浏览器的 localStorage，供 AVG 播放页的
 * 存档 / 读档弹窗使用。
 *
 * 【为什么是 localStorage 而不是后端接口】
 *   契约（接口文档 v1.0）**没有任何存档相关接口** —— 整个文档只有
 *   properties / voices / plan / play 四个域，没有 save / load / archive。
 *   而需求明确要求「前端使用 localStorage（或 IndexedDB）实现本地存储」，
 *   因此这里就是最终实现，不是临时的 Mock。
 *   与 services/mock/ 的区别要分清：
 *     · services/mock/ 是「替代尚未接入的后端」，接入真实后端后整目录删除；
 *     · 本文件是「需求要求由前端负责的能力」，后端接入后**依然保留**。
 *
 * 【为什么不用 IndexedDB】
 *   需求允许二选一。存档数据量极小（每条几百字节，几十条也就几十 KB），
 *   远未触及 localStorage 约 5MB 的配额；而 localStorage 是同步 API，
 *   读档时不需要处理「异步加载中」这一层状态，代码与交互都更简单。
 *   将来若真要存音频快照之类的大对象，再换 IndexedDB，届时只需改本文件。
 *
 * 【写失败怎么办】
 *   隐私模式、配额写满都会让 setItem 抛异常。这里**不让异常冒到界面**，
 *   而是返回失败原因，由调用方如实提示 —— 绝不假装存上了
 *   （那才是真正糟糕的体验：用户以为存好了，回来发现没有）。
 */
import type { SaveData, SaveStorePayload } from '@/types/studio'

/**
 * 存储键。
 * 与演示模式的假后端（`nw-demo-backend-v1`）刻意分开：
 * 存档是**用户资产**，不该在后端接入、演示数据清空时被一起删掉。
 */
const STORAGE_KEY = 'nw-worldline-saves-v1'

/**
 * 当前存储结构版本。
 * 读出来的 version 与之不等时整批丢弃 —— 结构变了却硬读，只会得到一堆残缺存档。
 */
const STORAGE_VERSION = 1

/**
 * 单份存档最多保留的条数。
 * 存档列表是让人「挑一个继续读」的，不是归档系统；超过这个数就淘汰最旧的。
 */
export const MAX_SAVES = 30

/** 存档列表上限文案（界面提示用，避免两处各写一个数字） */
export const MAX_SAVES_HINT = `最多保留 ${MAX_SAVES} 份存档，超出时会自动删除最旧的一份`

/** 一次读写的结果：成功与否 + 可展示的原因 */
export interface SaveOperationResult {
  ok: boolean
  /** 失败原因（成功时为 null）；文案直接可展示 */
  reason: string | null
}

/**
 * 判定一个值是否是结构完整的存档。
 *
 * 为什么要校验而不是直接信任：localStorage 是用户可编辑、且跨版本共存的，
 * 读到半截数据（例如手工改坏、旧版本残留）时，宁可丢弃这一条，
 * 也不要让 `undefined` 流进界面把播放页搞崩。
 */
function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<SaveData>

  return (
    typeof candidate.id === 'string' &&
    candidate.id !== '' &&
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt) &&
    typeof candidate.currentNodeId === 'string' &&
    candidate.currentNodeId !== '' &&
    Array.isArray(candidate.nodeHistory)
  )
}

/** 读取整批存档；任何异常或版本不符都退回空列表，不阻塞页面 */
export function listSaves(): SaveData[] {
  let raw: string | null = null

  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // 隐私模式下连读都可能抛异常
    return []
  }

  if (raw === null || raw === '') {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return []
    }

    const payload = parsed as Partial<SaveStorePayload>
    if (payload.version !== STORAGE_VERSION || !Array.isArray(payload.saves)) {
      return []
    }

    // 逐条校验，坏的那条丢掉，好的照常显示
    return payload.saves.filter(isSaveData)
  } catch {
    return []
  }
}

/**
 * 写入整批存档。
 * 返回失败原因而不是抛异常 —— 调用方需要把它显示出来。
 */
function writeSaves(saves: readonly SaveData[]): SaveOperationResult {
  const payload: SaveStorePayload = { version: STORAGE_VERSION, saves: [...saves] }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return { ok: true, reason: null }
  } catch (cause) {
    const isQuota =
      cause instanceof DOMException &&
      (cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED')

    return {
      ok: false,
      reason: isQuota
        ? '浏览器存储空间已满，存档未写入。请先删除一些旧存档。'
        : '当前浏览器不允许写入本地存储（可能处于隐私模式），存档未保存。',
    }
  }
}

/**
 * 新建一份存档。
 *
 * @param draft 除 id / savedAt 之外的字段；两者由本函数生成，避免调用方各写一套
 * @returns 成功时返回写好的存档（含生成的 id），失败时返回原因
 */
export function createSave(
  draft: Omit<SaveData, 'id' | 'savedAt'>,
): { save: SaveData | null; reason: string | null } {
  const now = Date.now()

  const save: SaveData = {
    ...draft,
    id: `SAVE_${now}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now,
    // 深拷贝路径：存档必须与后续的剧情推进脱钩，否则存完继续玩，旧档也跟着变
    nodeHistory: draft.nodeHistory.map((step) => ({ ...step })),
  }

  // 最新的排在最前面（列表按新→旧展示）
  const next = [save, ...listSaves()]

  // 超出上限就淘汰最旧的（数组尾部）
  const trimmed = next.length > MAX_SAVES ? next.slice(0, MAX_SAVES) : next

  const result = writeSaves(trimmed)
  if (!result.ok) {
    return { save: null, reason: result.reason }
  }

  return { save, reason: null }
}

/**
 * 覆盖一份已有存档（例如「就地更新」）。
 * 存档不存在时按新增处理 —— 这样调用方不必先查一次列表。
 */
export function overwriteSave(save: SaveData): SaveOperationResult {
  const existing = listSaves()
  const index = existing.findIndex((item) => item.id === save.id)

  const next = [...existing]
  if (index >= 0) {
    next[index] = { ...save, nodeHistory: save.nodeHistory.map((step) => ({ ...step })) }
  } else {
    next.unshift({ ...save, nodeHistory: save.nodeHistory.map((step) => ({ ...step })) })
  }

  return writeSaves(next.length > MAX_SAVES ? next.slice(0, MAX_SAVES) : next)
}

/** 删除一份存档；id 不存在时也算成功（结果一致：它不在了） */
export function deleteSave(id: string): SaveOperationResult {
  const next = listSaves().filter((item) => item.id !== id)
  return writeSaves(next)
}

/** 清空全部存档 */
export function clearSaves(): SaveOperationResult {
  return writeSaves([])
}
