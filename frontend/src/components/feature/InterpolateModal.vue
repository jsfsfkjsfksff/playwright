<script setup lang="ts">
/**
 * InterpolateModal —— 一键生成（AI 插值）参数弹窗
 * ---------------------------------------------------------------
 * 请求体严格对应后端 StepRequest（`mid` 的 PEngineController）：
 *   `{ startSceneId, mustBeSceneId, isStatic, outline, layer, maxActions, mandatorySceneIds? }`
 *   注意键名是**小驼峰** `mustBeSceneId` / `isStatic`（后端靠 @JsonProperty 映射），
 *   写成 `MustBeSceneId` / `static` 后端会静默收到 null（终点为 null → 404）。
 *
 * 【起点 / 必经点不由用户选择】
 *   界面上只保留创作者真正要决策的参数（大纲、静态扩写、层级、动作数上限）。
 *   `startSceneId` / `mustBeSceneId` / `mandatorySceneIds` 在**提交时按画布数据自动推导**：
 *     · startSceneId    ← `edges[0].sourceId`（第一条连线的起点）
 *     · mustBeSceneId   ← `edges[edges.length - 1].targetId`（最后一条连线的终点）
 *     · mandatorySceneIds ← 画布上**真正连起来的那条链**里夹在首尾之间的节点
 *   画布还没连线（`edges` 为空）时退化为时间线首尾锚点：
 *     `anchors[0].sceneId` / `anchors[anchors.length - 1].sceneId`，
 *     且**不产生任何必经点** —— 没连线就没有「中间节点」的依据。
 *   推导只做取值、不做排序：线段之间的先后关系仍由后端判断。
 *
 * ⚠️ 必经点必须来自「连线」，不能取「时间线上所有中间锚点」：
 *   时间线里可能存在**没接进这条链**的孤立锚点（比如另外新建、还放在同一阶段的卡片）。
 *   把孤立锚点也当必经点发出去，后端会把它们硬塞进剧情，表现为
 *   「我只连了 3 个场景，另一个没连的也被生成了」。因此这里按连线找路径，
 *   路径之外的锚点一律不发；没有连线或找不到完整路径时，必经点就是空的。
 *
 * ⚠️ mandatorySceneIds 不能省：
 *   后端（PEngineController.interpolateNodesNewMulti）会把它拼成 mandatoryNodesPayload
 *   交给 HTN 引擎当「必经节点」。不传的话，处在起点与终点之间的锚点会被完全忽略，
 *   表现为「画布上连了 3 个场景，生成的剧情里只有首尾起作用」。
 *
 * ⚠️ 关于「加载进度」：
 *   契约里**没有进度接口** —— 文档只说「返回 200 状态码，表示图谱已成功裂变并缝合」，
 *   即一次请求一次响应。因此这里不编造百分比或阶段完成度，
 *   只展示「已提交、等待后端返回」的流水线示意，并明确写出它不代表真实进度。
 *
 * ⚠️ 数值范围：契约给了示例（layer 2 / maxActions 3）但没规定上下界，
 *   这里只校验「是 ≥ 1 的整数」，确认后改下方 MIN_INTEGER 一处即可。
 */
import { computed, ref, useId } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type {
  InterpolateRequest,
  SceneAnchor,
  StoryEdge,
  TransitionWireItem,
} from '@/types/studio'

/** 后端流水线的三个阶段：仅用于「等待中」的示意，不代表真实进度 */
const PIPELINE_STAGES = ['HTN 计算', 'Agent 渲染', 'TTS 合成'] as const

/** 数值下限（⚠️ 契约未规定范围，暂按「至少 1」校验） */
const MIN_INTEGER = 1

const props = withDefaults(
  defineProps<{
    /** 当前锚点，**按时间顺序**传入：没有连线时用它推导起点（第一个）与必经点（最后一个） */
    anchors: readonly SceneAnchor[]
    /** 画布连线：起点取第一条连线的 sourceId，必经点取最后一条连线的 targetId */
    edges: readonly StoryEdge[]
    /** 生成请求进行中 */
    generating?: boolean
    /** 上层带下来的失败原因（通常来自 store.lastError） */
    error?: string | null
  }>(),
  { generating: false, error: null },
)

const emit = defineEmits<{
  submit: [payload: InterpolateRequest]
  close: []
}>()

const formId = useId()

const outline = ref('')
const isStatic = ref(false)

