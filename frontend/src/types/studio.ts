/**
 * 创作台类型定义（前端契约）
 * ---------------------------------------------------------------
 * 契约来源：《交互式播客引擎 API 接口文档 (v1.0 严格对齐版)》，基础路径 /api/v1。
 * 本文档里的字段名、大小写、类型一律以该契约原文为准，不按「惯例」改写。
 *
 * 响应信封：创作台所有接口统一为 `{ code, data }`（见 types/api.ts 的 CodeEnvelope），
 * 契约里的成功码是 **200**（见 services/api.ts 的 API_SUCCESS_CODE）；
 * 因此本文件里的各个 `...Data` 类型描述的都是 **信封里的 data 部分**，
 * 信封本身由 services/api.ts 的 requestCodeJson 负责解包。
 *
 * 命名注意（四处容易改错）：
 *   1. `PropertyType` 取值是契约定死的大写常量：CHARACTER / RULE / ENTITY；
 *   2. `InterpolateRequest.mustBeSceneId` 的 JSON 键名是**小驼峰**（后端 @JsonProperty 映射）；
 *   3. `InterpolateRequest.isStatic` 是**布尔**标志（aigc 是否扩写），键名不是 `static`；
 *   4. `SceneAnchor.timeStage` 是**数字**坐标：越小越靠前，相同即并列。
 *
 * 与后端（`mid`）实际实现核对后的结论（⚠️ 处均已按真实代码修正）：
 *   - POST `/plan/anchors` 收**场景数组**（`List<Scene>`），不是 `{ nodes, edges }` 双 List；
 *   - POST `/plan/interpolate` 的 data 是**数字**（起点场景的 Neo4j id），不是 `{ scenes: [...] }`；
 *   - GET `/voices` **没有** characterId 路径参数（全篇唯一配置），未配置时返回默认值而非 404；
 *   - PUT `/properties/{nodeId}` 后端**未实现**（Spring 对未映射的方法回 405）。
 */

/* =============================================================
 * 资源：角色 / 规则 / 实体
 * ============================================================= */

/** 资源节点类型（后端定死的大写常量） */
export type PropertyType = 'CHARACTER' | 'RULE' | 'ENTITY'

/**
 * 资源节点状态。
 * 契约（接口文档 v1.0）只确认了 `CREATED` —— POST /properties 的创建回执里的取值；
 * `ACTIVE` / `INACTIVE` / `DRAFT` 是前端为本地草稿预留的取值，尚未出现在契约中，
 * 后端补上之前不要假设它们存在。卡片上的标签映射对未知取值会原样回退显示。
 */
export type PropertyStatus = 'CREATED' | 'ACTIVE' | 'INACTIVE' | 'DRAFT'

/**
 * 属性值：允许布尔 / 数字 / 字符串，例如 `{ isHostile: false }`。
 * 按约定保持宽松（等价于 `Record<string, any>`）—— 后端也可能回传嵌套结构，
 * 这里不把类型收窄，避免前端联合类型与真实响应不一致。
 * 将来若要收紧为 `boolean | number | string`，只改这一行别名即可。
 */
export type PropertyAttributeValue = any

/** 资源节点的自由属性表 */
export type PropertyAttributes = Record<string, PropertyAttributeValue>

/** 提交给后端的资源数据（不含 nodeId —— 由后端生成） */
export interface PropertyCreatePayload {
  type: PropertyType
  name: string
  description: string
  attributes: PropertyAttributes
}

/**
 * POST /api/v1/properties 的 data。
 * 契约原文：`{ "nodeId": "PROP_1001", "status": "CREATED" }`
 * —— 后端**不回传**完整节点，因此前端必须自己把提交内容与回执拼成视图模型
 * （见 stores/studio.ts 的 fromCreateResult），不能把返回值直接当卡片数据用。
 */
export interface PropertyCreateResult {
  nodeId: string
  /**
   * 创建结果标记，不是生命周期状态。
   *
   * ⚠️ 与后端实际回执对齐：`PropertyController.savePropertyWithRelations` 恒回
   *    `"SAVED_WITH_NATIVE_RELATIONS"`（契约示例里的 `"CREATED"` 已过期），
   *    因此放宽成 `string`；未知取值由 propertyStatusLabel 原样回退显示。
   */
  status: string
}

