<script setup lang="ts">
/**
 * PlayerView —— 消费播放页（/player/:sceneId）
 * ---------------------------------------------------------------
 * 数据：GET /api/v1/play/scene/{sceneId}；数据结构与交互全部由
 * stores/player.ts 承担，本页只负责「DOM 与音频元素」这一层。
 *
 * 【字幕与音频的同步方式（本页最关键的一点）】
 *   唯一时间锚点就是 `<audio>` 的 currentTime：
 *       @timeupdate → player.syncTime(el.currentTime) → store 里 computed 出 cueIndex
 *   本页**没有任何** setTimeout / setInterval 参与字幕推进。暂停即停、拖进度条即跳。
 *   （页面当前没有倍速控件；将来加上 playbackRate 也会自动跟随，因为下标是算出来的。）
 *   页面里唯一的定时器是「纯聆听模式下控件 3 秒后自动隐藏」，
 *   它只改一个 UI 布尔值，与字幕无关（见 scheduleHide 的注释）。
 *
 * 【演示模式（Mock）下播的是什么】
 *   未接后端时，场景与音频都由 services 层的假后端提供：`audioUrl` 指向一段
 *   **前端现成合成的静音 WAV**（见 services/mock/silentAudio.ts）。
 *   因此字幕、进度条、声波动画仍然由真实的 `audio.currentTime` 驱动，
 *   与接上真实 `audioUrl` 后的代码路径完全一致 —— 本页不需要为演示模式写任何分支。
 * TODO: 待后端接入，当前为演示用 Mock。
 *
 * 【为什么字幕是「估算」的】
 *   契约给出的场景对象只有 text / speaker / audioUrl，**没有逐句时间戳**，
 *   所以逐句高亮只能按句长比例分配音频时长。这一事实会显示在字幕窗口上角
 *   （「按句长估算」），不谎称精确对齐；后端补上 subtitles 后会自动切换成真实时间轴。
 *
 * 【封面为什么是一张图】
 *   契约里没有封面图字段（没有 coverUrl 之类），因此不伪造「后端给的封面」——
 *   这里用的是站内自备的一张静态星云图（assets/player-cover-nebula.jpg），
 *   纯前端资源，与接口无关。
 *   它只是一张静态图片：播放时做极轻微的呼吸（缩放 + 亮度变化），暂停即静止；
 *   两种模式共用同一张图，模式差别只体现在「字幕面板出不出现」。
 *
 * 【分支交互】
 *   音频播完（或听众点「查看选项」）→ 底部淡入 edges 交互卡。点选后：
 *     · 这一段已播完 → 立刻用嵌套的 targetScene 开播（契约保证无需再请求，零延迟）；
 *     · 这一段还在播 → 追加进队列，等这一段播完自动接上，不打断正在说的那句。
 *   随后由 store 补拉该场景的 edges（后端对 targetScene 标了 @JsonIgnoreProperties("edges")，
 *   嵌套层的分支恒为空，想继续往下走必须再取一次）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import coverArt from '@/assets/player-cover-nebula.jpg'
import AppButton from '@/components/base/AppButton.vue'
import BackLink from '@/components/base/BackLink.vue'
import DemoModeBadge from '@/components/base/DemoModeBadge.vue'
import GlassPanel from '@/components/base/GlassPanel.vue'
import PageBackdrop from '@/components/base/PageBackdrop.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import ToastPill from '@/components/base/ToastPill.vue'
import { ROUTE_NAMES } from '@/router/routes'
import { isPlayMockMode } from '@/services/studio'
import { usePlayerStore } from '@/stores/player'
import type { PlayerMode } from '@/stores/player'
import type { PlayEdge } from '@/types/studio'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()

/** 模式切换项 */
const MODE_OPTIONS: ReadonlyArray<{ value: PlayerMode; label: string }> = [
  { value: 'text', label: '带文字模式' },
  { value: 'listen', label: '纯聆听模式' },
]

/** 键盘左右方向键的步长（秒） */
const SEEK_STEP = 5

/** 纯聆听模式下控件自动隐藏的延时（毫秒） */
const AUTO_HIDE_MS = 3000

