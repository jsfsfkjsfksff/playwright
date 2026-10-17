/**
 * 播放器状态（Pinia）
 * ---------------------------------------------------------------
 * 数据来源：GET /api/v1/play/scene/{sceneId}（消费播放域）。
 *
 * 这个 store **不碰 DOM**：不创建 Audio、不注册事件、不持有定时器。
 * 组件持有 `<audio>` 元素并把事件喂进来（timeupdate / loadedmetadata / ended …），
 * store 只做「由时间推导出该显示哪一句」这类纯逻辑，因此可以单独推理与验证。
 *
 * 【字幕同步的唯一时间锚点】
 *   `currentTime` 是唯一的时间来源，字幕下标是由它 **computed** 出来的：
 *       currentTime（来自 timeupdate） → cueIndex → 高亮哪一句
 *   全程没有任何 setTimeout / setInterval / requestAnimationFrame 参与字幕推进：
 *   暂停即停、拖进度条即跳，不会出现字幕与音频各走各的。
 *   （页面当前**没有倍速控件**；将来加上 playbackRate 也会自动跟随，
 *     因为下标是由 currentTime 算出来的，不依赖任何计时器。）
 *   （纯聆听模式的「3 秒后自动隐藏控件」是纯 UI 计时，与字幕无关，放在组件里。）
 *
 * 【契约没给逐句时间轴】
 *   文档给出的场景对象只有 text / speaker / audioUrl，**没有任何字幕时间戳**。
 *   因此这里按「句长比例」把音频总时长分配给各句，并把这一事实暴露成
 *   `timelineIsEstimated`，界面必须据此标注「按句长估算」，不能声称是真对齐。
 *   后端补上 subtitles 字段后，buildTimeline 会自动改用真实时间轴。
 *
 * 【分支为什么既「零延迟」又「再请求一次」】
 *   契约 4.2：edges[i].targetScene 已带全下一层的台词与音频地址，
 *   点击分支无需再发请求 → 这里用嵌套数据**立刻开播**，不转圈；
 *   但后端对 targetScene 标了 @JsonIgnoreProperties("edges")，
 *   嵌套层的 edges 恒为空 → 于是紧接着补拉一次该场景，把它的分支取回来。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiRequestError } from '@/services/api'
import { getPlayScene } from '@/services/studio'
import type { PlayEdge, PlayScene, PlaySubtitleCue } from '@/types/studio'

/** 播放页的两种呈现模式 */
export type PlayerMode = 'text' | 'listen'

/**
 * 判定当前句时允许的微小提前量（秒）。
 * timeupdate 间隔约 250ms，加上浮点误差，留 0.12s 容差，
 * 避免第一句在 0.00 → 0.06 这种抖动下闪一下。
 */
const CUE_EPSILON = 0.12

/** 单句期望的最小时长（秒）；音频过短时会按句数等比缩小，见 buildTimeline */
const MIN_CUE_DURATION = 0.35

/** 距结尾多少秒内算「这一段已经播完」 */
const END_TOLERANCE = 0.2

/**
 * 按句末标点切句（不用正则 lookbehind，避免个别运行时的差异）。
 * 保留标点，每段去掉首尾空白，空段丢弃。
 */
function splitSentences(text: string): string[] {
  const ENDINGS = '。！？!?；;…\n'
  const sentences: string[] = []
  let buffer = ''

  for (const char of text) {
    if (char === '\r') {
      continue
    }

    buffer += char

    if (ENDINGS.includes(char)) {
      const trimmed = buffer.trim()
      if (trimmed !== '') {
        sentences.push(trimmed)
      }
      buffer = ''
    }
  }

  const rest = buffer.trim()
  if (rest !== '') {
    sentences.push(rest)
  }

  return sentences
}

/** 句子权重：按非空白字符数计，空白不参与分配 */
function sentenceWeight(sentence: string): number {
  let weight = 0

  for (const char of sentence) {
    if (char.trim() !== '') {
      weight += 1
    }
  }

  return weight
}