/**
 * 更新资源时提交的数据。
 * nodeId 走路径参数（`PUT /api/v1/properties/{nodeId}`），不放在请求体里。
 * ⚠️ 契约未定义改 / 删接口，PUT 的路径与回执形状是前端按 REST 惯例假定的，待后端补。
 */
export type PropertyUpdatePayload = PropertyCreatePayload

/**
 * PUT /api/v1/properties/{nodeId} 的 data。
 * ⚠️ 契约未定义，这里假定与 POST 的回执同形（`{ nodeId, status }`），待后端确认。
 */
export type PropertyUpdateResult = PropertyCreateResult

/**
 * GET /api/v1/properties 的 data 元素。
 * 契约原文是「一个干净的 JSON 数组」，元素只有 `{ nodeId, name, type }`。
 *
 * ⚠️ 与后端实际实现对齐（`PropertyListItemDto`）：列表项**已扩展**出
 *    `description` / `attributes` 两个可选字段 —— 否则刷新后卡片拿不到它们，
 *    只能显示「列表接口未返回描述」，用户会误以为编辑没保存。
 *    仍标可选，是为了兼容演示模式与尚未升级的后端（缺字段时视图层照旧显示
 *    「后端没给这个字段」，而不是谎称「内容为空」）。
 *    依旧**没有** status（那是写接口回执里的创建标记，不属于列表），
 *    也依旧没有 `GET /properties/{nodeId}` 详情接口。
 */
export interface PropertyListItem {
  nodeId: string
  name: string
  type: PropertyType
  /** 缺失 / null = 后端没给该字段 */
  description?: string | null
  /** 缺失 / null = 后端没给该字段；`{}` = 后端给了，确实是空的 */
  attributes?: PropertyAttributes | null
}

/** GET /api/v1/properties 的 data：资源节点轻量列表（不分页） */
export type PropertyListData = PropertyListItem[]

/**
 * 前端持有的资源视图模型（卡片渲染用）。
 *
 * ⚠️ 三个可空字段的语义（不要合并成默认值）：
 *   - `null` = **后端没给这个字段**（列表接口不回传，见 PropertyListItem）；
 *   - `''` / `{}` = 后端给了，且内容确实是空的。
 *   卡片据此分别显示「列表接口未返回描述」与「暂无描述」，不把「不知道」说成「没有」。
 */
export interface PropertyResponse {
  nodeId: string
  type: PropertyType
  name: string
  /** null = 列表接口未返回描述 */
  description: string | null
  /** null = 列表接口未返回属性表 */
  attributes: PropertyAttributes | null
  /**
   * null = 列表接口未返回状态。
   * ⚠️ 取值放宽为 `string`：后端 POST /properties 实际回 `SAVED_WITH_NATIVE_RELATIONS`，
   *    与 PropertyStatus 的预置取值不同；卡片对未知取值原样回退显示。
   */
  status: string | null
}

/* =============================================================
 * 配音
 * ============================================================= */

/** 角色配音配置（契约 2.1 `POST /api/v1/voices` 的请求体与回显） */
export interface VoiceConfig {
  /**
   * 关联的角色节点 id（对应 PropertyResponse.nodeId）。
   *
   * 播放页的音色选择用它提交「当前这一场由谁来说」：
   * 场景的 `speaker` 就是发音人，因此收听侧传 `PlayScene.speaker`
   * （通常为「旁白」，见 utils/studioVocabulary.ts 的 NARRATOR_SPEAKER）。
   *
   * ⚠️ 与后端实际实现对齐：后端配音域是**全篇唯一**的一条配置
   *    （`VoiceProfile` 没有 characterId 字段），该字段**不会被后端落库**，
   *    仅作前端本地缓存的键（voices 以它为键）与请求体的兼容字段。
   */
  characterId: string
  /** 音色名称 */
  voiceName: string
  /** 风格提示词 */
  promptStyle: string
  /** 音高 */
  pitch: number
  /** 语速 */
  rate: number
  /**
   * 音色标识（TTS 音色选择的落点）。
   *
   * 需求：播客内容统一为「旁白讲述」，音色由用户在**播放页**单选
   * （创作台侧的配音配置入口已移除，音色选择统一收在收听侧）。
   * 选中的标识提交给后端，由后端据此调用大模型 TTS（Qwen 语音 / Genie-TTS）。
   *
   * ⚠️ 契约（接口文档 2.1 POST /voices）里**没有** timbreId 字段 ——
   *    文档给的示例只有 characterId / voiceName / promptStyle / pitch / rate。
   *    这里按需求新增该字段并随请求体提交，**需后端确认落库字段名**
   *    （若后端定为 voiceType，改本类型与 TIMBRE_OPTIONS 的提交键即可，
   *      界面与 store 不受影响）。
   *    可选（`?`）是为了兼容「后端回显里没有这个字段」的情况：
   *    缺失时按 TIMBRE_OPTIONS 的默认项处理，不显示空白。
   */
  timbreId?: TimbreId
  /** 后端主键（`VoiceProfile.id`）。仅回显时存在；请求体里不提交 */
  id?: number | null
  /**
   * 用户是否真的配置过 —— 后端 `VoiceProfile.configured`。
   * 未配置时后端 `GET /voices` 仍返回 200 + 默认值（configured=false），
   * 前端据此区分「用户配过」与「这是后端默认值」。
   */
  configured?: boolean
}