/**
 * 音频元素的固定播放参数。
 *
 * 本阶段**不提供音量与倍速控件**（产品决定：先把链路跑通），
 * 但只要这两个值不是由「唯一的一处」明确写回，就迟早会出现
 * 「界面上写着 1x、元素里其实是 1.5x」这种对不上的情况。
 * 因此每次装载音频前都显式写回它们；将来加控件时，把常量换成响应式状态即可。
 */
const FIXED_VOLUME = 1
const FIXED_PLAYBACK_RATE = 1

function applyFixedAudioSettings(element: HTMLAudioElement): void {
  element.volume = FIXED_VOLUME
  element.playbackRate = FIXED_PLAYBACK_RATE
}

const audioElement = ref<HTMLAudioElement | null>(null)

/** 纯聆听模式下控件是否可见 */
const controlsVisible = ref(true)

/** 路由参数可能是数组，统一收敛成字符串 */
const sceneId = computed(() => {
  const raw = route.params.sceneId
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim()
})

const scene = computed(() => player.currentScene)

/** 纯聆听模式：字幕与常驻控件按需显隐 */
const chromeVisible = computed(() => {
  if (player.mode === 'text') {
    return true
  }
  // 需要听众做选择时，无论如何都要把交互露出来，否则会卡在死路
  return controlsVisible.value || player.awaitingBranch
})

/** 进度条最大值：时长未知时给 0，避免 range 的 max 非法 */
const seekMax = computed(() => (player.duration > 0 ? player.duration : 0))

/* =============================================================
 * 提示条（ToastPill）
 * =============================================================
 * 接口调用的结果一律有可见提示：
 *   · 加载成功 → 「场景已就绪：…」
 *   · 加载失败 → 提示条 + 页内错误面（错误面另外提供「重试」按钮）
 *   · 音频失败 / 入队 / 补拉分支失败 → store 的 notice 与 error 直接转成提示条
 */

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

// 加载失败：store 的 error 会渲染成页内错误面，这里再补一条提示条，保证「有反馈」不依赖用户看页面
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
  const element = audioElement.value
  if (element) {
    player.syncTime(element.currentTime)
  }
}

function handleLoadedMetadata(): void {
  const element = audioElement.value
  if (element) {
    player.syncDuration(element.duration)
  }
}

function handleDurationChange(): void {
  const element = audioElement.value
  if (element) {
    player.syncDuration(element.duration)
  }
}

function handlePlayState(): void {
  player.setPlaying(true)
  player.setNeedsGesture(false)
}

function handlePauseState(): void {
  player.setPlaying(false)
}

/** 音频出错：如实报错，不假装在播 */
function handleAudioError(): void {
  const element = audioElement.value
  player.setPlaying(false)
  player.setNeedsGesture(false)

  if (element && player.hasAudio) {
    // 直接改 store 的错误字段会盖掉「加载场景失败」的语义，这里用提示表达得更准确
    player.notice = `音频加载失败：${element.error?.message ?? '资源不可用'}`
  }
}

/* =============================================================
 * 播放控制
 * ============================================================= */

/**
 * 开始 / 继续播放。
 * 浏览器会拦截没有用户手势的自动播放（从「一键生成」跳进来就属于这种情况），
 * 这时不能假装在播 —— 改为亮出「点击开始收听」的入口。
 */
async function startPlayback(): Promise<void> {
  const element = audioElement.value
  if (!element || !player.hasAudio) {
    return
  }

  try {
    await element.play()
    player.setNeedsGesture(false)
  } catch (cause) {
    // 换 src 时旧播放被中断会抛 AbortError，那不是「被拦」的意思
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return
    }
    player.setNeedsGesture(true)
  }
}

function togglePlay(): void {
  const element = audioElement.value
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
  const element = audioElement.value
  if (!element) {
    return
  }

  const upper = player.duration > 0 ? player.duration : seconds
  const next = Math.min(Math.max(seconds, 0), upper)
  element.currentTime = next
  // 立即反映到界面（不等下一次 timeupdate），锚点仍然是音频自己的 currentTime
  player.syncTime(next)
}

function handleSeekInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) {
    seekTo(value)
  }
}

function seekBy(delta: number): void {
  const element = audioElement.value
  if (element) {
    seekTo(element.currentTime + delta)
  }
}

/** 重听当前这一句（回到这一句的开头） */
function replayCurrentCue(): void {
  const cue = player.cues[player.cueIndex]
  seekTo(cue ? cue.start : 0)
  if (!player.playing) {
    void startPlayback()
  }
}

