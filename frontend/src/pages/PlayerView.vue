<script setup lang="ts">
/**
 * PlayerView —— 消费播放页（/player/:sceneId）
 * ---------------------------------------------------------------
 * 布局：上下居中的「唱片机」式单列结构 ——
 *   顶栏（返回 / 标题）→ 中央巨大圆形视觉 → 场景名（居中）→ 底部控制栏。
 *
 * 【中央圆圈是纯静态的】
 *   AudioOrb 传 `:animated="false"`：不旋转、不呼吸、频谱不跳动（组件内部按该 prop
 *   决定是否挂载 animation，见 AudioOrb / AudioSpectrumBars）。
 *   这一页的圆圈只是「视觉主体」，不是播放按钮 —— 播放主控在底栏。
 *
 * 【不自动播放】
 *   `<audio>` 上没有 autoplay，装载完停在 0 秒；由听众点底栏播放键起播。
 *   因此不需要「点击开始收听」的拦截遮罩（该遮罩与相关状态已移除）。
 *
 * 【两种状态：普通 / 沉浸】（⚠️ 沉浸模式**当前未实现**，见下方说明）
 *   本段最初的设计是：普通态显示圆圈 + 标题 + 控制栏 + 存读档等按钮；沉浸态只留圆圈
 *   （放大并平移到视口正中）、其余 chrome 淡出，靠整页点击切换。
 *   现在模板里**没有**这套切换：没有 immersive 状态、舞台区没有点击处理器，
 *   底部控制栏是常驻的。样式表里也只剩一处过期的注释提及它。
 *   若要恢复，需要在页面上补 `immersive` ref + 舞台点击（并确保点在控件上不触发），
 *   不是「开关没打开」这种小问题 —— 因此这里如实标注为未实现，避免误以为已有该功能。
 *
 * 【字幕与音频的同步方式（本页最关键的一点）】
 *   唯一时间锚点就是 `<audio>` 的 currentTime：
 *       @timeupdate → player.syncTime(el.currentTime)
 *   本页**没有任何** setTimeout / setInterval 参与时间推进。暂停即停、拖进度条即跳。
 *
 * 【存读档的暂停约定】
 *   点「存档 / 读档」时，第一件事就是 `audioRef.value?.pause()`（直接操作音频元素，
 *   不依赖 store 的 playing 标记），随后再同步 store 的 playing 状态 ——
 *   否则界面上写着「已暂停」，元素其实还在响。
 *   （音色选择已按需求移出本页，改挂在主界面的「设置」入口下。）
 *
 * 【分支交互】
 *   音频播完自动弹 BranchChooserModal。点选后：
 *     · 这一段已播完 → 立刻用嵌套的 targetScene 开播（契约保证无需再请求）；
 *     · 这一段还在播 → 追加进队列，等这一段播完自动接上。
 *   随后由 store 补拉该场景的 edges（嵌套层的 edges 恒为空）。
 *
 * 【演示模式（Mock）下播的是什么】
 *   未接后端时，场景与音频都由 services 层的假后端提供：`audioUrl` 指向一段前端现成的
 *   静音 WAV。进度条仍然由真实的 audio.currentTime 驱动，与接上真实音频后完全一致。
 *   （按需求，页面上不再出现「演示模式」标签与其说明文字。）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import LoadingTransition from '@/components/base/LoadingTransition.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import AudioOrb from '@/components/audio/AudioOrb.vue'
import SeekBar from '@/components/audio/SeekBar.vue'
import BranchChooserModal from '@/components/feature/BranchChooserModal.vue'
import ExportDrawer from '@/components/feature/ExportDrawer.vue'
import SaveLoadModal from '@/components/feature/SaveLoadModal.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { clearSaves, createSave, deleteSave, listSaves } from '@/services/saves'
import { usePlayerStore } from '@/stores/player'
import { useStudioStore } from '@/stores/studio'
import { useWorldlineStore } from '@/stores/worldline'
import type { PlayEdge, PlayScene, SaveData, SceneAnchor } from '@/types/studio'

/** 键盘左右方向键 / 进度条单步（秒） */
const SEEK_STEP = 5

/**
 * 音频元素的固定音量（暂不提供音量控件）。
 * 播放速度不是固定值 —— 见下面的 PLAYBACK_RATES / playbackRate。
 */
const FIXED_VOLUME = 1

/**
 * 可循环切换的播放速度。
 * 初始 1.0x（正常速度）：`<audio>` 的 playbackRate 默认是 1，
 * 但换场会走 `element.load()`，而 load() 会把 playbackRate 复位成 defaultPlaybackRate，
 * 所以两者必须一起写（见 applyAudioSettings）——否则界面显示 1.5x、元素其实是 1.0x。
 */
const PLAYBACK_RATES: readonly number[] = [1, 1.25, 1.5, 2]

/** 当前播放速度；默认 1.0 倍速 */
const playbackRate = ref<number>(PLAYBACK_RATES[0])