/**
 * TTS 音色标识。
 *
 * 取值是前端与后端约定的稳定标识（不是展示文案），中文标签见
 * utils/studioVocabulary.ts 的 TIMBRE_LABELS —— 标签可以改，
 * 这些标识一旦提交给后端就不该再改，否则历史配音档案会对不上。
 */
export type TimbreId = 'male-magnetic' | 'female-gentle' | 'child' | 'narrator-calm' | 'elder-warm'

/** 一个音色选项（标识 + 展示用标签与说明） */
export interface TimbreOption {
  id: TimbreId
  /** 按钮上的短标签，例如「男声-磁性」 */
  label: string
  /** 一句话说明，用于 title / 辅助文本 */
  description: string
}

/**
 * 音色选项表（界面按这个顺序渲染成一排单选按钮）。
 *
 * 放在类型文件里而不是组件里：音色标识要提交给后端，属于契约的一部分，
 * 组件只负责渲染，不负责定义有哪些音色。
 */
export const TIMBRE_OPTIONS: readonly TimbreOption[] = [
  { id: 'male-magnetic', label: '男声-磁性', description: '低沉厚实，适合悬疑与深夜独白' },
  { id: 'female-gentle', label: '女声-温柔', description: '柔和清晰，适合叙事与抒情段落' },
  { id: 'child', label: '童声', description: '清亮稚嫩，适合童年回忆与轻松段落' },
  { id: 'narrator-calm', label: '旁白-沉稳', description: '中性平稳，适合纪实与说明性内容' },
  { id: 'elder-warm', label: '长者-温厚', description: '缓慢沙哑，适合回溯与讲古段落' },
]

/** 默认音色：新建配音配置时预选的那一项 */
export const DEFAULT_TIMBRE_ID: TimbreId = 'narrator-calm'

/** 取音色选项；标识缺失或后端给了未收录的取值时回退到默认项 */
export function resolveTimbreOption(id: TimbreId | undefined): TimbreOption {
  const fallback = TIMBRE_OPTIONS.find((option) => option.id === DEFAULT_TIMBRE_ID) ?? TIMBRE_OPTIONS[0]
  if (id === undefined) {
    return fallback
  }
  return TIMBRE_OPTIONS.find((option) => option.id === id) ?? fallback
}

/**
 * 把「听众在播放页选中的音色」组装成契约 2.1 `POST /api/v1/voices` 的请求体。
 *
 * 为什么由前端拼这几项（逐字段说明，避免后端对不上）：
 *   - `characterId`：用**当前场景的发音人**（`PlayScene.speaker`，通常为「旁白」）。
 *     契约里配音配置是「按角色」存的，而播客内容统一由旁白讲述，
 *     因此收听侧就是给这个发音人设音色。调用方拿不到 speaker 时传空串，
 *     由本函数回退到 NARRATOR_SPEAKER 的调用方约定（见 PlayerView）。
 *   - `voiceName`：契约示例是 `zh-CN-Yunxi-Neural` 这类**稳定标识**，
 *     因此这里提交音色标识本身（与 `timbreId` 同值），不提交中文标签
 *     —— 标签是展示文案，改了会与历史配音档案对不上。
 *   - `promptStyle`：用音色的一句话说明（例如「低沉厚实，适合悬疑与深夜独白」），
 *     它本来就是给 TTS 的风格提示词。
 *   - `pitch` / `rate`：中性默认值 1 / 1。播放页只有音色一个可调项，
 *     没有音高与语速控件，因此不假装用户调过（数值留中性）。
 *
 * ⚠️ 这套映射是前端按现有字段推出的，**需后端确认**：
 *    若后端要求 voiceName 必须是对应 TTS 引擎的真实发音人名（而不是我们的音色标识），
 *    或要求 characterId 必须是已存在的角色节点 id，则改本函数一处即可，
 *    播放页与 store 都不用动。
 */