function handleEnded(): void {
  player.handleEnded()
}

function chooseEdge(edge: PlayEdge): void {
  void player.openEdge(edge)
}

function showCondition(edge: PlayEdge): boolean {
  return edge.condition !== '' && edge.condition.toUpperCase() !== 'NONE'
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
 * 模式与控件显隐
 * ============================================================= */

/**
 * 定时器句柄：**只用于「纯聆听模式下控件自动隐藏」**。
 * 字幕推进绝不使用定时器 —— 那完全由 <audio> 的 timeupdate 驱动。
 */
let hideTimer = 0

function clearHideTimer(): void {
  window.clearTimeout(hideTimer)
  hideTimer = 0
}

function scheduleHide(): void {
  clearHideTimer()

  if (player.mode !== 'listen') {
    return
  }

  hideTimer = window.setTimeout(() => {
    // 暂停时不隐藏：否则用户看不到自己刚点的暂停
    if (player.mode === 'listen' && player.playing && !player.awaitingBranch) {
      controlsVisible.value = false
    }
  }, AUTO_HIDE_MS)
}

function switchMode(mode: PlayerMode): void {
  player.setMode(mode)
}

function handleStageClick(): void {
  if (player.mode !== 'listen') {
    return
  }

  controlsVisible.value = true
  scheduleHide()
}

function handleWindowKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    // 方向键留给进度条自己用
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
 * 场景加载与切换
 * ============================================================= */

async function loadFromRoute(): Promise<void> {
  const ok = await player.loadScene(sceneId.value)
  if (!ok) {
    // 失败由 player.error 的 watch 转成提示条，页内另有错误面与「重试」
    return
  }

  notify(`场景已就绪：${player.currentScene?.sceneId ?? sceneId.value}`)
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
 * 音频的装载与播放**只在这一个地方发生**（唯一入口）。
 *
 * 依赖 player.reloadToken，而不是 scene.audioUrl / scene.sceneId：
 *   · 换场：两段场景可能共用同一个音频地址（演示模式的静音音频按长度复用同一个
 *     object URL 就是这种情况），只看 URL 会漏掉，元素会停在上一次的 ended 位置；
 *   · 重试：同一个 sceneId 也可能需要重新装载。
 *   store 在「当前场景需要重新装载」时自增这个信号，两种情况都覆盖。
 * flush: 'post' 保证回调运行时 <audio> 已经挂到 DOM 上。
 */
watch(
  () => player.reloadToken,
  async () => {
    const element = audioElement.value
    if (!element) {
      return
    }

    if (!player.hasAudio) {
      player.setPlaying(false)
      return
    }

    applyFixedAudioSettings(element)
    element.load()
    await startPlayback()
  },
  { flush: 'post' },
)

// 换模式时同步控件状态：切到纯聆听就开始倒计时，切回带文字就固定显示
watch(
  () => player.mode,
  (mode) => {
    clearHideTimer()

    if (mode === 'listen') {
      controlsVisible.value = true
      scheduleHide()
      return
    }

    controlsVisible.value = true
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  void loadFromRoute()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  clearHideTimer()
  window.clearTimeout(toastTimer)

  const element = audioElement.value
  if (element) {
    element.pause()
  }

  // 离开页面就清空播放状态，下次进来不会残留上一段
  player.reset()
})
</script>

<template>
  <div class="nw-player" :class="{ 'nw-player--listen': player.mode === 'listen' }">
    <PageBackdrop />

    <header class="nw-player__top">
      <BackLink label="返回操作编辑" :to="{ name: ROUTE_NAMES.studioOperations }" />

      <PageHeader class="nw-player__title" title="播放" />

      <div class="nw-player__modes" role="group" aria-label="播放模式">
        <button
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          type="button"
          class="nw-player__mode"
          :class="{ 'nw-player__mode--active': player.mode === option.value }"
          :aria-pressed="player.mode === option.value"
          @click="switchMode(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </header>

    <!-- 点击任意处显示控件（纯聆听模式） -->
    <main class="nw-player__stage" @click="handleStageClick">
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

      <GlassPanel v-else-if="player.loading && !scene" class="nw-player__state" tone="strong">
        <h2 class="nw-player__state-title">正在加载场景…</h2>
        <p class="nw-player__state-text">sceneId：{{ sceneId || '（缺失）' }}</p>
      </GlassPanel>

      <template v-else-if="scene">
        <!-- ============ 封面：声音能量场 ============ -->
        <GlassPanel class="nw-player__cover" tone="strong">
          <div class="nw-player__visual">
            <!--
              两种模式共用同一张封面图（静态星云）。
              它只是一张静态图片：播放时做极轻微的呼吸（缩放 + 亮度变化），暂停即静止；
              动效仍然只碰 transform 与 opacity。
            -->
            <img
              class="nw-player__cover-art"
              :class="{ 'nw-player__cover-art--active': player.playing }"
              :src="coverArt"
              alt=""
            />
          </div>

          <dl class="nw-player__meta">
            <dt>场景</dt>
            <dd class="nw-player__meta-value">{{ scene.sceneId }}</dd>
            <dt>说话人</dt>
            <dd class="nw-player__meta-value">{{ scene.speaker || '未标注' }}</dd>
            <dt>进度</dt>
            <dd class="nw-player__meta-value">
              {{ formatTime(player.currentTime) }} / {{ player.ready ? formatTime(player.duration) : '--:--' }}
            </dd>
          </dl>

          <p v-if="!player.hasAudio" class="nw-player__warn">
            该场景没有音频地址（契约字段 audioUrl 为空），只显示文本。
          </p>

          <!-- 后端还没有 GET /play/scene/{sceneId}：场景与音频仍由本地 Mock 提供，
               标记必须留着，否则「静音占位音频」会被当成真实音频 -->
          <DemoModeBadge
            :active="isPlayMockMode"
            hint="这里播的是本地合成的静音占位音频：用来验证进度 / 字幕 / 声波联动"
          />

          <p v-if="player.queuedScene" class="nw-player__queue" role="status">
            队列中：{{ player.queuedScene.sceneId }}（这一段播完自动接上）
          </p>

          <p v-if="player.notice" class="nw-player__notice" role="status">{{ player.notice }}</p>
        </GlassPanel>

        <!-- ============ 字幕 + 控制 + 分支 ============ -->
        <div class="nw-player__main">
          <!-- 字幕窗口：固定高度，当前句高亮放大，其余变暗，整体 translateY 平滑滚动 -->
          <GlassPanel
            v-if="player.mode === 'text'"
            class="nw-player__subtitle"
            :class="{ 'nw-player__subtitle--chrome-hidden': !chromeVisible }"
            tone="strong"
          >
            <div class="nw-player__subtitle-head">
              <h2 class="nw-player__subtitle-title">台词</h2>
              <span
                v-if="player.timelineIsEstimated"
                class="nw-player__badge"
                title="契约未提供逐句时间戳，这里按句长比例把音频时长分配给各句；后端补上 subtitles 后会自动改用真实时间轴"
              >
                按句长估算
              </span>
              <span v-else-if="player.cues.length > 0" class="nw-player__badge">逐句时间轴</span>
              <span class="nw-player__subtitle-count">
                {{ player.cueIndex >= 0 ? player.cueIndex + 1 : 0 }} / {{ player.cues.length }}
              </span>
            </div>

            <!-- 时长还没拿到（元数据未加载）时如实说明，不硬凑时间轴 -->
            <p v-if="player.cues.length === 0" class="nw-player__subtitle-wait">
              {{
                scene.text === ''
                  ? '这个场景没有台词文本。'
                  : player.hasAudio
                    ? '等待音频元数据就绪后再显示逐句高亮（时长未知无法分配句子时间）。'
                    : '没有音频地址，无法把台词对齐到时间轴；以下是完整文本。'
              }}
            </p>

            <p v-if="player.cues.length === 0 && scene.text !== ''" class="nw-player__subtitle-plain">
              {{ scene.text }}
            </p>

            <div v-else-if="player.cues.length > 0" class="nw-player__cue-window">
              <ul
                class="nw-player__cues"
                :style="{ '--nw-player-cue-index': Math.max(player.cueIndex, 0) }"
              >
                <li
                  v-for="(cue, index) in player.cues"
                  :key="`${index}-${cue.start}`"
                  class="nw-player__cue"
                  :class="{
                    'nw-player__cue--active': index === player.cueIndex,
                    'nw-player__cue--past': index < player.cueIndex,
                  }"
                >
                  <span class="nw-player__cue-text">{{ cue.text }}</span>
                </li>
              </ul>
            </div>
          </GlassPanel>

          <!-- 控件：播放 / 进度条 / 队列 / 重听本句 -->
          <GlassPanel
            class="nw-player__controls"
            :class="{ 'nw-player__controls--hidden': !chromeVisible }"
            tone="strong"
            @click.stop="handleStageClick"
          >
            <div class="nw-player__transport">
              <AppButton
                size="md"
                variant="ghost"
                :disabled="!player.hasPrevious"
                @click="player.goPrevious()"
              >
                上一段
              </AppButton>

              <AppButton
                class="nw-player__play"
                size="lg"
                variant="primary"
                notched
                :disabled="!player.hasAudio"
                @click="togglePlay"
              >
                {{ player.playing ? '暂停' : '播放' }}
              </AppButton>

              <AppButton
                size="md"
                variant="ghost"
                :disabled="!player.hasNextInQueue"
                @click="player.goNext()"
              >
                下一段
              </AppButton>

              <AppButton
                size="md"
                variant="ghost"
                :disabled="player.cues.length === 0"
                @click="replayCurrentCue"
              >
                重听本句
              </AppButton>
            </div>

            <div class="nw-player__progress">
              <span class="nw-player__time">{{ formatTime(player.currentTime) }}</span>

              <input
                class="nw-player__range"
                type="range"
                min="0"
                :max="seekMax"
                step="0.1"
                :value="player.currentTime"
                :disabled="!player.hasAudio"
                aria-label="播放进度"
                @input="handleSeekInput"
              />

              <span class="nw-player__time">
                {{ player.ready ? formatTime(player.duration) : '--:--' }}
              </span>
            </div>

            <div class="nw-player__hints">
              <span v-if="!player.playing && player.hasAudio" class="nw-player__hint">
                空格键播放 / 暂停，左右方向键 ±{{ SEEK_STEP }} 秒。
              </span>
              <span v-if="player.edges.length > 0 && !player.edgesVisible" class="nw-player__hint">
                这个场景有 {{ player.edges.length }} 个分支。
                <button type="button" class="nw-player__link" @click="player.openEdges()">
                  查看选项
                </button>
              </span>
            </div>
          </GlassPanel>

          <!-- 分支交互卡：淡入；纯聆听模式下只在需要选择时才出现 -->
          <Transition name="nw-player-rise">
            <GlassPanel
              v-if="player.edgesVisible && chromeVisible"
              class="nw-player__edges"
              tone="strong"
              @click.stop="handleStageClick"
            >
              <h2 class="nw-player__edges-title">
                {{ player.awaitingBranch ? '这一段说完了，接下来往哪走？' : '选择接下来的走向' }}
              </h2>
              <p class="nw-player__edges-hint">
                选项来自后端 edges；目标场景的台词与音频已在本地，点选即播，不再等待网络。
              </p>

              <ul class="nw-player__edges-list">
                <li v-for="(edge, index) in player.edges" :key="`${index}-${edge.targetScene.sceneId}`">
                  <button type="button" class="nw-player__edge" @click="chooseEdge(edge)">
                    <span class="nw-player__edge-action">{{ edge.action || '继续' }}</span>
                    <span v-if="showCondition(edge)" class="nw-player__edge-condition">
                      {{ edge.condition }}
                    </span>
                    <span class="nw-player__edge-target">{{ edge.targetScene.sceneId }}</span>
                  </button>
                </li>
              </ul>
            </GlassPanel>
          </Transition>
        </div>
      </template>
    </main>

    <!-- 自动播放被浏览器拦下：如实要求一次点击，而不是假装在播 -->
    <div
      v-if="player.needsGesture && player.hasAudio && scene"
      class="nw-player__gate"
      role="button"
      tabindex="0"
      @click="startPlayback"
      @keydown.enter.prevent="startPlayback"
      @keydown.space.prevent="startPlayback"
    >
      <GlassPanel class="nw-player__gate-panel" tone="strong">
        <h2 class="nw-player__gate-title">点击开始收听</h2>
        <p class="nw-player__gate-text">
          浏览器不允许页面自动播放声音，需要你点一下。场景已加载：{{ scene.sceneId }}
        </p>
      </GlassPanel>
    </div>

    <!-- 音频元素：不加 controls，界面用自绘控件；时间锚点全部来自它 -->
    <audio
      ref="audioElement"
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
  </div>
</template>

<style scoped>
/*
 * 字幕尺寸体系：三个可见行、每行固定高度。
 * 行高按「放大后的当前句」计算，因此其它句（字号更小）也放得下，
 * 每行高度一致 → translateY 的步长是精确的，滚动不会累积错位。
 */
.nw-player {
  --nw-player-cue-size: clamp(0.95rem, 0.9rem + 0.3vw, 1.16rem);
  --nw-player-cue-size-active: calc(var(--nw-player-cue-size) * 1.16);
  --nw-player-cue-height: calc(var(--nw-player-cue-size-active) * 1.6 * 2);
  --nw-player-cue-window: calc(var(--nw-player-cue-height) * 3);

  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
}

/* =============================================================
 * 顶栏：返回 / 标题 / 模式切换
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
  padding-block: var(--nw-layout-header-inset) var(--nw-space-sm);
  padding-inline: var(--nw-layout-page-gutter);
}

.nw-player__title {
  justify-self: center;
  min-width: 0;
}

.nw-player__modes {
  display: flex;
  justify-self: end;
  gap: 2px;
  padding: 3px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-button-fill-secondary);
}

.nw-player__mode {
  padding: 0.35rem 0.85rem;
  border: none;
  border-radius: var(--nw-radius-pill);
  background-color: transparent;
  color: var(--nw-color-text-secondary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--nw-transition-colors);
}

.nw-player__mode:hover {
  color: var(--nw-color-text-primary);
}

.nw-player__mode--active {
  background-color: var(--nw-color-accent-hover);
  color: var(--nw-color-accent-contrast);
}

/* =============================================================
 * 主体：封面 + （字幕 / 控件 / 分支）
 * ============================================================= */
.nw-player__stage {
  position: relative;
  z-index: var(--nw-z-content);
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
  /* 两列各自在行内垂直居中：内容多少不同时不会一头沉 */
  align-items: center;
  /* 整块内容在剩余高度里居中，避免宽屏下全部挤在顶部 */
  align-content: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  width: 100%;
  max-width: var(--nw-layout-content-max);
  margin-inline: auto;
  padding-block: 0 calc(var(--nw-layout-header-inset) + var(--nw-space-sm));
  padding-inline: var(--nw-layout-page-gutter);
}

/* ---------- 封面 ---------- */
.nw-player__cover {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  padding: clamp(0.9rem, 2vw, 1.35rem);
}

.nw-player__visual {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  max-height: 42vh;
  overflow: hidden;
  border-radius: var(--nw-radius-md);
}

/* 压一条与站内玻璃面板同源的细边，让图片不像「贴上去的」 */
.nw-player__visual::after {
  content: '';
  position: absolute;
  inset: 0;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: inherit;
  pointer-events: none;
}

/*
 * 封面图铺满整个视觉区。
 *
 * ⚠️ 必须用绝对定位铺满，**不能写 height: 100%**：
 *   父级的高度是由 aspect-ratio 推出来的，这种高度在百分比解析里算「不确定」，
 *   于是 height: 100% 会退化成 auto —— 图片按原始比例撑成 275×471，
 *   再被 overflow: hidden 硬裁成正方形。那样 object-fit / object-position 根本没参与裁切，
 *   换一张图或改一处比例就会「莫名其妙」地跑偏。
 *   绝对定位的 inset: 0 直接对准父级的盒子，尺寸永远是确定的。
 */
.nw-player__cover-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* 竖图放进方框：cover 必然裁切，取景略微上移，保住星云最亮的那颗核 */
  object-fit: cover;
  object-position: center 46%;
  /* 呼吸幅度克制：封面图不该喧宾夺主 */
  animation: nw-player-cover-breathe 6s var(--nw-ease-in-out) infinite;
  /* 未播放时停在当前帧，而不是回到起点，视线不会被打断 */
  animation-play-state: paused;
  will-change: transform, opacity;
}