/** 倍速按钮上的文案：1 → 「1.0x」，1.25 → 「1.25x」，2 → 「2.0x」 */
function formatRate(rate: number): string {
  if (rate === 1 || rate === 2) {
    return `${rate.toFixed(1)}x`
  }
  return `${rate}x`
}

/** 把当前音量与倍速写回 <audio>（装载前、切换倍速时都走这里） */
function applyAudioSettings(element: HTMLAudioElement): void {
  element.volume = FIXED_VOLUME
  // defaultPlaybackRate 一起写：<audio>.load() 会按它重置 playbackRate
  element.defaultPlaybackRate = playbackRate.value
  element.playbackRate = playbackRate.value
}

/** 切换倍速：1.0x → 1.25x → 1.5x → 2.0x → 1.0x，立即作用于正在播的音频 */
function cyclePlaybackRate(): void {
  const index = PLAYBACK_RATES.indexOf(playbackRate.value)
  const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
  playbackRate.value = next

  const element = audioRef.value
  if (element !== null) {
    applyAudioSettings(element)
  }
}

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const worldline = useWorldlineStore()
/** 只用来取「创作者给这条锚点起的名字」（播放域契约没有 cardName，见 sceneTitle） */
const studio = useStudioStore()

/** 主音轨元素：时间锚点、暂停、seek 全部以它为准 */
const audioRef = ref<HTMLAudioElement | null>(null)

/**
 * 本页是否已经由听众点过播放。
 * 决定「换场后要不要自动续播」：第一次进页面绝不自动出声，
 * 但只要听众已经点过播放，后续的分支续播就保持无缝衔接。
 */
let hasStartedPlayback = false

/** 路由参数可能是数组，统一收敛成字符串 */
const sceneId = computed(() => {
  const raw = route.params.sceneId
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim()
})

const scene = computed(() => player.currentScene)

/**
 * 读「后端若顺手带了 cardName」的情况。
 * 播放域契约（4.1）的 PlayScene 只有 sceneId / text / speaker，**没有 cardName**，
 * 因此这里按未知字段安全读取（typeof 校验），不为了一个展示名去改契约类型。
 */
function readSceneCardName(source: PlayScene): string {
  const raw = (source as PlayScene & { cardName?: unknown }).cardName
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * 场景标题：创作者起的卡片名，而不是 SCENE_XXX 这类内部 id。
 *
 * 取数顺序（取到就用，不做拼接）：
 *   1. 播放数据里若带了 cardName（后端补字段时自动生效）；
 *   2. 编辑态锚点里按 sceneId 找到的 cardName（本项目当前的唯一可靠来源）；
 *   3. 都没有 → 「未命名场景」。
 * 注意：世界线里那份 cardName 是「台词摘要」，不是用户起的名字，所以这里不用它。
 */
const sceneTitle = computed(() => {
  const current = scene.value
  if (current === null) {
    return ''
  }

  const fromScene = readSceneCardName(current)
  if (fromScene !== '') {
    return fromScene
  }

  const anchor = studio.anchors.find((item) => item.sceneId === current.sceneId)
  const fromAnchor = (anchor?.cardName ?? '').trim()
  return fromAnchor === '' ? '未命名场景' : fromAnchor
})

/* =============================================================
 * 提示条（ToastPill）
 * ============================================================= */

const TOAST_DURATION = 1900

const toastMessage = ref('')
const toastVisible = ref(false)

/** 定时器句柄：不参与渲染，因此用普通变量而不是 ref */
let toastTimer = 0

function notify(message: string): void {
  toastMessage.value = message
  toastVisible.value = true

  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, TOAST_DURATION)
}

// store 里的 notice（音频失败、入队、补拉分支失败）统一升格为可见提示条
watch(
  () => player.notice,
  (message) => {
    if (message) {
      notify(message)
    }
  },
)

// 加载失败：store 的 error 会渲染成页内错误面，这里再补一条提示条，保证「有反馈」
watch(
  () => player.error,
  (message) => {
    if (message) {
      notify(message)
    }
  },
)

/* =============================================================
 * 音频事件 → store
 * ============================================================= */

/** timeupdate：唯一时间锚点的写入点 */
function handleTimeUpdate(): void {
  const element = audioRef.value
  if (element) {
    player.syncTime(element.currentTime)
  }
}

function handleLoadedMetadata(): void {
  const element = audioRef.value
  if (element) {
    player.syncDuration(element.duration)
  }
}

function handleDurationChange(): void {
  const element = audioRef.value
  if (element) {
    player.syncDuration(element.duration)
  }
}

function handlePlayState(): void {
  player.setPlaying(true)
  hasStartedPlayback = true
}

function handlePauseState(): void {
  player.setPlaying(false)
}

/** 音频出错：如实报错，不假装在播 */
function handleAudioError(): void {
  const element = audioRef.value
  player.setPlaying(false)

  if (element && player.hasAudio) {
    // 直接改 store 的错误字段会盖掉「加载场景失败」的语义，这里用提示表达得更准确
    player.notice = `音频加载失败：${element.error?.message ?? '资源不可用'}`
  }
}