export function buildTimbreVoiceConfig(
  timbreId: TimbreId,
  characterId: string,
  fallbackCharacterId: string,
): VoiceConfig {
  const option = resolveTimbreOption(timbreId)
  const speaker = characterId.trim()

  return {
    characterId: speaker === '' ? fallbackCharacterId : speaker,
    voiceName: option.id,
    promptStyle: option.description,
    pitch: 1,
    rate: 1,
    timbreId: option.id,
  }
}

/** POST /api/v1/voices 与 GET /api/v1/voices/{characterId} 的 data */
export type VoiceConfigData = VoiceConfig

/* =============================================================
 * 剧情锚点（时间线事件）
 * ============================================================= */

/** 剧情锚点：时间线上的一个关键事件 */
export interface SceneAnchor {
  /**
   * 场景唯一标识 —— 也就是卡片标题上**用户自己写的那个名字**。
   *
   * 需求：卡片标题不再是「展示名」，它直接就是提交给后端的 sceneId。
   * 用户在标题里写什么，`POST /plan/anchors` 与 `/plan/interpolate` 里就是什么。
   * **一经填写就不能再修改**：新建时用占位 id（SCENE_ANCHOR_xx），用户可以填一次，
   * 之后标题只读（见 AnchorCard 的 isPendingId 与 store.updateAnchor）。
   */
  sceneId: string
  /**
   * 卡片名称，恒等于 sceneId（兼容旧存档与画布数据管道）。
   * 界面只认 sceneId，不提供第二个可编辑的名字。
   */
  cardName: string
  /** 场景文本 */
  text: string
  /**
   * 说话人。
   *
   * ⚠️ 本轮需求「彻底移除说话人（Speaker）」—— 界面层已删除全部选择与展示
   *    （AnchorCard 的下拉、StoryNodeCard 的展示、播放页的元信息行都不再有它）。
   *    但**数据层保留该字段并恒为 NARRATOR_SPEAKER（'旁白'）**，原因是契约：
   *    接口文档 3.1 与 4.1 里 speaker 是后端 Scene 实体的字段（示例恒为「旁白」），
   *    前端若完全不提交，后端可能反序列化出 null。
   *    因此这里保留字段是**契约兼容处理**，不是需求遗漏 ——
   *    送出去的语义仍然是「旁白讲述」，只是不再让用户选。
   */
  speaker: string
  /**
   * 时间阶段坐标（**数字**，契约示例 `99`）。
   * 语义由契约定死：**数字越小代表时间越靠前；数字相同代表在时间线上绝对并列**
   * （用于并排渲染并列结局 / 同一时间线的不同视点）。
   * 不要改成字符串，也不要用「第一幕」这类文案 —— 排序与并排判断都依赖数值比较。
   */
  timeStage: number
  /**
   * 该场景的音频地址（类型为 string）。
   * 语义约定：
   *   - `''` = 还没有音频（新建锚点、尚未生成）；
   *   - 非空 = 可播放的地址（可能是后端返回的 CDN 地址，也可能是演示模式合成的静音 WAV）。
   * ⚠️ 字段名用 `audioURL`（大写 URL），与播放域的 `PlayScene.audioUrl` 拼写不同：
   *    前者是编排域（编辑态）字段，后者是契约原文的播放域字段，两者由
   *    services/studio.ts 的 readPlayScene 负责映射，不要互相改名。
   */
  audioURL: string
  /**
   * 画布坐标（px，相对画布左上角）。
   * 列表视图不消费；画布首次落位时补齐，拖拽后回写 —— 这就是提交给后端的 x / y。
   */
  x?: number
  y?: number
}