.nw-player__cover-art--active {
  animation-play-state: running;
}

@keyframes nw-player-cover-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.88;
  }

  50% {
    transform: scale(1.03);
    opacity: 1;
  }
}

.nw-player__meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.35rem var(--nw-space-xs);
  font-size: var(--nw-font-size-sm);
}

.nw-player__meta dt {
  color: var(--nw-color-text-tertiary);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-player__meta-value {
  overflow: hidden;
  color: var(--nw-color-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nw-player__warn,
.nw-player__notice,
.nw-player__queue {
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-player__warn {
  color: var(--nw-color-warning);
}

.nw-player__notice {
  color: var(--nw-color-warning);
}

.nw-player__queue {
  color: var(--nw-color-accent-contrast);
}

/* ---------- 右列 ---------- */
.nw-player__main {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  min-width: 0;
}

/* ---------- 字幕 ---------- */
.nw-player__subtitle {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: clamp(0.75rem, 1.8vw, 1.15rem);
}

.nw-player__subtitle-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-player__subtitle-title {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  font-weight: var(--nw-font-weight-medium);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-player__badge {
  padding: 2px 8px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

.nw-player__subtitle-count {
  margin-left: auto;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

.nw-player__subtitle-wait {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-player__subtitle-plain {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
  white-space: pre-wrap;
}

/* 固定高度的字幕窗口：只显示 3 行，上下渐隐 */
.nw-player__cue-window {
  height: var(--nw-player-cue-window);
  overflow: hidden;
  /*
   * 这里的 #000 是遮罩的 alpha 值（遮罩只认不透明度），不是主题颜色，
   * 因此不走 --nw-* 令牌，也不会随主题切换 —— 换成任何深色都是同样效果。
   */
  mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%);
  -webkit-mask-image: linear-gradient(
    180deg,
    transparent 0%,
    #000 18%,
    #000 82%,
    transparent 100%
  );
}

.nw-player__cues {
  margin: 0;
  padding: 0;
  list-style: none;
  /*
   * 滚动位置 = 行高 ×（1 − 当前句下标）：把当前句挪到窗口正中间。
   * 下标由 audio.currentTime 推导，所以这个位移天然跟着音频走。
   */
  transform: translateY(calc(var(--nw-player-cue-height) * (1 - var(--nw-player-cue-index, 0))));
  transition: transform var(--nw-duration-base) var(--nw-ease-out);
}

.nw-player__cue {
  display: grid;
  place-items: center;
  height: var(--nw-player-cue-height);
  padding-inline: 0.25rem;
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-player-cue-size);
  line-height: 1.6;
  text-align: center;
  opacity: 0.55;
  transition:
    opacity var(--nw-duration-base) var(--nw-ease-out),
    color var(--nw-duration-base) var(--nw-ease-out);
}

.nw-player__cue-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 已播过的句子比未播的更暗，形成方向感 */
.nw-player__cue--past {
  opacity: 0.32;
}

/* 当前句：高亮 + 字号略大 */
.nw-player__cue--active {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-player-cue-size-active);
  font-weight: var(--nw-font-weight-medium);
  opacity: 1;
  text-shadow: 0 0 18px var(--nw-color-accent-hover);
}

/* ---------- 控件 ---------- */
.nw-player__controls {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: clamp(0.75rem, 1.8vw, 1.15rem);
  transition:
    opacity var(--nw-duration-base) var(--nw-ease-out),
    transform var(--nw-duration-base) var(--nw-ease-out);
}

/* 纯聆听模式：控件收起（点击任意处再出现） */
.nw-player--listen .nw-player__controls--hidden {
  opacity: 0;
  transform: translateY(0.75rem);
  pointer-events: none;
}

.nw-player__transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-player__play {
  min-width: 6.5rem;
}

.nw-player__progress {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--nw-space-2xs);
}

.nw-player__time {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.nw-player__range {
  width: 100%;
  height: 1.25rem;
  margin: 0;
  background: transparent;
  accent-color: var(--nw-color-accent);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.nw-player__range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-border);
}

.nw-player__range::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border: none;
  border-radius: var(--nw-radius-circle);
  background-color: var(--nw-color-accent-contrast);
  -webkit-appearance: none;
  appearance: none;
}

.nw-player__range::-moz-range-track {
  height: 4px;
  border-radius: var(--nw-radius-pill);
  background-color: var(--nw-color-border);
}

.nw-player__range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: var(--nw-radius-circle);
  background-color: var(--nw-color-accent-contrast);
}

.nw-player__range:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.nw-player__hints {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-xs);
  min-height: 1.2rem;
}

.nw-player__hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

.nw-player__link {
  padding: 0;
  border: none;
  background: none;
  color: var(--nw-color-accent-contrast);
  font-family: inherit;
  font-size: inherit;
  text-decoration: underline;
  cursor: pointer;
}

/* ---------- 分支交互卡 ---------- */
.nw-player__edges {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  padding: clamp(0.75rem, 1.8vw, 1.15rem);
}

.nw-player__edges-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
  font-weight: var(--nw-font-weight-medium);
}