/* =============================================================
 * 播放控制
 * ============================================================= */

/**
 * 开始 / 继续播放（只由底栏的播放键调用）。
 *
 * 进入播放页**不会自动起播**：`<audio>` 上没有 autoplay，装载完就停在 0 秒，
 * 等听众点播放键才出声 —— 不需要「点击开始收听」的拦截遮罩。
 */
async function startPlayback(): Promise<void> {
  const element = audioRef.value
  if (!element || !player.hasAudio) {
    return
  }

  try {
    await element.play()
  } catch (cause) {
    // 换 src 时旧播放被中断会抛 AbortError，那不是失败
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return
    }

    // 其余情况就是没播起来：保持暂停态，让听众再点一次播放键
    player.setPlaying(false)
  }
}

function togglePlay(): void {
  const element = audioRef.value
  if (!element || !player.hasAudio) {
    return
  }

  if (player.playing) {
    element.pause()
  } else {
    void startPlayback()
  }
}

function seekTo(seconds: number): void {
  const element = audioRef.value
  if (!element) {
    return
  }

  const upper = player.duration > 0 ? player.duration : seconds
  const next = Math.min(Math.max(seconds, 0), upper)
  element.currentTime = next
  // 立即反映到界面（不等下一次 timeupdate），锚点仍然是音频自己的 currentTime
  player.syncTime(next)
}

function seekBy(delta: number): void {
  const element = audioRef.value
  if (element) {
    seekTo(element.currentTime + delta)
  }
}

function handleEnded(): void {
  player.handleEnded()
}

function chooseEdge(edge: PlayEdge): void {
  // 记下选的哪条选项文案，供世界线记录「从哪来」；随后立刻关掉弹窗
  pendingAction.value = edge.action
  branchOpen.value = false
  void player.openEdge(edge)
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--'
  }

  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/* =============================================================
 * 分支弹窗
 * -------------------------------------------------------------
 * 由两件事驱动（见下方 watch）：
 *   1. store 的 edgesVisible —— 音频播完后自动弹，或听众点「查看选项」时主动弹；
 *   2. 关掉之后不再自己弹回来 —— 因此本页持有开关，而不是直接用 edgesVisible。
 * ============================================================= */

const branchOpen = ref(false)

/** 刚选中的选项文案，交给世界线记录；非分支进入（直接加载）时为空串 */
const pendingAction = ref('')

/** 关闭分支弹窗：同时复位 store 的「提前打开」标记，否则下次换场会立刻又弹 */
function closeBranch(): void {
  branchOpen.value = false
  player.closeEdges()
}

/* =============================================================
 * 存读档
 * ============================================================= */

const saveModalOpen = ref(false)
const saveModalMode = ref<'save' | 'load'>('save')

/** 存档列表：打开弹窗时从 localStorage 读一次 */
const saves = ref<SaveData[]>([])

/** 存读档进行中（写入是同步的，这个标记用于防连点与按钮 loading） */
const saveBusy = ref(false)

/** 存储层返回的失败原因（配额满 / 隐私模式） */
const saveError = ref<string | null>(null)

/** 重新读取存档列表 */
function refreshSaves(): void {
  saves.value = listSaves()
}

/**
 * 打开存档面板。
 * ⚠️ 第一件事必须是暂停音频：听众要读档了，此刻还让上一段出声是错的。
 *    直接对 `<audio>` 调 pause()（而不是只改 store 的 playing 标记），
 *    随后同步 store，保证「界面状态」与「元素状态」一致。
 */
function openSave(): void {
  audioRef.value?.pause()
  player.setPlaying(false)

  refreshSaves()
  saveError.value = null
  saveModalMode.value = 'save'
  saveModalOpen.value = true
}

/** 打开读档面板：同上，先停音频 */
function openLoad(): void {
  audioRef.value?.pause()
  player.setPlaying(false)

  refreshSaves()
  saveError.value = null
  saveModalMode.value = 'load'
  saveModalOpen.value = true
}

/** 新建存档：把当前世界线 + 音频进度写进 localStorage */
function handleCreateSave(name: string): void {
  const current = player.currentScene
  if (current === null) {
    saveError.value = '当前没有可存档的场景。'
    return
  }

  saveBusy.value = true

  const { save, reason } = createSave({
    name,
    currentNodeId: current.sceneId,
    // 深拷贝由 createSave 负责，这里传当前路径即可
    nodeHistory: worldline.nodeHistory,
    // 音频进度：currentTime 就是唯一时间锚点（暂停时也准确）
    audioProgress: player.currentTime > 0 ? player.currentTime : undefined,
    sceneText: current.text,
    cardName: worldline.nodeHistory[worldline.nodeHistory.length - 1]?.cardName ?? current.sceneId,
  })

  saveBusy.value = false

  if (save === null) {
    // 写入失败：如实报错，并保留弹窗让用户能看到原因
    saveError.value = reason ?? '存档失败'
    return
  }

  refreshSaves()
  saveModalOpen.value = false
  notify(`已存档：${save.name.trim() === '' ? (save.cardName ?? save.currentNodeId) : save.name}`)
}

