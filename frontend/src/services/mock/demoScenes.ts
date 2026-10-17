/**
 * 兜底演示剧情图（Mock 专用）
 * ---------------------------------------------------------------
 * 解决的问题：
 *   假后端的数据只在内存里。用户生成完故事后**刷新播放页**，内存被清空，
 *   直接访问 `/player/{sceneId}` 就什么都拿不到 —— 播放页会只剩失败态。
 *   这里给出一张固定的演示剧情图，让播放页的视觉（进度走动、字幕滚动、
 *   声波动画、分支切换）在任何情况下都可演示。
 *
 * 命中规则（见 buildDemoScene）：
 *   · 请求的 sceneId 在演示图里        → 返回该节点；
 *   · 请求的 sceneId 不在演示图里      → 用入口节点的内容，但**保留请求的 sceneId**，
 *     这样地址栏、页面上的「场景」字段与实际内容一致，不会出现「URL 是一个 id、
 *     内容却是另一个 id」的错位。
 *
 * 契约要点（必须遵守）：
 *   `edges[i].targetScene` 里的嵌套层按后端 `@JsonIgnoreProperties("edges")` 的行为
 *   **edges 恒为空数组**，所以 depth > 0 时强制清空 —— 与 services/studio.ts 的
 *   readPlayScene 收敛逻辑保持一致，播放页据此走「先用嵌套数据开播 + 随后补拉分支」。
 *
 * TODO: 待后端接入，当前为演示用 Mock —— 接入后本文件可整体删除。
 */
import { silentAudioUrlForText } from './silentAudio'
import type { PlayEdge, PlayScene } from '@/types/studio'

/** 演示图里的一个节点：台词 + 说话人 + 后续分支 */
interface DemoSceneNode {
  readonly text: string
  readonly speaker: string
  /** 分支目标一律使用图内的固定 id，保证后续补拉分支时仍能命中同一张图 */
  readonly next: readonly { readonly action: string; readonly sceneId: string }[]
}

/** 入口场景 id：请求未知 id 时用它的内容兜底 */
export const DEMO_ENTRY_SCENE_ID = 'SCENE_DEMO_001'

/**
 * 一张 4 个节点的小剧情图，含 1 个二选一分支与 1 个回环，
 * 用来演示「点击分支切换场景」「队列续播」「回环剧情」。
 */
const DEMO_NODES: Readonly<Record<string, DemoSceneNode>> = {
  SCENE_DEMO_001: {
    text: '午夜零点，电台的信号忽然被一段陌生的频率打断。电流声里，有人在慢慢念一串坐标。',
    speaker: '旁白',
    next: [
      { action: '把这段频率记下来', sceneId: 'SCENE_DEMO_002' },
      { action: '切回原来的节目', sceneId: 'SCENE_DEMO_003' },
    ],
  },
  SCENE_DEMO_002: {
    text: '小林把那段频率抄在便签上。纸条边缘已经卷了，字迹却比平时用力得多。',
    speaker: '小林',
    next: [{ action: '试着回应这段频率', sceneId: 'SCENE_DEMO_004' }],
  },
  SCENE_DEMO_003: {
    text: '音乐重新填满直播间。可那串坐标一直在脑子里回响，像另一路没关掉的信号。',
    speaker: '旁白',
    next: [{ action: '还是把那段频率找回来', sceneId: 'SCENE_DEMO_002' }],
  },
  SCENE_DEMO_004: {
    text: '「这里是午夜频道。」她对着话筒说。三秒之后，那边回了同样的一句话。',
    speaker: '小林',
    next: [],
  },
}

/** 构造一条分支：嵌套层的 edges 按契约清空 */
function buildEdge(action: string, sceneId: string, depth: number): PlayEdge {
  return {
    action,
    condition: 'NONE',
    targetScene: buildDemoScene(sceneId, depth + 1),
  }
}

/**
 * 取演示图里的一个场景。
 * @param sceneId 请求的场景 id（未知 id 会沿用入口内容但保留该 id）
 * @param depth   递归深度：> 0 表示这是嵌套的 targetScene，按契约清空 edges
 */
export function buildDemoScene(sceneId: string, depth = 0): PlayScene {
  const known: DemoSceneNode | undefined = DEMO_NODES[sceneId]
  const node = known ?? DEMO_NODES[DEMO_ENTRY_SCENE_ID]

  return {
    sceneId,
    text: node.text,
    speaker: node.speaker,
    // 静音占位音频：让真实的 <audio> 有音源，currentTime 才能驱动进度与字幕
    audioUrl: silentAudioUrlForText(node.text),
    edges: depth === 0 ? node.next.map((item) => buildEdge(item.action, item.sceneId, depth)) : [],
  }
}
