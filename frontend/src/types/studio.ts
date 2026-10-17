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
 * 命名注意（三处容易改错）：
 *   1. `PropertyType` 取值是契约定死的大写常量：CHARACTER / RULE / ENTITY；
 *   2. `InterpolateRequest` 的字段名以后端 StepRequest 的 @JsonProperty 为准：
 *      `mustBeSceneId`（小写开头驼峰）与 `isStatic`；
 *   3. `SceneAnchor.timeStage` 是**数字**坐标：越小越靠前，相同即并列。
 *
 * 后端**没有**的接口（本项目后端只实现了 properties / voices / plan 三域，
 * 见 README「八、待接入后端接口」），前端这部分继续由 Mock 提供：
 *   - PUT / DELETE `/properties/{nodeId}`；
 *   - POST `/plan/export-segment`；
 *   - GET `/play/scene/{sceneId}`；
 *   - POST `/welcome/enter`、`/welcome/tutorial`。
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
  /** 创建结果标记，不是生命周期状态 */
  status: 'CREATED'
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
 * 契约原文是「一个干净的 JSON 数组」，元素只有 `{ nodeId, name, type }` ——
 * **没有 description / attributes / status**，且契约里没有 `GET /properties/{nodeId}` 详情接口。
 */
export interface PropertyListItem {
  nodeId: string
  name: string
  type: PropertyType
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
  /** null = 列表接口未返回状态 */
  status: PropertyStatus | null
}

/* =============================================================
 * 配音（全篇唯一，与资源无关）
 * ============================================================= */

/**
 * 全篇配音配置。
 * 系统里**只有这一条**：用户配的是「讲播客的这个人」的音色，故事内角色由 agent 控制，
 * 所以这里没有 characterId —— 配音域与 properties 域完全无关。
 */
export interface VoiceConfig {
  /** 音色名称 */
  voiceName: string
  /** 风格提示词 */
  promptStyle: string
  /** 音高（半音偏移，允许负数） */
  pitch: number
  /** 语速倍率（必须大于 0） */
  rate: number
}

/**
 * GET /api/v1/voices 与 POST /api/v1/voices 的 data。
 * 未配置时接口同样返回 200 + 默认值，此时 `configured = false` ——
 * 用来区分「用户配过」与「这是后端默认值」，不把默认音色说成用户的选择。
 */
export interface VoiceConfigData extends VoiceConfig {
  configured: boolean
}

/* =============================================================
 * 剧情锚点（时间线事件）
 * ============================================================= */

/** 剧情锚点：时间线上的一个关键事件 */
export interface SceneAnchor {
  /** 场景唯一标识 */
  sceneId: string
  /** 场景文本 */
  text: string
  /** 说话人（通常对应某个角色节点的名称或 id，旁白场景为「旁白」） */
  speaker: string
  /**
   * 时间阶段坐标（**数字**，契约示例 `99`）。
   * 语义由契约定死：**数字越小代表时间越靠前；数字相同代表在时间线上绝对并列**
   * （用于并排渲染并列结局 / 同一时间线的不同视点）。
   * 不要改成字符串，也不要用「第一幕」这类文案 —— 排序与并排判断都依赖数值比较。
   */
  timeStage: number
}

/**
 * POST /api/v1/plan/anchors 的请求体：前端按「一次提交整个锚点数组」实现，不额外包一层。
 * ⚠️ 契约未明确：文档 3.1 给出的是两个并列的锚点对象（//这是A、//这是B），
 *    没有说明接口收单对象还是数组。若后端实际是「一次一个锚点」，
 *    改动只在本类型与 services/studio.ts 的 saveSceneAnchors。
 */
export type SceneAnchorsRequest = readonly SceneAnchor[]

/** POST /api/v1/plan/anchors 的 data：保存后的锚点列表 */
export type SceneAnchorListData = SceneAnchor[]

/**
 * 锚点编辑补丁。
 * sceneId 是锚点的身份（也是后端引用场景的键），不通过补丁修改 —— 改 id 等于换一个节点。
 */
export type SceneAnchorPatch = Partial<Omit<SceneAnchor, 'sceneId'>>

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
   * ⚠️ 字段名以后端 StepRequest 的 `@JsonProperty("mustBeSceneId")` 为准（全小写开头的驼峰），
   *    写成 `MustBeSceneId` 后端收不到值，会直接以「起点或终点场景不存在」返回 404。
   */
  mustBeSceneId: string
  /**
   * 后端语义：`isStatic = true` 表示**静态场景收束** —— 直接把起点连到必经点，
   * **不做**任何 AIGC 扩写（此时 layer 无效）。
   */
  isStatic: boolean
  /** 剧情大纲 */
  outline: string
  /** 生成层级（字段名是 layer，没有 s）；`isStatic: true` 时无效 */
  layer: number
  /** 单次生成的动作数上限 */
  maxActions: number
}

/**
 * POST /api/v1/plan/interpolate 的 data。
 * ⚠️ 待后端确认：这里只约定前端目前依赖的最小形状（补全出的场景列表）。
 */
export interface InterpolateResultData {
  /** 插值补全得到的场景列表 */
  scenes: SceneAnchor[]
}

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
  /** 片段下载地址（相对或绝对均可） */
  url: string
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