.nw-player__edges-hint {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-player__edges-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--nw-space-2xs);
  margin: var(--nw-space-2xs) 0 0;
  padding: 0;
  list-style: none;
}

.nw-player__edge {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  height: 100%;
  padding: 0.7rem 0.9rem;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-md);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--nw-transition-interactive);
}

.nw-player__edge:hover,
.nw-player__edge:focus-visible {
  border-color: var(--nw-color-focus);
  background-color: var(--nw-color-button-fill-secondary-hover);
  transform: translateY(-2px);
}

.nw-player__edge-action {
  font-size: var(--nw-font-size-md);
}

.nw-player__edge-condition {
  align-self: flex-start;
  padding: 1px 7px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
}

.nw-player__edge-target {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
}

/* 淡入上移 */
.nw-player-rise-enter-active,
.nw-player-rise-leave-active {
  transition:
    opacity var(--nw-duration-base) var(--nw-ease-out),
    transform var(--nw-duration-base) var(--nw-ease-out);
}

.nw-player-rise-enter-from,
.nw-player-rise-leave-to {
  opacity: 0;
  transform: translateY(1.25rem);
}

/* ---------- 状态面板 ---------- */
.nw-player__state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nw-space-2xs);
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

/* ---------- 自动播放拦截 ---------- */
.nw-player__gate {
  position: fixed;
  inset: 0;
  z-index: var(--nw-z-overlay);
  display: grid;
  place-items: center;
  padding: var(--nw-layout-page-gutter);
  /* 遮罩色与模态框共用同一个令牌，不再各写各的 */
  background-color: var(--nw-color-overlay-soft);
  backdrop-filter: blur(var(--nw-blur-sm));
  -webkit-backdrop-filter: blur(var(--nw-blur-sm));
  cursor: pointer;
}