/** 读档：恢复世界线 + 播放位置 */
async function handleLoadSave(save: SaveData): Promise<void> {
  saveBusy.value = true
  saveError.value = null

  const ok = await player.restoreFromSave(save.currentNodeId, save.audioProgress)

  saveBusy.value = false

  if (!ok) {
    saveError.value = player.error ?? '读档失败'
    return
  }

  // 世界线整体替换成存档里的路径（深拷贝由 store 负责）
  worldline.restore({ currentNodeId: save.currentNodeId, nodeHistory: save.nodeHistory })

  saveModalOpen.value = false
  notify(`已读档：${sceneTitle.value}`)
}

function handleRemoveSave(id: string): void {
  const result = deleteSave(id)

  if (!result.ok) {
    saveError.value = result.reason ?? '删除失败'
    return
  }

  refreshSaves()
  notify('存档已删除')
}

function handleClearSaves(): void {
  const result = clearSaves()

  if (!result.ok) {
    saveError.value = result.reason ?? '清空失败'
    return
  }

  refreshSaves()
  notify('已清空全部存档')
}

/* =============================================================
 * 导出纯音频
 * -------------------------------------------------------------
 * 从创作台搬到这里：导出的对象是**实际生成 / 播放过的节点**，
 * 只有播放页知道这一局走了哪些场景（playlist）。
 * 勾选后交给后端按顺序拼接（POST /plan/export-segment）。
 * ============================================================= */

const exportOpen = ref(false)

/**
 * 候选节点：本局播放队列，按播放先后排列。
 * 同一 sceneId 只留第一次出现 —— 回退重听会让队列里出现重复项，
 * 重复导出同一段没有意义。
 * ExportDrawer 吃 SceneAnchor，播放域没有 timeStage，用序号充当「第几段」。
 */
const exportAnchors = computed<SceneAnchor[]>(() => {
  const seen = new Set<string>()
  const list: SceneAnchor[] = []

  for (const item of player.playlist) {
    if (seen.has(item.sceneId)) {
      continue
    }
    seen.add(item.sceneId)

    list.push({
      sceneId: item.sceneId,
      cardName: item.sceneId,
      text: item.text,
      speaker: item.speaker,
      timeStage: list.length + 1,
      audioURL: item.audioUrl,
    })
  }

  return list
})

/** 打开导出抽屉：与存读档一致，先暂停音频再弹浮层 */
function openExport(): void {
  audioRef.value?.pause()
  player.setPlaying(false)

  studio.clearError()
  exportOpen.value = true
}

async function handleExport(sceneIds: string[]): Promise<void> {
  const result = await studio.exportSegment(sceneIds)

  if (result === null) {
    notify(studio.lastError ?? '片段导出失败')
    return
  }

  notify('导出完成，成品地址见抽屉')
}

/* =============================================================
 * 场景加载与切换
 * ============================================================= */

async function loadFromRoute(): Promise<void> {
  const ok = await player.loadScene(sceneId.value)
  if (!ok) {
    // 失败由 player.error 的 watch 转成提示条，页内另有错误面与「重试」
    return
  }

  // 提示里用场景名（不是 sceneId）：这是给听众看的反馈
  notify(`场景已就绪：${sceneTitle.value}`)
  // 音频的装载与播放统一交给下面 reloadToken 的 watch（loadScene 会自增它），
  // 这里不再自己调一次 startPlayback —— 那正是「初次进入被装载两次」的根源。
}

function retry(): void {
  void loadFromRoute()
}

/** 回到操作编辑页（AppButton 不是链接组件，导航走 router） */
function goToOperations(): void {
  player.reset()
  void router.push({ name: ROUTE_NAMES.studioOperations })
}

/*
 * 音频的装载**只在这一个地方发生**（唯一入口），且**只装载不起播**：
 * 换场后停在 0 秒，由听众点底栏的播放键开始（`<audio>` 上没有 autoplay）。
 * 换场时也要把播放状态复位，否则上一段的「正在播放」会带进新场景。
 *
 * 依赖 player.reloadToken，而不是 scene.audioUrl / scene.sceneId：
 *   · 换场：两段场景可能共用同一个音频地址（演示模式的静音音频按长度复用同一个
 *     object URL 就是这种情况），只看 URL 会漏掉，元素会停在上一次的 ended 位置；
 *   · 重试：同一个 sceneId 也可能需要重新装载。
 * store 在「当前场景需要重新装载」时自增这个信号，两种情况都覆盖。
 * flush: 'post' 保证回调运行时 <audio> 已经挂到 DOM 上。
 */