/**
 * POST /api/v1/plan/anchors 的请求体：前端按「一次提交整张图（点集 + 边集）」实现，
 * 见下面的 StoryGraphPayload。
 * ⚠️ 契约未明确：文档 3.1 给出的是两个并列的锚点对象（//这是A、//这是B），
 *    没有说明接口收单对象还是数组。若后端实际是「一次一个锚点」，
 *    改动只在本类型与 services/studio.ts 的 saveSceneAnchors。
 */
export type SceneAnchorsRequest = readonly SceneAnchor[]

/** POST /api/v1/plan/anchors 的 data：保存后的锚点列表 */
export type SceneAnchorListData = SceneAnchor[]

/**
 * POST /api/v1/plan/anchors 的请求体（**改版：扁平双 List**）。
 *
 * 规则（必须遵守，不是风格问题）：
 *   1. `nodes` 与 `edges` 是两条**互不嵌套**的独立数组 —— 严禁 `node.children`、
 *      严禁 `edge.nodes`、严禁任何树形结构；层级关系只靠 id 引用表达；
 *   2. 每个节点的字段是平的：唯一 id + 坐标 + 剧情文本 + 音频地址；
 *   3. 连线的两个端点只存 id（`sourceId` / `targetId`），不重复搬运节点数据。
 *
 * 这样后端拿到的是「一张图 = 点集 + 边集」，与编辑器里的画布一一对应，
 * 也便于后端直接入库（点表 / 边表各一张）。
 */
export interface StoryGraphPayload {
  /** 剧情节点（扁平，无子节点） */
  nodes: StoryNode[]
  /** 剧情连线（只存 id 引用） */
  edges: StoryEdge[]
}

/** 剧情节点：画布上的一个点（散点式，扁平结构） */
export interface StoryNode {
  /** 节点唯一 id（沿用 sceneId，后端引用场景也用它） */
  sceneId: string
  /**
   * 卡片名称，恒等于 sceneId（见 SceneAnchor.cardName 的说明）。
   * 画布节点标题直接显示它，因此画布上看到的名字就是会提交给后端的 id。
   */
  cardName: string
  /** 画布坐标 X（px，相对画布左上角） */
  x: number
  /** 画布坐标 Y（px，相对画布左上角） */
  y: number
  /** 剧情内容文本 */
  text: string
  /** 说话人（界面已不再提供选择，恒为「旁白」，见 SceneAnchor.speaker 的说明） */
  speaker: string
  /**
   * 音频地址。
   * ⚠️ 拼写是 `audioURL`（与编辑态 `SceneAnchor.audioURL` 一致），
   *    与播放域契约字段 `PlayScene.audioUrl` 有意区分，见 SceneAnchor 的说明。
   */
  audioURL: string
  /** 时间阶段（保留，便于后端按时间线排序；同值即并列） */
  timeStage: number
}

/**
 * 后端 `Scene` 实体在 `POST /api/v1/plan/anchors` 请求体里的线上形状。
 *
 * ⚠️ 与后端实际实现对齐：该接口的请求体是 `@RequestBody List<Scene>` —— 直接是场景数组，
 *    **不是** `{ nodes, edges }` 双 List；`Scene` 实体只有下面这 5 个字段，
 *    cardName / x / y / 连线在后端无对应字段（提交过去也会被忽略，不会入库）。
 *    字段名差异：这里是 `audioUrl`（后端 `Scene.audioUrl`），编辑态的 StoryNode 是 `audioURL`。
 */
export interface SceneWireItem {
  sceneId: string
  text: string
  speaker: string
  audioUrl: string
  timeStage: number
}

/** 剧情连线：两个节点的引用（不含节点数据） */
export interface StoryEdge {
  /** 连线唯一 id（前端生成，形如 `EDGE_xxx`） */
  id: string
  /** 起点节点 id */
  sourceId: string
  /** 终点节点 id */
  targetId: string
  /**
   * 连线动作名（可选）。
   * 第六代起，固定分支的标记 **不放在这里**：画布上「双向对称的一对边」
   * 才代表用户固定剧情，提交时由 InterpolateModal 收敛成带 `[[USER_FIXED]]`
   * 的单向 Transition（见 TransitionWireItem）。
   */
  action?: string
}

