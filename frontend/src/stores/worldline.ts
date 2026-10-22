/**
 * 世界线状态（Pinia）
 * ---------------------------------------------------------------
 * AVG 互动小说的核心：维护「当前世界线」—— 听众这一周目实际走过的节点路径。
 *
 * 【与 stores/player.ts 的分工（这是本文件存在的理由）】
 *   两者都是「场景序列」，但语义完全不同，**不要合并**：
 *     · player.playlist   = 当前这一段音频的播放队列。含「提前点开分支先入队」，
 *                           可以在队列里前后移动（上一段 / 下一段），换分支时被截断重建；
 *     · worldline.history = 真正走过的世界线。**只追加，不可回退** ——
 *                           「重听上一段」不该在世界线上多记一笔，否则存档里的路径是错的。
 *   因此队列会暂时比世界线长（目标已入队但还没听到），两者必须分开维护。
 *
 * 【为什么要有「待确认」这一步】
 *   选分支时会先把 targetScene 入队（契约要求零延迟开播），但「入队」不等于「已走过」：
 *   听众可能在入队后立刻又换了另一条分支。所以世界线只在**真的开始播那一段**时
 *   才提交（commitEntry），由播放页在切场时调用。
 *   这样世界线记录的永远是「确实听过 / 正在听」的节点。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { PlayScene, WorldlineState, WorldlineStep } from '@/types/studio'
import { anchorTitle } from '@/utils/studioVocabulary'

/**
 * 世界线上最多保留的步数。
 * 路径是拿来展示与存档的，不是审计日志；剧情出现回环（A→B→A）时会无限增长，
 * 因此设一个上限，超出后丢弃最早的部分 —— 只影响「最早走过哪」的展示，
 * 不影响存档恢复（存档存的是当时那一刻的完整路径，见 services/saves.ts）。
 */
const MAX_HISTORY = 200

export const useWorldlineStore = defineStore('worldline', () => {
  /* =============================================================
   * 状态
   * ============================================================= */

  /** 走过的节点路径（按顺序，最后一项即当前节点） */
  const nodeHistory = ref<WorldlineStep[]>([])

  /** 当前所在节点 id（空串 = 还没有开始走） */
  const currentNodeId = ref('')

  /* =============================================================
   * 派生
   * ============================================================= */

  /** 当前世界线状态（存档要持久化的就是它） */
  const currentWorldline = computed<WorldlineState>(() => ({
    currentNodeId: currentNodeId.value,
    nodeHistory: nodeHistory.value,
  }))

  /** 走过的节点数（含当前节点） */
  const stepCount = computed(() => nodeHistory.value.length)

  /** 是否已经开过一条世界线 */
  const hasWorldline = computed(() => nodeHistory.value.length > 0)

  /**
   * 形态化的世界线路径：给界面展示「A → B → C」用。
   * 取 cardName（回退 sceneId），与剧情卡的标题口径保持一致。
   */
  const pathLabels = computed(() => nodeHistory.value.map((step) => anchorTitle(step)))

  /**
   * 世界线是否已经出现过分岔（走过某个有多条出边的节点）。
   * 用于在界面上说明「这是一条分支世界线」，而不是把线性剧情也说成分支。
   */
  const hasBranched = computed(() => nodeHistory.value.some((step) => step.viaAction !== ''))

  /* =============================================================
   * 操作
   * ============================================================= */

  /**
   * 开始一条新的世界线（进入播放页、或读档后重置时调用）。
   * 只记录起点，不追加第二步。
   *
   * @param scene 起始场景（用它的 sceneId 与文本推卡片名）
   */
  function start(scene: PlayScene): void {
    const now = Date.now()
    const sceneId = scene.sceneId.trim()
    if (sceneId === '') {
      return
    }

    currentNodeId.value = sceneId
    nodeHistory.value = [
      {
        step: 0,
        sceneId,
        // 播放域的 PlayScene 没有 cardName 字段（契约里只有 sceneId / text / speaker），
        // 因此这里用「场景文本的前几个字」做展示名；读档回来时也一样。
        cardName: sceneCardName(scene),
        viaAction: '',
        enteredAt: now,
      },
    ]
  }

  /**
   * 提交一步：进入某个节点。**在真的开始播那一段时调用**（见文件头的说明）。
   *
   * @param scene     进入的场景
   * @param viaAction 从上一节点走到这里时选的选项文案；直接加载（非分支）时传空串
   */
  function commitEntry(scene: PlayScene, viaAction: string): void {
    const sceneId = scene.sceneId.trim()
    if (sceneId === '') {
      return
    }

    const now = Date.now()
    const step = nodeHistory.value.length

    const next: WorldlineStep = {
      step,
      sceneId,
      cardName: sceneCardName(scene),
      viaAction,
      enteredAt: now,
    }

    const appended = [...nodeHistory.value, next]
    nodeHistory.value = appended.length > MAX_HISTORY ? appended.slice(-MAX_HISTORY) : appended
    currentNodeId.value = sceneId
  }

  /**
   * 整体替换世界线（读档时调用）。
   * 深拷贝一份：存档里的数组不能与运行时共享引用，否则继续玩下去会把存档一起改掉。
   */
  function restore(state: WorldlineState): void {
    nodeHistory.value = state.nodeHistory.map((step) => ({ ...step }))
    currentNodeId.value = state.currentNodeId
  }

  /** 清空世界线（离开播放页时调用） */
  function reset(): void {
    nodeHistory.value = []
    currentNodeId.value = ''
  }

  /**
   * 由播放场景推一个展示用卡片名。
   *
   * 播放域契约（文档 4.1）里没有 cardName 字段，只有 sceneId / text / speaker，
   * 所以这里不能凭空造一个「名称」—— 用场景文本的开头做摘要，
   * 让存档列表与路径展示能认出「这一段说的是什么」。
   * 文本为空时回退 sceneId。
   */
  function sceneCardName(scene: PlayScene): string {
    const text = scene.text.trim()
    if (text === '') {
      return scene.sceneId
    }

    const SUMMARY_LENGTH = 14
    return text.length > SUMMARY_LENGTH ? `${text.slice(0, SUMMARY_LENGTH)}…` : text
  }

  return {
    // 状态
    nodeHistory,
    currentNodeId,
    // 派生
    currentWorldline,
    stepCount,
    hasWorldline,
    pathLabels,
    hasBranched,
    // 操作
    start,
    commitEntry,
    restore,
    reset,
  }
})
