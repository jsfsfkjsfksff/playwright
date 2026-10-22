/**
 * 字幕解析（LRC / SRT / WebVTT / JSON）
 * ---------------------------------------------------------------
 * 背景：契约（接口文档 v1.0）**没有**给出字幕字段，播放页原先只能按句长比例估算。
 * 本轮需求：后端一旦给出时间戳（无论哪种常见格式），前端要能直接吃下来。
 *
 * 设计原则：
 *   1. **纯函数、零依赖**：不引入第三方解析库（项目对依赖很克制），只做必要的容错；
 *   2. **解析失败不抛错**：返回空数组，由调用方退回「按句长估算」——
 *      字幕格式坏掉不该让播放页变成白屏；
 *   3. **时间轴一律收敛成秒**（number），前端只认 `{ text, start, end }`。
 *
 * 支持格式（按识别顺序）：
 *   - JSON 字符串：`[{ text, start, end }]`，或 `{ cues | subtitles | subtitles: [...] }`；
 *   - LRC：`[00:12.34]台词`，支持一行多个时间标签；
 *   - SRT：`1\n00:00:01,000 --> 00:00:03,500\n台词`；
 *   - WebVTT：`WEBVTT` 头 + `00:00:01.000 --> 00:00:03.500`，可带 `<i>` 等行内标签。
 */
import type { PlaySubtitleCue } from '@/types/studio'

/** 单句最短时长（秒）：避免时间戳粘连导致某句「存在但显示 0 秒」 */
const MIN_CUE_SECONDS = 0.2

/** 收尾：排序、去空、修掉非法区间 */
function normalize(cues: PlaySubtitleCue[]): PlaySubtitleCue[] {
  const cleaned = cues
    .filter((cue) => cue.text.trim() !== '')
    .map((cue) => ({
      text: cue.text.trim(),
      start: Math.max(0, cue.start),
      end: Math.max(0, cue.end),
    }))
    .sort((left, right) => left.start - right.start)

  return cleaned.map((cue, index) => {
    const next = cleaned[index + 1]
    // 结束时间缺失或倒挂时：先补最短时长，再不强求与下一句对齐（重叠由播放页取下标兜住）
    const end = cue.end > cue.start ? cue.end : cue.start + MIN_CUE_SECONDS
    void next
    return { ...cue, end }
  })
}

/** `00:01:02,500` / `00:01:02.500` / `01:02.5` / `62.5` → 秒 */
function parseTimecode(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') {
    return null
  }

  const parts = text.split(':')
  if (parts.length > 3) {
    return null
  }

  const seconds = Number(parts.pop())
  if (!Number.isFinite(seconds)) {
    return null
  }

  let total = seconds
  const minutes = parts.length > 0 ? Number(parts.pop()) : 0
  if (!Number.isFinite(minutes)) {
    return null
  }
  total += minutes * 60

  if (parts.length > 0) {
    const hours = Number(parts.pop())
    if (!Number.isFinite(hours)) {
      return null
    }
    total += hours * 3600
  }

  return total
}

/** 去掉 VTT / SRT 里常见的行内标签与排版提示 */
function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '')
    .trim()
}

/* =============================================================
 * JSON
 * ============================================================= */

function isCueLike(value: unknown): value is { text?: unknown; start?: unknown; end?: unknown } {
  return value !== null && typeof value === 'object'
}

function parseJsonCues(raw: string): PlaySubtitleCue[] {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return []
  }

  // 允许 `{ cues: [...] }` / `{ subtitles: [...] }` 这类包装
  let list: unknown = payload
  if (isCueLike(payload) && !Array.isArray(payload)) {
    const holder = payload as Record<string, unknown>
    list = holder.cues ?? holder.subtitles ?? holder.data ?? null
  }

  if (!Array.isArray(list)) {
    return []
  }

  const cues: PlaySubtitleCue[] = []
  for (const item of list) {
    if (!isCueLike(item)) {
      continue
    }

    const text = typeof item.text === 'string' ? item.text : ''
    const start = typeof item.start === 'number' ? item.start : Number(item.start)
    const end = typeof item.end === 'number' ? item.end : Number(item.end)

    if (text === '' || !Number.isFinite(start)) {
      continue
    }

    cues.push({ text, start, end: Number.isFinite(end) ? end : start + MIN_CUE_SECONDS })
  }

  return normalize(cues)
}