/**
 * ⚠️ 数字框的值域是 `string | number`：Vue 会给 `<input type="number">` 的 v-model
 * 打开「自动转数字」，但清空时又是字符串 ''，两者混在一起会塞进非数字。
 * 这里同样显式解析（见 AnchorCard 的同类说明）。
 */
const layer = ref<string | number>(2)
const maxActions = ref<string | number>(3)

const formError = ref<string | null>(null)

/** 失败原因优先显示上层带下来的（网络 / 业务错误） */
const displayError = computed(() => formError.value ?? props.error)

/**
 * 在画布连线上找一条从 start 到 end 的有向路径（深度优先，返回第一条走得通的）。
 * 返回值包含起点与终点；走不通返回 null。
 * 用 visited 防环：画布允许反向连线，剧情图可能有环。
 */
function findConnectedPath(
  startSceneId: string,
  endSceneId: string,
  edges: readonly StoryEdge[],
): string[] | null {
  if (startSceneId === '' || endSceneId === '' || startSceneId === endSceneId) {
    return null
  }

  //？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？
  // sourceId → targetId[]；同一方向重复连线在画布上已被拒绝，这里再兜一次
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceId)
    if (targets === undefined) {
      outgoing.set(edge.sourceId, [edge.targetId])
    } else if (!targets.includes(edge.targetId)) {
      targets.push(edge.targetId)
    }
  }

  const visited = new Set<string>([startSceneId])
  const path: string[] = [startSceneId]

  function walk(current: string): boolean {
    if (current === endSceneId) {
      return true
    }

    for (const next of outgoing.get(current) ?? []) {
      if (visited.has(next)) {
        continue
      }

      visited.add(next)
      path.push(next)

      if (walk(next)) {
        return true
      }

      path.pop()
    }

    return false
  }

  return walk(startSceneId) ? path : null
}

/**
 * 推导插值区间与必经点（界面上已没有对应输入框）。
 * 起点 = 第一条连线的 sourceId，终点 = 最后一条连线的 targetId；
 * 一条线都没连（edges 为空）时用时间线首锚点 / 末锚点兜底。
 *
 * 必经点**只取「连线路径」上的中间节点**：
 *   没连进这条链的孤立锚点不发，否则后端会把它们硬塞进剧情。
 *   没有连线、或连线走不出一条完整路径时，必经点为空 —— 默认就只有首尾两个节点。
 */
function deriveInterval(): {
  startSceneId: string
  mustBeSceneId: string
  mandatorySceneIds: string[]
  path: string[] | null
} {
  const firstEdge = props.edges[0]
  const lastEdge = props.edges[props.edges.length - 1]

  const startSceneId = firstEdge?.sourceId ?? props.anchors[0]?.sceneId ?? ''
  const mustBeSceneId = lastEdge?.targetId ?? props.anchors[props.anchors.length - 1]?.sceneId ?? ''

  const path = findConnectedPath(startSceneId, mustBeSceneId, props.edges)

  return {
    startSceneId,
    mustBeSceneId,
    path,
    // 没有连线（或连不成一条从起点到终点的路径）时，中间节点无依据可循
    mandatorySceneIds: path === null ? [] : path.slice(1, -1),
  }
}

/** 固定分支标记：与后端 `Transition.action` 的约定完全一致 */
const USER_FIXED_MARKER = '[[USER_FIXED]]'

/**
 * 把画布上的**双向对称边**收敛成一条带 `[[USER_FIXED]]` 的单向边。
 *
 * 规则：
 *   1. 画布上同时存在 A→B 与 B→A，才说明用户手动固定了这段剧情；
 *      单向不对称边是「必然节点」的表达，不在这里处理（走 mandatorySceneIds）。
 *   2. 一对双向边只发**一条**，绝不把双向原样传后端。
 *   3. 方向优先跟随主线路径（path 里相邻的那一对），路径覆盖不到时按字典序
 *      固定一个方向 —— 双向本身没有方向偏好。
 */