/**
 * 提交给后端的单向连线（对应后端 `Transition`）。
 *
 * ⚠️ 画布上的双向边对**不**原样传后端（双向只是画布交互的识别手段）：
 *    前端把一对双向边收敛成一条单向边，并在 action 里加 `[[USER_FIXED]]`。
 *    没有这个标记的单向边只是普通的 AI 候选路径。
 */
export interface TransitionWireItem {
  fromSceneId: string
  toSceneId: string
  /** 固定分支必须形如 `[[USER_FIXED]] 推门进去` */
  action: string
}

/**
 * 锚点编辑补丁。
 *
 * sceneId **只在「还没填写」时允许改一次**：新建锚点用的是占位 id（SCENE_ANCHOR_xx），
 * 用户可以把它改成自己的名字；一旦填写完成，store 会拒绝任何后续修改
 * （见 stores/studio.ts 的 updateAnchor）。改名会同步重写所有连线的端点引用。
 */
export type SceneAnchorPatch = Partial<SceneAnchor>

/**
 * 一个时间阶段的锚点集合（时间线按它分组渲染）。
 * 契约语义：`timeStage` 越小越靠前；**同一组内的锚点绝对并列**，
 * 因此界面必须把它们并排渲染，而不是排成先后顺序。
 */
export interface AnchorStageGroup {
  /** 该组的 timeStage 数值（分组后按升序排列） */
  timeStage: number
  anchors: SceneAnchor[]
}

/* =============================================================
 * 生成：插值与导出
 * ============================================================= */

/** POST /api/v1/plan/interpolate 的请求体（严格对应后端 StepRequest 类） */
export interface InterpolateRequest {
  /** 起始场景 id */
  startSceneId: string
  /**
   * 必须经过的场景 id。
   * ⚠️ 与后端 `StepRequest` 对齐：JSON 键名是小驼峰 `mustBeSceneId`
   *    （后端 `@JsonProperty("mustBeSceneId")` 映射到字段 `MustBeSceneId`）。
   *    写成 `MustBeSceneId` 后端会静默收到 null，进而 /plan/interpolate 回 404「起点或终点场景不存在」。
   */
  mustBeSceneId: string
  /**
   * aigc 是否扩写的标志（**布尔**，不是静态文本）。
   * ⚠️ 与后端 `StepRequest` 对齐：JSON 键名是 `isStatic`（**不是** `static`）。
   *    后端语义：为 true 时 `layer` **无效**，参数面板在该状态下把 layer 置灰并注明。
   */
  isStatic: boolean
  /** 剧情大纲 */
  outline: string
  /** 生成层级（字段名是 layer，没有 s）；`isStatic: true` 时无效 */
  layer: number
  /** 单次生成的动作数上限 */
  maxActions: number
  /**
   * 画布上的**单向**连线（固定分支已收敛成一条并带 `[[USER_FIXED]]`）。
   *
   * 后端 `StepRequest.transitions` → Java 透传给 Python 的
   * `InterpolateRequest.transitions` → `identify_fixed_segments` 识别固定剧情。
   * 双向边对不会出现在这里。
   */
  transitions?: TransitionWireItem[]
  /**
   * 有序的必经节点 sceneId 列表（后端 `StepRequest.mandatorySceneIds`）。
   *
   * 前端**恒传**（可能为空数组），取值是**画布连线上**夹在起点 / 终点之间的节点：
   * 见 InterpolateModal 的 deriveInterval。没连进这条链的孤立锚点不会出现在这里 ——
   * 否则后端会把它们也塞进生成的剧情。没画连线时它就是空数组（默认只有首尾两个节点）。
   * 后端判空是 `!= null && !isEmpty()`，空数组与不传等价。
   * 不传这个字段时，处在首尾之间的锚点会被后端完全忽略。
   */
  mandatorySceneIds?: string[]
}