watch(
  () => player.reloadToken,
  () => {
    const element = audioRef.value
    if (!element) {
      return
    }

    if (!player.hasAudio) {
      player.setPlaying(false)
      return
    }

    applyAudioSettings(element)
    element.load()

    // 首次进入：装载完停住，等听众点底栏的播放键（不自动出声）
    // 已经点播过：换场 / 分支续播继续自动起播，保持「选完就接着听」的无缝衔接
    player.setPlaying(false)

    if (hasStartedPlayback) {
      void startPlayback()
    }
  },
  { flush: 'post' },
)

/**
 * 分支弹窗的自动弹出。
 *
 * store 的 edgesVisible 在两种情况下变 true：
 *   · 音频播完且队列里没有下一段（awaitingBranch）→ 应该自动弹出来让听众选；
 *   · 听众主动点了「查看选项」→ 也应该弹。
 * 因此这里只做「true → 打开」的单向同步；关闭由 closeBranch 负责复位。
 */
watch(
  () => player.edgesVisible,
  (visible) => {
    if (visible) {
      branchOpen.value = true
    }
  },
)

/* =============================================================
 * 世界线：把「播放队列的推进」翻译成「世界线的推进」
 * -------------------------------------------------------------
 * worldline store 与 player store 是两回事（分工见 stores/worldline.ts 头部）。
 * 这里负责在正确的时机把队列的变化提交给世界线 —— 只有页面知道
 * 「刚才是选分支进来的，还是直接加载进来的」。
 * ============================================================= */

/**
 * watch 队列推进，把新进入的场景提交进世界线。
 *
 * 判定「推进」的依据是 currentScene.sceneId + currentIndex：
 *   · currentIndex 变了（选了分支 / 队列续播 / 点了下一段）→ 单向推进；
 *   · 只有 sceneId 变了而 index 没变（loadScene 重新加载同一条或读了档）
 *     → 属于「重置起点」，交给下面单独处理，不重复计入世界线。
 */
watch(
  () => [player.currentScene?.sceneId ?? '', player.currentIndex] as const,
  ([nextSceneId, index], [previousSceneId, previousIndex]) => {
    const current = player.currentScene
    if (current === null || nextSceneId === '') {
      return
    }

    // 首次把自己作为起点：此时世界线还是空的
    if (!worldline.hasWorldline) {
      worldline.start(current)
      return
    }

    // 下标前移 = 真的往下走了一步（选分支 / 队列续播 / 下一段）
    if (index > previousIndex) {
      worldline.commitEntry(current, pendingAction.value)
      pendingAction.value = ''
      return
    }

    // 下标不变但换了场景（重新加载另一个起点）：重置世界线，而不是追加
    if (index === previousIndex && nextSceneId !== previousSceneId && !player.hasPrevious) {
      worldline.start(current)
    }
  },
)

/**
 * 消费读档时登记的音频进度。
 *
 * 时机很关键：必须在 `<audio>` 的元数据（duration）就绪之后写 currentTime，
 * 否则浏览器会忽略这次赋值或把它截到 0。
 */
watch(
  () => player.ready,
  (ready) => {
    if (!ready) {
      return
    }

    const pending = player.consumePendingSeek()
    if (pending === null) {
      return
    }

    const element = audioRef.value
    if (element === null) {
      return
    }

    // 存档里的进度可能超过新音频时长（音频被换过），钳到合法区间
    const upper = player.duration > 0 ? player.duration : pending
    const target = Math.min(Math.max(pending, 0), upper)

    element.currentTime = target
    // 立即反映到界面，不等下一次 timeupdate（锚点仍然是音频自己的 currentTime）
    player.syncTime(target)
    notify(`已恢复播放进度：${formatTime(target)}`)
  },
)

/* =============================================================
 * 键盘
 * ============================================================= */

function handleWindowKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    // 方向键留给输入控件自己用
    return
  }

  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    togglePlay()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekBy(-SEEK_STEP)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekBy(SEEK_STEP)
  }
}

/* =============================================================
 * 生命周期
 * ============================================================= */

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  void loadFromRoute()

  // 刷新后直接进本页时，编辑态的锚点还没进内存 —— 拉一次，标题才认得出名字。
  // 演示模式从本地假后端回读；真实后端模式是空操作（契约没有查询接口，store 会保留现状）。
  void studio.fetchAnchors()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  window.clearTimeout(toastTimer)

  const element = audioRef.value
  if (element) {
    element.pause()
  }

  // 离开页面就清空播放状态，下次进来不会残留上一段
  player.reset()
  // 世界线同样清空：它属于这一次收听会话，不该跨页面残留
  worldline.reset()
})
</script>