function deriveFixedTransitions(path: readonly string[] | null): TransitionWireItem[] {
  const directed = new Set(props.edges.map((edge) => `${edge.sourceId}\u0000${edge.targetId}`))
  const pathOrder = new Map((path ?? []).map((sceneId, index) => [sceneId, index]))
  const emitted = new Set<string>()
  const transitions: TransitionWireItem[] = []

  for (const edge of props.edges) {
    // 只有「反向也存在」的边才是固定分支
    if (!directed.has(`${edge.targetId}\u0000${edge.sourceId}`)) {
      continue
    }

    const pairKey = [edge.sourceId, edge.targetId].sort().join('\u0000')
    if (emitted.has(pairKey)) {
      continue
    }
    emitted.add(pairKey)

    const sourceIndex = pathOrder.get(edge.sourceId)
    const targetIndex = pathOrder.get(edge.targetId)
    const followsPath =
      sourceIndex !== undefined &&
      targetIndex !== undefined &&
      Math.abs(sourceIndex - targetIndex) === 1

    const forward = followsPath ? sourceIndex < targetIndex : edge.sourceId <= edge.targetId

    transitions.push({
      fromSceneId: forward ? edge.sourceId : edge.targetId,
      toSceneId: forward ? edge.targetId : edge.sourceId,
      action: `${USER_FIXED_MARKER} ${edge.action?.trim() || '继续'}`,
    })
  }

  return transitions
}

/** 解析「≥ MIN_INTEGER 的整数」 */
function parseInteger(value: string | number, label: string): number | null {
  const parsed = typeof value === 'number' ? value : Number(value.trim())

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < MIN_INTEGER) {
    formError.value = `${label}要填一个不小于 ${MIN_INTEGER} 的整数`
    return null
  }

  return parsed
}

function handleIntegerInput(target: 'layer' | 'maxActions', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (target === 'layer') {
    layer.value = value
  } else {
    maxActions.value = value
  }
}

function handleSubmit(): void {
  formError.value = null

  // 端点与必经点由画布推导，用户在界面上无从输入；只有画布连兜底数据都没有时才会是空串
  const { startSceneId, mustBeSceneId, mandatorySceneIds, path } = deriveInterval()

  if (startSceneId === '' || mustBeSceneId === '') {
    formError.value = '画布上还没有可用的起点与终点：请先添加锚点或连线'
    return
  }

  if (outline.value.trim() === '') {
    formError.value = '请填写剧情大纲：这是 AI 插值的输入'
    return
  }

  const parsedLayer = parseInteger(layer.value, '生成层级')
  if (parsedLayer === null) {
    return
  }

  const parsedMaxActions = parseInteger(maxActions.value, '动作数上限')
  if (parsedMaxActions === null) {
    return
  }

  emit('submit', {
    startSceneId,
    // 键名是小驼峰 mustBeSceneId —— 对应后端 StepRequest 的 @JsonProperty("mustBeSceneId")
    mustBeSceneId,
    isStatic: isStatic.value,
    outline: outline.value.trim(),
    layer: parsedLayer,
    maxActions: parsedMaxActions,
    // 恒传（可能为空数组）：后端的判空是 `!= null && !isEmpty()`，空数组与不传等价。
    // 恒传的好处是 [前端请求体] 日志里永远能看到这个字段，不会再出现「到底发了没」的疑惑。
    mandatorySceneIds,
    // 双向对称连线 → 单向 [[USER_FIXED]] 固定分支；双向本身不传后端
    transitions: deriveFixedTransitions(path),
  })
}

/** 生成过程中不允许关闭：请求还在飞，关掉会让用户以为已经取消 */
function handleClose(): void {
  if (!props.generating) {
    emit('close')
  }
}
</script>