/**
 * POST /api/v1/plan/interpolate 的 data。
 *
 * ⚠️ 与后端实际回执对齐：`PEngineController.interpolateNodesNewMulti` 回的是
 *    `startScene.getId()` —— 一个**数字**（起点场景的 Neo4j 内部 id），
 *    而不是 `{ scenes: [...] }`。契约文档未定义该字段，因此如实放宽成联合类型：
 *    - `number`：后端当前实现（拿不到新场景列表，调用方退回请求里的 startSceneId）；
 *    - `{ scenes?: SceneAnchor[] }`：后端将来若补场景列表也能直接用；
 *    - `null`：后端回 data=null。
 *    调用方必须先做形状判断再取值（见 StudioOperationsView.readGeneratedSceneIds）。
 */
export type InterpolateResultData =
  | number
  | { scenes?: SceneAnchor[] }
  | null

/** POST /api/v1/plan/export-segment 的请求体 */
export interface ExportSegmentRequest {
  /** 要导出的场景 id 列表，数组顺序即导出顺序 */
  sceneIds: string[]
}

/**
 * POST /api/v1/plan/export-segment 的 data。
 * ⚠️ 契约未定义返回体：只说后端把选中节点的 audioUrl 按顺序「组装返回」便于线性收听，
 *    并明确要求导出**不能**由前端直接截取后端返回的 list（成品由后端交付）。
 *    这里先按「一个可下载 / 可播放地址」假定，待后端给出真实结构后只改本类型。
 */
export interface ExportSegmentData {
  /** 片段地址（相对或绝对均可）；后端 `ExportSegmentResponse.url` */
  url: string
  /** 同 url，契约文档里的叫法（`ExportSegmentResponse.finalAudioUrl`） */
  finalAudioUrl?: string
  /** 成品文件名（`ExportSegmentResponse.filename`） */
  filename?: string
  /** 参与拼接的片段数（`ExportSegmentResponse.segments`） */
  segments?: number
  /** 成品时长（毫秒，`ExportSegmentResponse.durationMs`） */
  durationMs?: number
}

/* =============================================================
 * 消费播放域（Play）
 * -------------------------------------------------------------
 * 接口：GET /api/v1/play/scene/{sceneId}
 * 契约原文要点（文档 4.1 / 4.2，逐条对应到下面两个类型）：
 *   1. 返回结构严格对应后端 Scene 与 Transition 的实体嵌套；
 *   2. **分支列表字段名是 `edges`，不是 choices** —— 写错就拿不到分支；
 *   3. `edges[i].targetScene` 里已经带全了下一层的台词与音频地址，
 *      点击分支**无需再发请求**即可实现听觉上的「零延迟」衔接；
 *   4. 但后端序列化 targetScene 时标了 `@JsonIgnoreProperties("edges")`，
 *      所以**嵌套层的 `edges` 恒为空数组** —— 想拿到再下一层的分支必须再请求一次。
 *      播放页据此采用「先用嵌套数据即时开播 + 随后补拉该场景的分支」的策略。
 * ============================================================= */

/**
 * 逐句字幕时间轴。
 * ⚠️ 契约未定义：文档给出的场景对象里**没有**任何字幕时间戳，
 *    因此播放页默认按「句长比例」在音频总时长上估算（见 stores/player.ts），
 *    并在界面上明确标注这是估算。后端一旦补上该字段，字幕同步会自动改用真实时间轴。
 */
export interface PlaySubtitleCue {
  /** 这一句的文本 */
  text: string
  /** 相对音频起点的开始秒数 */
  start: number
  /** 相对音频起点的结束秒数 */
  end: number
}

/** 一个可播放的场景节点（对应后端 Scene 实体） */
export interface PlayScene {
  /** 后端主键（文档示例里与 sceneId 并存，可能缺省） */
  id?: string | number
  /** 场景业务 id，例如 SCENE_START_001 */
  sceneId: string
  /** 台词 / 场景文本 */
  text: string
  /** 发声人（旁白或角色名） */
  speaker: string
  /** 音频地址；缺失时页面如实提示「该场景没有音频」，不会假装能播 */
  audioUrl: string
  /** 后续分支选项；契约字段名是 edges */
  edges: PlayEdge[]
  /** 真实字幕时间轴（契约未定义，存在则优先使用） */
  subtitles?: PlaySubtitleCue[]
}

/** 一条分支（对应后端 Transition 实体） */
export interface PlayEdge {
  /** 选项文案，例如「向左走」 */
  action: string
  /** 触发条件，契约示例为 NONE */
  condition: string
  /** 目标场景；契约保证这里已带全下一层数据 */
  targetScene: PlayScene
}