<template>
  <div class="nw-player">
    <PageBackdrop />

    <!-- 顶栏：返回 + 页面标题 -->
    <header class="nw-player__top">
      <BackLink label="返回操作编辑" :to="{ name: ROUTE_NAMES.studioOperations }" />

      <h1 class="nw-player__heading">播放</h1>
    </header>

    <main class="nw-player__stage">
      <!-- 失败态：拿不到场景就如实报错并提供重试，不显示空播放器 -->
      <GlassPanel v-if="player.error" class="nw-player__state" tone="strong">
        <h2 class="nw-player__state-title">场景加载失败</h2>
        <p class="nw-player__state-text">{{ player.error }}</p>
        <p class="nw-player__state-hint">sceneId：{{ sceneId || '（路由未带 sceneId）' }}</p>
        <div class="nw-player__state-actions">
          <AppButton size="md" variant="secondary" @click="goToOperations">返回操作编辑</AppButton>
          <AppButton size="md" variant="primary" @click="retry">重试</AppButton>
        </div>
      </GlassPanel>

      <!-- 载入场景：全屏过场（与「一键生成」后的过场同一套视觉） -->
      <LoadingTransition
        v-else-if="player.loading && !scene"
        title="LOADING SCENE"
        subtitle="正在载入场景…"
      />

      <template v-else-if="scene">
        <!--
          中央圆形视觉：复用 AudioOrb，但**完全静止**（:animated="false"）。
          它被裁成纯圆形（border-radius: 50% + overflow: hidden），页面只保留这一个圆。
          只是一张视觉，不绑定任何点击 —— 播放主控在底栏。
        -->
        <div class="nw-player__orb">
          <AudioOrb :animated="false" />
        </div>

        <!-- 大标题：只呈现创作者起的场景名；其余说明 / 提示文字一律不渲染 -->
        <div class="nw-player__info">
          <h1 class="nw-player__scene">{{ sceneTitle }}</h1>
        </div>
      </template>
    </main>

    <!--
      底部控制栏：进度 → 世界线 / 播放控制 / 存读档 · 导出 · 倍速。
      z-index: 50 + @click.stop：它永远在最上层，且点击不会冒泡到页面级处理器。
    -->
    <footer v-if="scene" class="nw-player__dock" @click.stop>
      <div class="nw-player__dock-inner">
        <SeekBar
          class="nw-player__seek"
          :current-time="player.currentTime"
          :duration="player.ready ? player.duration : 0"
          :buffered="0"
          :disabled="!player.hasAudio"
          :step="SEEK_STEP"
          @seek="seekTo"
        />

        <div class="nw-player__dock-row">
          <p class="nw-player__worldline" :title="worldline.pathLabels.join(' → ')">
            <span
              class="nw-player__worldline-dot"
              :class="{ 'nw-player__worldline-dot--live': worldline.stepCount > 0 }"
              aria-hidden="true"
            />
            世界线 {{ worldline.stepCount }} 步
            <span v-if="worldline.hasBranched"> · 分支线</span>
          </p>

          <div class="nw-player__transport">
            <button
              type="button"
              class="nw-player__round"
              :disabled="!player.hasPrevious"
              aria-label="上一段"
              title="上一段"
              @click.stop="player.goPrevious()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="6" y="5" width="2" height="14" rx="1" />
                <path d="M20 5.5v13L9.5 12z" />
              </svg>
            </button>

            <!-- 播放主控：@click.stop 双保险，页面级点击处理器永远拿不到这次点击 -->
            <button
              type="button"
              class="nw-player__round nw-player__round--primary"
              :disabled="!player.hasAudio"
              :aria-label="player.playing ? '暂停' : '播放'"
              :aria-pressed="player.playing"
              :title="player.playing ? '暂停' : '播放'"
              @click.stop="togglePlay"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path v-if="!player.playing" d="M8 5.5 19 12 8 18.5Z" />
                <g v-else>
                  <rect x="7.5" y="5.5" width="3.6" height="13" rx="1.2" />
                  <rect x="12.9" y="5.5" width="3.6" height="13" rx="1.2" />
                </g>
              </svg>
            </button>

            <button
              type="button"
              class="nw-player__round"
              :disabled="!player.hasNextInQueue"
              aria-label="下一段"
              title="下一段"
              @click.stop="player.goNext()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="16" y="5" width="2" height="14" rx="1" />
                <path d="M4 5.5v13L14.5 12z" />
              </svg>
            </button>
          </div>

          <div class="nw-player__actions">
            <button type="button" class="nw-player__action" @click.stop="openSave">存档</button>
            <button type="button" class="nw-player__action" @click.stop="openLoad">读档</button>
            <button
              type="button"
              class="nw-player__action"
              :disabled="exportAnchors.length === 0"
              @click.stop="openExport"
            >
              导出
            </button>
            <button
              type="button"
              class="nw-player__action nw-player__action--rate"
              :title="`播放速度 ${formatRate(playbackRate)}（点击切换）`"
              :aria-label="`播放速度 ${formatRate(playbackRate)}，点击切换`"
              @click="cyclePlaybackRate"
            >
              {{ formatRate(playbackRate) }}
            </button>
          </div>
        </div>
      </div>
    </footer>

    <!-- 音频元素：不加 controls，也不用 autoplay —— 进页面由听众点底栏播放键起播 -->
    <audio
      ref="audioRef"
      class="nw-player__audio"
      :src="scene?.audioUrl || undefined"
      preload="auto"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @durationchange="handleDurationChange"
      @seeked="handleTimeUpdate"
      @play="handlePlayState"
      @pause="handlePauseState"
      @ended="handleEnded"
      @error="handleAudioError"
    />

    <!-- 接口结果提示：加载成功 / 失败 / 音频失败 / 入队，都走这一条 -->
    <ToastPill :message="toastMessage" :visible="toastVisible" />

    <!-- 世界线分支选择：有多条 edges 时弹出选项卡片 -->
    <BranchChooserModal
      :show="branchOpen"
      :edges="player.edges"
      :scene-id="player.currentScene?.sceneId ?? ''"
      :finished="player.awaitingBranch"
      @choose="chooseEdge"
      @close="closeBranch"
    />

    <!-- 存读档弹窗 -->
    <SaveLoadModal
      :show="saveModalOpen"
      :mode="saveModalMode"
      :saves="saves"
      :current-node-id="player.currentScene?.sceneId ?? ''"
      :step-count="worldline.stepCount"
      :busy="saveBusy"
      :error="saveError"
      @create="handleCreateSave"
      @load="handleLoadSave"
      @remove="handleRemoveSave"
      @clear="handleClearSaves"
      @close="saveModalOpen = false"
    />

    <!-- 导出纯音频：勾选本局生成 / 播放过的节点，交给后端拼接 -->
    <ExportDrawer
      v-if="exportOpen"
      :anchors="exportAnchors"
      :exporting="studio.exporting"
      :result="studio.exportResult"
      :error="studio.lastError"
      @submit="handleExport"
      @close="exportOpen = false"
    />
  </div>