/**
 * 构建字幕时间轴。
 *   1. 后端给了真实时间轴（scene.subtitles）→ 直接用，不做任何加工；
 *   2. 否则按句长比例把 duration 分配给各句（估算，界面需标注）；
 *   3. duration 还没拿到（音频元数据未加载）→ 返回空数组，界面显示「等待音频就绪」。
 */
function buildTimeline(scene: PlayScene | null, duration: number): PlaySubtitleCue[] {
  if (scene === null) {
    return []
  }

  const provided = scene.subtitles
  if (provided !== undefined && provided.length > 0) {
    return provided.map((cue) => ({ text: cue.text, start: cue.start, end: cue.end }))
  }

  const sentences = splitSentences(scene.text)
  if (sentences.length === 0 || !Number.isFinite(duration) || duration <= 0) {
    return []
  }

  const weights = sentences.map(sentenceWeight)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  // text 只有标点之类的情况会退化成等分，避免除以 0
  const useEqualShare = totalWeight <= 0
  // 音频很短、句子很多时，最小时长等比缩小，避免把后面的句子挤成 0 长度
  const minDuration = Math.min(MIN_CUE_DURATION, duration / sentences.length)

  const cues: PlaySubtitleCue[] = []
  let cursor = 0

  sentences.forEach((sentence, index) => {
    const isLast = index === sentences.length - 1
    const start = cursor

    if (isLast) {
      // 最后一句一定收在音频结尾，避免累计误差留下尾巴
      cues.push({ text: sentence, start, end: duration })
      cursor = duration
      return
    }

    const share = useEqualShare ? 1 / sentences.length : weights[index] / totalWeight
    const rawEnd = start + duration * share
    const remaining = sentences.length - index - 1
    // 给后面每句留出最小空间，同时自己至少占 minDuration
    const maxEnd = Math.max(start, duration - remaining * minDuration)
    const end = Math.min(Math.max(rawEnd, start + minDuration), maxEnd)

    cues.push({ text: sentence, start, end })
    cursor = end
  })

  return cues
}

/** 由时间求当前句下标：最后一个 start 已到达的句子；还没到第一句时返回 -1 */
function cueIndexAt(cues: readonly PlaySubtitleCue[], time: number): number {
  let index = -1

  for (let i = 0; i < cues.length; i += 1) {
    if (time + CUE_EPSILON >= cues[i].start) {
      index = i
    } else {
      break
    }
  }

  return index
}

