/**
 * 演示模式（Mock）用的「静音音频」生成器
 * ---------------------------------------------------------------
 * 为什么需要它：
 *   播放页把 `<audio>` 的 `currentTime` 当作**唯一时间锚点**（字幕、进度条、声波动画
 *   全部由它推导）。如果 Mock 场景不带音频地址，整条播放链路就没法验证 ——
 *   也就无法在接后端之前确认「桥段切换 + 字幕滚动 + 进度走动」是通的。
 *
 * 做法：
 *   在浏览器里现成合成一段 WAV（PCM 16bit 单声道 8kHz，采样值全 0 即静音），
 *   用 `URL.createObjectURL` 变成一个可播放的地址。
 *   这样播放页走的是**真实 `<audio>` 元素 + 真实 currentTime**，
 *   与接入真实后端后的代码路径完全一致 —— 后端给了真实 `audioUrl` 时零改动切换。
 *
 * ⚠️ 本文件只生成静音占位音频，不涉及任何真实音频内容。
 * TODO: 待后端接入，当前为演示用 Mock —— 接入后本文件可整体删除。
 */

/** 采样率：8kHz 足够（静音不含信息），体积最小 */
const SAMPLE_RATE = 8000

/** 声道数：单声道 */
const CHANNELS = 1

/** 位深：16bit */
const BITS_PER_SAMPLE = 16

/** 单段静音的最短 / 最长时间（秒），避免极短或极长的台词生成离谱的音频 */
const MIN_SECONDS = 4
const MAX_SECONDS = 45

/** 语速估算：每秒约 4.5 个汉字，再加一点起止留白 */
const SECONDS_PER_CHAR = 0.22
const LEAD_IN_SECONDS = 1.6

/**
 * 已生成的静音地址缓存：key 是 0.5 秒对齐后的时长。
 * 同一段台词的时长是确定的，缓存后重复请求不会反复分配几百 KB 的内存。
 * 这些 object URL 在会话结束前不回收 —— 单段最长 45s ≈ 720KB，代价可接受，
 * 而提前 revoke 会让仍在播放的 `<audio>` 突然失去音源。
 */
const urlCache = new Map<number, string>()

/** WAV 头里的定长字符串字段（RIFF / WAVE / fmt / data） */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

/** 合成一段静音 WAV（PCM 16bit 单声道） */
function buildSilentWav(seconds: number): Blob {
  const frames = Math.max(1, Math.round(seconds * SAMPLE_RATE))
  const bytesPerFrame = (CHANNELS * BITS_PER_SAMPLE) / 8
  const dataBytes = frames * bytesPerFrame

  // 44 字节是标准 WAV 头长度；PCM 静音的采样值就是 0，
  // ArrayBuffer 初始化即全 0，因此数据段不需要额外填充。
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // 1 = PCM
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * bytesPerFrame, true) // 字节率
  view.setUint16(32, bytesPerFrame, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 按台词长度估算「读出来要多久」，用来决定静音音频的时长。
 * 这样字幕按句长分配时间后，滚动节奏与实际朗读接近，演示时看着自然。
 */
export function estimateSpeechSeconds(text: string): number {
  let weight = 0
  for (const char of text) {
    if (char.trim() !== '') {
      weight += 1
    }
  }

  const seconds = LEAD_IN_SECONDS + weight * SECONDS_PER_CHAR
  return Math.min(Math.max(seconds, MIN_SECONDS), MAX_SECONDS)
}

/** 取一段指定时长的静音音频地址（同长度复用同一个 object URL） */
export function silentAudioUrl(seconds: number): string {
  const clamped = Math.min(Math.max(seconds, MIN_SECONDS), MAX_SECONDS)
  const key = Math.round(clamped * 2) / 2

  const cached = urlCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const url = URL.createObjectURL(buildSilentWav(key))
  urlCache.set(key, url)
  return url
}

/** 按台词文本取静音音频地址（Mock 场景构造的唯一入口） */
export function silentAudioUrlForText(text: string): string {
  return silentAudioUrl(estimateSpeechSeconds(text))
}