</template>

<style scoped>
/*
 * 字幕尺寸体系：三个可见行、每行固定高度。
 * 行高按「放大后的当前句」计算，因此其它句（字号更小）也放得下，
 * 每行高度一致 → translateY 的步长是精确的，滚动不会累积错位。
 */
.nw-player {
  /*
   * 中央圆圈的尺寸：页面只剩「圆 + 大标题 + 底栏」，圆可以放得更大；
   * 同时受视口宽高约束，保证底栏永远留在屏幕内。
   */
  --nw-player-orb-size: clamp(11rem, min(44vmin, 46vh), 26rem);

  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
  /* 页面本身不可拖选，避免误触到按钮文案（沉浸模式未实现，此条与它无关） */
  user-select: none;
}

/* =============================================================
 * 顶栏：返回 / 标题
 * ============================================================= */
.nw-player__top {
  position: relative;
  z-index: var(--nw-z-content);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--nw-space-xs);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: var(--nw-space-sm) var(--nw-space-xs);
  padding-inline: var(--nw-layout-page-gutter);
}

/* 顶栏标题刻意做小：这一页的主体是圆圈与场景名，标题不该抢视线 */
.nw-player__heading {
  justify-self: center;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-widest);
}

/* =============================================================
 * 主体：圆 + 文本（上下居中）
 * ============================================================= */
.nw-player__stage {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 2vh, 1.5rem);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding: var(--nw-space-2xs) var(--nw-layout-page-gutter);
}

/*
 * 中央圆圈：裁成纯圆形（border-radius: 50%），页面只有这一个视觉主体。
 * 这里负责尺寸、圆形裁剪与过渡；动画只碰 transform，不触发重排。
 * （注释里原先提到的「沉浸模式下平移到视口正中」并不存在，该模式未实现。）
 */
.nw-player__orb {
  width: var(--nw-player-orb-size);
  max-width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
  /*
   * AudioOrb 自带的 drop-shadow 会被 overflow 裁掉，所以外发光挪到这一层：
   * box-shadow 画在元素外侧，不受自身 overflow 影响。
   */
  box-shadow: var(--nw-glow-accent-soft);
}

/* ---------- 大标题（圆圈下方，只有这一行字） ---------- */
.nw-player__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-2xs);
  width: 100%;
  max-width: 46rem;
  text-align: center;
}

.nw-player__scene {
  color: var(--nw-color-text-primary);
  font-size: clamp(1.35rem, 1.1rem + 1vw, 2rem);
  font-weight: var(--nw-font-weight-semibold);
  letter-spacing: var(--nw-letter-spacing-wide);
  line-height: var(--nw-line-height-tight);
  text-wrap: balance;
  text-shadow: var(--nw-glow-accent-soft);
}


/* =============================================================
 * 底部控制栏
 * -------------------------------------------------------------
 * 全页最高交互层：z-index 50 + 独立层叠上下文（isolation），
 * 并且整条底栏 @click.stop —— 任何页面级点击处理都不会抢走这里的点击。
 * ============================================================= */