export const usePlayerStore = defineStore('player', () => {
  /* =============================================================
   * 状态
   * ============================================================= */

  /**
   * 播放路径（队列）：听众一路选下来的场景序列。
   * 选中分支时把 targetScene **追加**进来；当前这段还没播完就先入队，
   * 播完由 handleEnded 自动续上（听觉上无缝，也不打断正在说的那句）。
   */
  const playlist = ref<PlayScene[]>([])
  const currentIndex = ref(0)

  /** 首次加载 / 按 sceneId 重新拉取中 */
  const loading = ref(false)

  /** 致命错误：场景都拿不到，页面显示失败态与重试 */
  const error = ref<string | null>(null)

  /** 非致命提示：分支被丢弃、缺音频、补拉失败等「能用但要说清楚」的情况 */
  const notice = ref<string | null>(null)

  const mode = ref<PlayerMode>('text')

  /** 音频播放状态（由 <audio> 事件同步进来） */
  const playing = ref(false)
  /** 音频元数据已就绪（估算时间轴依赖时长） */
  const ready = ref(false)
  /** 浏览器拦下了自动播放，需要用户点一下 */
  const needsGesture = ref(false)

  /** 唯一时间锚点：只由 <audio> 的 timeupdate / seeked 写入 */
  const currentTime = ref(0)
  const duration = ref(0)

  /** 当前音频已播完、正在等听众选分支 */
  const awaitingBranch = ref(false)

  /** 听众手动提前点开了分支 */
  const edgesOpened = ref(false)

  /**
   * 「当前场景需要重新装载音频」的信号：每当 resetPlaybackState 被执行就自增一次。
   * 组件 watch 它来决定何时 element.load() + play()。
   *
   * 为什么用显式的自增信号，而不是让组件去 watch audioUrl / sceneId：
   *   1. 两段不同场景可能共用同一个音频地址（演示模式的静音音频按长度复用同一个
   *      object URL），只看 audioUrl 会漏掉换场 —— 元素停在上一次的 ended 位置，
   *      界面显示新台词却不出声、进度也不动；
   *   2. 同一个 sceneId 也可能需要重新装载（例如失败后重试）。
   *   一个自增信号把这两种情况都覆盖掉，语义单一、不会漏也不会重。
   */
  const reloadToken = ref(0)

  /* =============================================================
   * 派生
   * ============================================================= */

  const currentScene = computed<PlayScene | null>(() => playlist.value[currentIndex.value] ?? null)

  const edges = computed<PlayEdge[]>(() => currentScene.value?.edges ?? [])

  const hasNextInQueue = computed(() => currentIndex.value + 1 < playlist.value.length)

  /** 已入队、等这一段播完自动接上的场景 */
  const queuedScene = computed<PlayScene | null>(
    () => playlist.value[currentIndex.value + 1] ?? null,
  )

  /** 队列里已经走过至少一段（用于「重听上一段」） */
  const hasPrevious = computed(() => currentIndex.value > 0)

  /** 这一段是否已经播完（时长未知时不算播完） */
  const currentFinished = computed(
    () => duration.value > 0 && currentTime.value >= duration.value - END_TOLERANCE,
  )

  /** 进度：0–1，供进度条使用（时长未知时为 0） */
  const progress = computed(() => {
    if (!Number.isFinite(duration.value) || duration.value <= 0) {
      return 0
    }

    return Math.min(Math.max(currentTime.value / duration.value, 0), 1)
  })

  /** 字幕时间轴：真实时间轴优先，否则按句长估算 */
  const cues = computed<PlaySubtitleCue[]>(() => buildTimeline(currentScene.value, duration.value))

  /**
   * 当前句下标 —— 完全由 currentTime 推导，没有任何计时器参与。
   * 这就是「字幕跟着音频走」的唯一实现方式：时间变了，下标自然就变了。
   */
  const cueIndex = computed(() => cueIndexAt(cues.value, currentTime.value))

  /** 时间轴是不是估算出来的（界面据此标注，不谎称精确对齐） */
  const timelineIsEstimated = computed(
    () => cues.value.length > 0 && (currentScene.value?.subtitles?.length ?? 0) === 0,
  )

  /** 该场景是否真的可以播（没有音频地址就如实说明，不假装在播） */
  const hasAudio = computed(() => (currentScene.value?.audioUrl ?? '') !== '')

  /** 分支卡片是否该出现：有分支，且（已播完在等选择 或 听众主动提前打开） */
  const edgesVisible = computed(
    () => edges.value.length > 0 && (awaitingBranch.value || edgesOpened.value),
  )

  /* =============================================================
   * 内部工具
   * ============================================================= */

  function describeError(cause: unknown, fallback: string): string {
    if (cause instanceof ApiRequestError) {
      return cause.message
    }
    if (cause instanceof Error && cause.message !== '') {
      return cause.message
    }
    return fallback
  }

  /**
   * 换场景时必须重置的播放态：时间锚点、播放标记、等待选择、上一次的提示。
   *
   * 同时自增 reloadToken —— 组件据此重新装载 <audio>。
   * 把「重置状态」与「通知组件重新装载」绑在同一个动作里，
   * 就不会出现「状态重置了、音频却没换」这种只做了一半的情况。
   */
  function resetPlaybackState(): void {
    currentTime.value = 0
    duration.value = 0
    ready.value = false
    playing.value = false
    awaitingBranch.value = false
    edgesOpened.value = false
    // 上一个场景留下的提示在新场景里已经失效，必须清掉 ——
    // 否则「已加入队列 / 该场景没有音频地址」这类提示会一直挂在封面上（只增不减）。
    notice.value = null
    reloadToken.value += 1
  }

  /** 场景是否够用来播放（至少要能显示或能播，否则不值得入队） */
  function isUsableScene(scene: PlayScene | null | undefined): scene is PlayScene {
    if (scene === null || scene === undefined) {
      return false
    }

    return scene.sceneId !== '' && (scene.audioUrl !== '' || scene.text !== '')
  }

  /* =============================================================
   * 加载与切场景
   * ============================================================= */

  /**
   * 按 sceneId 拉取场景并作为播放起点 —— GET /api/v1/play/scene/{sceneId}
   * 用于首次进入页面，以及嵌套数据缺失时的兜底。
   */
  async function loadScene(sceneId: string): Promise<boolean> {
    const id = sceneId.trim()
    if (id === '') {
      error.value = '缺少 sceneId，无法加载场景'
      return false
    }

    loading.value = true
    error.value = null
    notice.value = null

    try {
      const scene = await getPlayScene(id)
      playlist.value = [scene]
      currentIndex.value = 0
      resetPlaybackState()

      if (scene.audioUrl === '') {
        notice.value = '该场景没有音频地址，只显示文本。'
      }

      return true
    } catch (cause) {
      error.value = describeError(cause, '场景加载失败')
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 选中一条分支。
   *
   * 契约说 targetScene 已带全数据、无需再请求，所以这里先用嵌套数据开播；
   * 又因为嵌套层的 edges 恒为空，紧接着补拉一次它的分支。
   *
   * 两种时机两种行为：
   *   - 当前这段已播完（或压根没在播）→ 立刻接上，听众点完就听到；
   *   - 当前这段还在播            → **追加到队列**，等这一段播完自动续上，
   *     不打断正在说的那句（这也是「无缝追加到播放队列」的落地）。
   */
  async function openEdge(edge: PlayEdge): Promise<void> {
    // 契约类型上 targetScene 必然存在，但线上数据不保证；用运行时检查兜住
    const target: PlayScene | null | undefined = edge.targetScene ?? null
    // 先取出 id：一旦进了下面的兜底分支，target 已被收窄成 null | undefined
    const fallbackId = target === null ? '' : target.sceneId.trim()

    if (!isUsableScene(target)) {
      if (fallbackId !== '') {
        await loadScene(fallbackId)
        return
      }

      notice.value = '这条分支没有可用的目标场景数据。'
      return
    }

    // 选了新分支 = 放弃原先的后续路径，把队列截断到当前位置再接上
    const base = playlist.value.slice(0, currentIndex.value + 1)
    const shouldQueue = playing.value && !currentFinished.value && !awaitingBranch.value

    playlist.value = [...base, target]
    // 记下这一段在队列里的下标：剧情回环时队列里会出现重复 sceneId，补拉分支必须按下标定位
    const targetIndex = playlist.value.length - 1

    if (shouldQueue) {
      notice.value = `已加入队列：${target.sceneId}（这一段播完后自动接上）`
    } else {
      currentIndex.value = targetIndex
      resetPlaybackState()

      if (target.audioUrl === '') {
        notice.value = '该场景没有音频地址，只显示文本。'
      }
    }

    void refreshEdges(target.sceneId, targetIndex)
  }

  /**
   * 补拉某个场景的分支（嵌套层的 edges 恒为空，需要单独取一次）。
   * 只更新队列里对应那一项的 edges，不打断当前播放。
   *
   * @param index 该场景在队列里的下标。**必须按下标定位，不能按 sceneId 查找**：
   *   剧情出现回环（A→B→A）时队列里会有重复 id，按 id 会命中较早的那一条，
   *   于是当前场景的分支永远补不上 —— 表现为分支卡不出现、剧情走不下去。
   */
  async function refreshEdges(sceneId: string, index: number): Promise<void> {
    try {
      const scene = await getPlayScene(sceneId)
      const existing = playlist.value[index]

      if (existing !== undefined && existing.sceneId === sceneId) {
        playlist.value[index] = {
          ...existing,
          edges: scene.edges,
          // 后端若给了真实字幕时间轴，也一并采用
          ...(scene.subtitles !== undefined ? { subtitles: scene.subtitles } : {}),
        }
      }
    } catch (cause) {
      // 音频已经在播，这里失败只影响「还能往哪走」，如实提示但不打断收听
      notice.value = `后续分支未取到：${describeError(cause, '请求失败')}`
    }
  }

  /** 音频播完：队列里还有下一段就直接续播，否则进入「等待选择分支」 */
  function handleEnded(): void {
    playing.value = false

    if (hasNextInQueue.value) {
      currentIndex.value += 1
      resetPlaybackState()
      return
    }

    awaitingBranch.value = true
  }

  /** 重听当前这一段（回到 0 秒由组件执行，这里只重置状态） */
  function replay(): void {
    currentTime.value = 0
    awaitingBranch.value = false
    edgesOpened.value = false
  }

  /** 回到队列里的上一段 */
  function goPrevious(): void {
    if (!hasPrevious.value) {
      return
    }

    currentIndex.value -= 1
    resetPlaybackState()
  }

  /** 切到队列里的下一段 */
  function goNext(): void {
    if (!hasNextInQueue.value) {
      return
    }

    currentIndex.value += 1
    resetPlaybackState()
  }

  /* =============================================================
   * 由 <audio> 元素喂进来的事件
   * ============================================================= */

  /** timeupdate / seeked：写入唯一时间锚点 */
  function syncTime(time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      return
    }

    currentTime.value = time

    // 从结尾拖回中间时，撤掉「等待选择」
    if (awaitingBranch.value && duration.value > 0 && time < duration.value - END_TOLERANCE) {
      awaitingBranch.value = false
    }
  }

  /** loadedmetadata：真实时长（估算时间轴依赖它） */
  function syncDuration(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      duration.value = 0
      ready.value = false
      return
    }

    duration.value = value
    ready.value = true
  }

  function setPlaying(value: boolean): void {
    playing.value = value
  }

  function setNeedsGesture(value: boolean): void {
    needsGesture.value = value
  }

  function setMode(value: PlayerMode): void {
    mode.value = value
  }

  /** 提前打开分支（不等音频播完） */
  function openEdges(): void {
    edgesOpened.value = true
  }

  function closeEdges(): void {
    edgesOpened.value = false
  }

  /**
   * 离开播放页时清空，避免下次进来残留上一段的状态。
   * 注意：**mode 也要复位** —— 否则以「纯聆听模式」离开后，下次进来仍是纯聆听，
   * 控件会在 3 秒后自动隐藏，用户会以为界面坏了。
   */
  function reset(): void {
    playlist.value = []
    currentIndex.value = 0
    loading.value = false
    error.value = null
    notice.value = null
    needsGesture.value = false
    mode.value = 'text'
    resetPlaybackState()
  }

  return {
    // 状态
    playlist,
    currentIndex,
    loading,
    error,
    notice,
    mode,
    playing,
    ready,
    needsGesture,
    currentTime,
    duration,
    awaitingBranch,
    edgesOpened,
    reloadToken,
    // 派生
    currentScene,
    edges,
    hasNextInQueue,
    queuedScene,
    hasPrevious,
    currentFinished,
    progress,
    cues,
    cueIndex,
    timelineIsEstimated,
    hasAudio,
    edgesVisible,
    // 加载与切场景
    loadScene,
    openEdge,
    refreshEdges,
    handleEnded,
    replay,
    goPrevious,
    goNext,
    // 音频事件
    syncTime,
    syncDuration,
    setPlaying,
    setNeedsGesture,
    setMode,
    openEdges,
    closeEdges,
    reset,
  }
})