/* =============================================================
 * LRC
 * ============================================================= */

/** `[mm:ss.xx]` / `[mm:ss]`，一行可有多个标签 */
const LRC_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g

function parseLrc(raw: string): PlaySubtitleCue[] {
  const entries: { start: number; text: string }[] = []

  for (const line of raw.split(/\r?\n/)) {
    LRC_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null = LRC_TAG.exec(line)

    while (match !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2].replace(':', '.'))
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        stamps.push(minutes * 60 + seconds)
      }
      match = LRC_TAG.exec(line)
    }

    if (stamps.length === 0) {
      continue
    }

    const text = stripMarkup(line.replace(LRC_TAG, ''))
    if (text === '') {
      continue
    }

    for (const start of stamps) {
      entries.push({ start, text })
    }
  }

  entries.sort((left, right) => left.start - right.start)

  // LRC 只给起点：每句的结束时间取下一句的起点（最后一句给最短时长）
  return normalize(
    entries.map((entry, index) => {
      const next = entries[index + 1]
      return {
        text: entry.text,
        start: entry.start,
        end: next ? next.start : entry.start + MIN_CUE_SECONDS,
      }
    }),
  )
}

/* =============================================================
 * SRT / WebVTT
 * ============================================================= */

/** 时间行：`00:00:01,000 --> 00:00:03,500`（可带 VTT 的位置设置） */
const RANGE_LINE = /^(.+?)\s*-->\s*(.+?)(?:\s+\w+:.*)?$/

function parseTimedBlocks(raw: string): PlaySubtitleCue[] {
  const lines = raw.split(/\r?\n/)
  const cues: PlaySubtitleCue[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines[index].trim()

    const range = RANGE_LINE.exec(line)
    if (range === null) {
      index += 1
      continue
    }

    const start = parseTimecode(range[1])
    const end = parseTimecode(range[2])
    if (start === null || end === null) {
      index += 1
      continue
    }

    // 台词：直到空行或下一条时间行
    const textLines: string[] = []
    index += 1
    while (index < lines.length) {
      const next = lines[index]
      if (next.trim() === '' || RANGE_LINE.test(next.trim())) {
        break
      }
      textLines.push(stripMarkup(next))
      index += 1
    }

    const text = textLines.join(' ').trim()
    if (text !== '') {
      cues.push({ text, start, end })
    }
  }

  return normalize(cues)
}

/* =============================================================
 * 统一入口
 * ============================================================= */

/**
 * 把后端给的字幕（字符串或已结构化的数组）解析成 `PlaySubtitleCue[]`。
 * 解析不出来就返回空数组 —— 调用方据此退回「按句长估算」。
 */
export function parseSubtitles(raw: unknown): PlaySubtitleCue[] {
  if (raw === null || raw === undefined) {
    return []
  }

  if (Array.isArray(raw)) {
    return parseJsonCues(JSON.stringify(raw))
  }

  if (typeof raw !== 'string') {
    return []
  }

  const text = raw.trim()
  if (text === '') {
    return []
  }

  // 1. JSON：以 { 或 [ 开头
  //    ⚠️ LRC 也以 `[` 开头（`[00:12.34]台词`），因此这里不能只看首字符就判定 JSON，
  //    必须「解析成功且拿到 cue」才认，否则继续按文本格式往下识别。
  if (text.startsWith('{') || text.startsWith('[')) {
    const jsonCues = parseJsonCues(text)
    if (jsonCues.length > 0) {
      return jsonCues
    }
  }

  // 2. WebVTT / SRT：有时间区间的箭头
  if (text.includes('-->')) {
    return parseTimedBlocks(text)
  }

  // 3. LRC：[mm:ss.xx]
  if (/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(text)) {
    return parseLrc(text)
  }

  return []
}

/**
 * 取某一时刻应显示的字幕下标（二分查找，供 timeupdate 高频调用）。
 * 没有任何 cue 命中时返回 -1。
 */
export function pickCueIndex(cues: readonly PlaySubtitleCue[], time: number): number {
  if (cues.length === 0) {
    return -1
  }

  let low = 0
  let high = cues.length - 1
  let found = -1

  while (low <= high) {
    const mid = (low + high) >> 1
    const cue = cues[mid]

    if (time < cue.start) {
      high = mid - 1
    } else if (time >= cue.end) {
      low = mid + 1
    } else {
      found = mid
      break
    }
  }

  return found
}