.nw-player__dock {
  position: sticky;
  bottom: 0;
  z-index: 50;
  isolation: isolate;
  pointer-events: auto;
  border-top: var(--nw-border-width) solid var(--nw-color-border-subtle);
  background-color: var(--nw-color-glass-fill);
  background-image: linear-gradient(180deg, var(--nw-color-glass-highlight), transparent 70%);
  backdrop-filter: blur(var(--nw-blur-md));
  -webkit-backdrop-filter: blur(var(--nw-blur-md));
}

.nw-player__dock-inner {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding: var(--nw-space-2xs) var(--nw-layout-page-gutter) clamp(0.5rem, 1.6vh, 1rem);
}

.nw-player__seek {
  width: 100%;
}

/* 三段式：世界线（左） / 播放控制（正中） / 存读档、导出与倍速（右） */
.nw-player__dock-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--nw-space-xs);
}

.nw-player__worldline {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2xs);
  min-width: 0;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  white-space: nowrap;
}

/* 状态点：有世界线时亮起；步数文字本身也在表达状态，不只靠颜色 */
.nw-player__worldline-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-text-disabled);
}

.nw-player__worldline-dot--live {
  background-color: var(--nw-color-accent-contrast);
  box-shadow: var(--nw-glow-accent-soft);
}

.nw-player__transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--nw-space-sm);
}

/* ---------- 圆形按钮 ---------- */
.nw-player__round {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: 50%;
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-secondary);
  cursor: pointer;
  transition: var(--nw-transition-interactive);
  -webkit-tap-highlight-color: transparent;
}

.nw-player__round svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: currentColor;
}

.nw-player__round:hover:not(:disabled) {
  border-color: var(--nw-color-border-strong);
  background-color: var(--nw-color-button-fill-secondary-hover);
  color: var(--nw-color-text-primary);
}

.nw-player__round:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 4px;
}

.nw-player__round:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 播放主控：比两侧大一圈，是控制栏的视觉重心 */
.nw-player__round--primary {
  width: 3.75rem;
  height: 3.75rem;
  border: var(--nw-border-width-strong) solid var(--nw-color-accent-strong);
  background-image:
    radial-gradient(circle at 50% 32%, var(--nw-color-accent-hover), transparent 70%),
    linear-gradient(180deg, var(--nw-color-surface-elevated), var(--nw-color-page-bg));
  color: var(--nw-color-on-accent);
  box-shadow:
    var(--nw-shadow-inset-top),
    var(--nw-glow-accent-soft);
}

.nw-player__round--primary:hover:not(:disabled) {
  border-color: var(--nw-color-accent-contrast);
  box-shadow:
    var(--nw-shadow-inset-top),
    var(--nw-glow-accent);
}

.nw-player__round--primary svg {
  width: 1.5rem;
  height: 1.5rem;
}

/* ---------- 文本按钮（存档 / 读档 / 倍速） ---------- */
.nw-player__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--nw-space-2xs);
}

.nw-player__action {
  padding: 0.4rem 0.9rem;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-secondary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--nw-transition-interactive);
}

/*
 * 倍速按钮：固定宽度（等宽数字），1.0x / 1.25x / 2.0x 切换时按钮不会忽宽忽窄，
 * 左右按钮也就不会跟着抖。
 */
.nw-player__action--rate {
  min-width: 4.25rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--nw-letter-spacing-normal);
  text-align: center;
}

.nw-player__action:hover {
  border-color: var(--nw-color-border-strong);
  background-color: var(--nw-color-button-fill-secondary-hover);
  color: var(--nw-color-text-primary);
}

.nw-player__action:disabled {
  color: var(--nw-color-text-disabled);
  cursor: not-allowed;
}

.nw-player__action:focus-visible {
  outline: var(--nw-border-width-strong) solid var(--nw-color-focus);
  outline-offset: 2px;
}

/* ---------- 状态面板 ---------- */
.nw-player__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nw-space-2xs);
  width: 100%;
  padding: clamp(1.25rem, 3vw, 2rem);
}

.nw-player__state-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
}

.nw-player__state-text {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-player__state-hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

.nw-player__state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
  margin-top: var(--nw-space-2xs);
}

/* ---------- 音频元素：只作为播放器存在，不显示原生控件 ---------- */
.nw-player__audio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

/* =============================================================
 * 响应式
 * ============================================================= */

/* 窄屏：控制栏三段改为三行，按钮不再挤在一行 */
@media (max-width: 860px) {
  .nw-player__dock-row {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: var(--nw-space-2xs);
  }

  .nw-player__worldline {
    order: 3;
  }

  .nw-player__actions {
    justify-content: center;
  }
}

/* 矮屏（横屏手机 / 小窗）：收小圆圈，避免整页只能滚动 */
@media (max-height: 620px) {
  .nw-player {
    --nw-player-orb-size: clamp(7rem, 32vmin, 12rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-player__round,
  .nw-player__action {
    transition: none;
  }
}
</style>