/* =============================================================
 * AVG 互动小说：世界线（Worldline）与存读档（Save & Load）
 * -------------------------------------------------------------
 * 【世界线是什么】
 *   AVG 游戏里，一次通关走过的节点序列就是一条「世界线」。
 *   本项目的剧情图是「散点（nodes）+ 连线（edges）」：一个节点若有多条 edges
 *   指向不同的 targetScene，就是世界线的分岔点；听众选一条，这条线就定下来了。
 *
 * 【与播放队列（stores/player.ts 的 playlist）的分工】
 *   两者看起来都是「场景序列」，但语义不同，不要合并：
 *     · playlist    = 当前这一段音频的播放队列（含提前入队、可回退重听），
 *                     生命周期只在本页会话内，换分支时会被截断重建；
 *     · nodeHistory = 实际走过的世界线路径（只追加、不可回退），
 *                     是存档要持久化的东西，也是「我这一周目走的是哪条线」的答案。
 *   队列会因为「提前点开分支」而暂时比世界线长（目标已入队但还没听到），
 *   因此不能拿 queue 当世界线用。
 * ============================================================= */

/**
 * 世界线上的一步：走过的一个节点 + 当时做的选择。
 * 保留 step 序号是因为路径可能有回环（A→B→A），下标不能代表顺序。
 */
export interface WorldlineStep {
  /** 该步在路径里的序号（从 0 开始，只增不减） */
  step: number
  /** 走到这个节点时它的 sceneId */
  sceneId: string
  /** 该节点的卡片名称快照（存档时用于在存档列表里显示「你读到哪」） */
  cardName: string
  /** 从**上一个**节点走到这里时选的选项文案；起点为空串 */
  viaAction: string
  /** 进入该节点的时间戳（毫秒） */
  enteredAt: number
}

/**
 * 当前世界线状态（前端内存态，由 stores/worldline.ts 维护）。
 * 读档就是用它整体替换当前状态。
 */
export interface WorldlineState {
  /** 当前所在节点 id */
  currentNodeId: string
  /** 走过的节点路径（按顺序，含当前节点） */
  nodeHistory: WorldlineStep[]
}

/**
 * 一份存档。
 *
 * 需求要求至少包含：存档 ID、存档时间、当前所在节点 ID、当前世界线路径数组、
 * 音频播放进度（可选）—— 下面逐项对应，另加两个便于用户辨认的字段
 * （name / sceneText 快照）。
 */
export interface SaveData {
  /** 存档 ID（前端生成的唯一标识，形如 `SAVE_<时间戳>_<随机>`） */
  id: string
  /**
   * 存档名称。
   * 允许用户自己起名；留空时由界面回退成「节点名 · 时间」这类可辨认的文案，
   * 不会出现「无标题存档」这种看不出区别的条目。
   */
  name: string
  /** 存档时间（毫秒时间戳）。用数字而不是格式化字符串：排序与「多久之前」都要算 */
  savedAt: number
  /** 当前所在节点 ID（读档后从它恢复播放） */
  currentNodeId: string
  /**
   * 当前世界线路径数组（读档后据此恢复 nodeHistory）。
   * 存的是**深拷贝**，不是引用 —— 否则存档会跟着后续的剧情推进一起变。
   */
  nodeHistory: WorldlineStep[]
  /**
   * 音频播放进度（秒）。可选：需求原文即「（可选）」。
   * 读取时若为 undefined 或超过新音频时长，从 0 开始播（见 player.restoreFromSave）。
   */
  audioProgress?: number
  /**
   * 存档时的场景文本快照。
   * 纯展示用途（读档列表里让用户认出「存的是哪一段」）——
   * 因为契约没有「按 sceneId 批量查文本」的接口，只有真正读档拉取时才有文本。
   */
  sceneText?: string
  /** 存档时的卡片名称快照（同上，纯展示） */
  cardName?: string
}

/**
 * 存档存储格式（localStorage 里真正写下去的形状）。
 * 带 version 是为了将来改结构时能识别旧档并安全丢弃，而不是读出一堆 undefined。
 */
export interface SaveStorePayload {
  /** 结构版本号；不匹配时整批丢弃（见 services/saves.ts 的判定） */
  version: number
  saves: SaveData[]
}