<template>
  <BaseModal title="一键生成（插值补全）" @close="handleClose">
    <form :id="formId" class="nw-interpolate" @submit.prevent="handleSubmit">
      <!-- 等待后端返回：只有「已提交」这一个已知事实，不编造阶段进度 -->
      <div v-if="generating" class="nw-interpolate__progress" role="status">
        <p class="nw-interpolate__progress-title">已提交，正在等待后端算完</p>
        <ol class="nw-interpolate__pipeline">
          <li v-for="stage in PIPELINE_STAGES" :key="stage" class="nw-interpolate__stage">
            {{ stage }}
          </li>
        </ol>
        <p class="nw-interpolate__note">
          契约没有进度接口：后端把 HTN 演算、剧情渲染与语音合成都做完后一次性返回结果，
          因此上面的三个阶段只是等待示意，不代表真实进度。
        </p>
      </div>

      <template v-else>
        <p v-if="displayError" class="nw-interpolate__error" role="alert">{{ displayError }}</p>

        <!-- 大纲与 static 同属「内容意图」，归为一组，间距比组与组之间更紧 -->
        <div class="nw-interpolate__block">
          <label class="nw-interpolate__field">
            <span class="nw-interpolate__label">剧情大纲 outline</span>
            <textarea
              v-model="outline"
              class="nw-interpolate__input nw-interpolate__input--area"
              rows="3"
              placeholder="例如：男主试图强行冲卡但失败"
            />
          </label>
        </div>

        <div class="nw-interpolate__numbers">
          <label class="nw-interpolate__field">
            <span class="nw-interpolate__label">生成层级 layer</span>
            <input
              class="nw-interpolate__input"
              type="number"
              step="1"
              :min="MIN_INTEGER"
              :disabled="isStatic"
              :value="layer"
              @input="handleIntegerInput('layer', $event)"
            />
          </label>

          <label class="nw-interpolate__field">
            <span class="nw-interpolate__label">动作数上限 maxActions</span>
            <input
              class="nw-interpolate__input"
              type="number"
              step="1"
              :min="MIN_INTEGER"
              :value="maxActions"
              @input="handleIntegerInput('maxActions', $event)"
            />
          </label>
        </div>
      </template>
    </form>

    <template #footer>
      <AppButton
        size="md"
        variant="secondary"
        :disabled="generating"
        @click="emit('close')"
      >
        {{ generating ? '生成中…' : '取消' }}
      </AppButton>

      <AppButton
        :form="formId"
        native-type="submit"
        size="md"
        variant="primary"
        :loading="generating"
        loading-label="生成中…"
      >
        开始生成
      </AppButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.nw-interpolate {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
}

/* 大纲 + static 同属「内容意图」：组内间距比组与组之间更紧 */
.nw-interpolate__block {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-interpolate__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2xs);
}

.nw-interpolate__label {
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
}

.nw-interpolate__input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: var(--nw-border-width) solid var(--nw-color-border);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-button-fill-secondary);
  color: var(--nw-color-text-primary);
  font-family: inherit;
  font-size: var(--nw-font-size-sm);
  transition: var(--nw-transition-colors);
}

.nw-interpolate__input::placeholder {
  color: var(--nw-color-text-disabled);
}

.nw-interpolate__input:focus-visible {
  outline: none;
  border-color: var(--nw-color-focus);
  box-shadow: 0 0 0 3px var(--nw-color-accent-hover);
}

.nw-interpolate__input:disabled {
  color: var(--nw-color-text-disabled);
  cursor: not-allowed;
}

.nw-interpolate__input--area {
  min-height: 4rem;
  line-height: var(--nw-line-height-normal);
  resize: vertical;
}

.nw-interpolate__numbers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--nw-space-xs);
}

.nw-interpolate__note {
  color: var(--nw-color-text-tertiary);
  font-size: var(--nw-font-size-sm);
  line-height: var(--nw-line-height-normal);
}

.nw-interpolate__error {
  padding: var(--nw-space-2xs) var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-error);
  border-radius: var(--nw-radius-xs);
  background-color: var(--nw-color-error-soft);
  color: var(--nw-color-error);
  font-size: var(--nw-font-size-sm);
}

/* ---------- 等待后端返回 ---------- */
.nw-interpolate__progress {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-xs);
  padding: var(--nw-space-xs);
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-sm);
  background-color: var(--nw-color-glass-highlight);
}

.nw-interpolate__progress-title {
  color: var(--nw-color-text-primary);
  font-size: var(--nw-font-size-md);
}

.nw-interpolate__pipeline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nw-interpolate__stage {
  padding: 4px 12px;
  border: var(--nw-border-width) solid var(--nw-color-glass-edge);
  border-radius: var(--nw-radius-pill);
  color: var(--nw-color-text-secondary);
  font-size: var(--nw-font-size-sm);
  letter-spacing: var(--nw-letter-spacing-wide);
  animation: nw-interpolate-pulse 1.6s var(--nw-ease-in-out) infinite;
}

.nw-interpolate__stage:nth-child(2) {
  animation-delay: 0.2s;
}

.nw-interpolate__stage:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes nw-interpolate-pulse {
  0%,
  100% {
    border-color: var(--nw-color-glass-edge);
    color: var(--nw-color-text-secondary);
  }

  50% {
    border-color: var(--nw-color-accent);
    color: var(--nw-color-text-primary);
  }
}

@media (max-width: 640px) {
  .nw-interpolate__numbers {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nw-interpolate__stage {
    animation: none;
  }

  .nw-interpolate__input {
    transition: none;
  }
}
</style>