.nw-player__gate-panel {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
  max-width: 32rem;
  padding: clamp(1.25rem, 3vw, 2rem);
  text-align: center;
}

.nw-player__gate-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-lg);
  font-weight: var(--nw-font-weight-semibold);
}

.nw-player__gate-text {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
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

/* 窄屏 / 竖屏：封面与内容改为上下堆叠，封面视觉收敛为一条 */
@media (max-width: 900px) {
  .nw-player__stage {
    grid-template-columns: minmax(0, 1fr);
  }

  .nw-player__visual {
    aspect-ratio: auto;
    max-height: none;
    height: clamp(9rem, 26vh, 14rem);
  }
}

/* 手机：顶栏三段改为两行，模式切换占满一行 */
@media (max-width: 640px) {
  .nw-player__top {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--nw-space-2xs);
  }

  .nw-player__title {
    justify-self: end;
  }

  .nw-player__modes {
    grid-column: 1 / -1;
    justify-self: stretch;
  }

  .nw-player__mode {
    flex: 1;
    text-align: center;
  }

  .nw-player__transport {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nw-player__play {
    grid-column: 1 / -1;
    order: -1;
    min-width: 0;
  }
}

/* 矮屏（横屏手机 / 小窗）：压缩字幕窗口，避免整页只能滚动 */
@media (max-height: 560px) {
  .nw-player {
    --nw-player-cue-height: calc(var(--nw-player-cue-size-active) * 1.5 * 2);
    --nw-player-cue-window: calc(var(--nw-player-cue-height) * 2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-player__cover-art {
    animation: none;
  }

  .nw-player__cues,
  .nw-player__cue,
  .nw-player__controls,
  .nw-player__edge,
  .nw-player__mode,
  .nw-player-rise-enter-active,
  .nw-player-rise-leave-active {
    transition: none;
  }

  .nw-player-rise-enter-from,
  .nw-player-rise-leave-to {
    transform: none;
  }

  .nw-player__edge:hover,
  .nw-player__edge:focus-visible {
    transform: none;
  }

  .nw-player--listen .nw-player__controls--hidden {
    transform: none;
  }
}
</style>
