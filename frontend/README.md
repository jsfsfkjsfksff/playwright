# 夜间电台 · 前端（nightwave-radio）

播客电台 / 声音内容平台的前端工程。本仓库**只包含前端**：页面结构、视觉样式、通用 CSS、
可复用组件、主题架构、前端交互与响应式适配。

> 不包含后端服务、数据库、服务端接口实现与部署配置。需要后端支持的能力见
> [八、待接入后端接口](#八待接入后端接口)。

## 开发策略：夜间模式优先，日间模式预留

当前阶段**只开发夜间模式**。所有页面以统一的深蓝色夜间电台设计语言为基准；
日间模式**不制作视觉**，仅在架构、令牌与组件层面预留接入能力，详见
[第五节](#五主题架构夜间优先日间预留)。

---

## 一、技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Vue 3（`<script setup>` + TypeScript） | 组合式 API，类型严格模式 |
| 路由 | vue-router 4（HTML5 History） | 第二个页面起引入；页面按路由懒加载分包 |
| 构建 | Vite 8 | 开发态 HMR |
| 类型检查 | vue-tsc | `npm run type-check` |
| 样式 | 原生 CSS + 自定义属性 | 无预处理器；Naive UI 组件经令牌桥接回站内材质 |
| 依赖 | `vue`、`vue-router`、`@vue-flow/core`、`naive-ui` | devDeps：`vite`、`@vitejs/plugin-vue`、`typescript`、`vue-tsc` |

> **关于 `@vue-flow/core`（剧情画布）**：
> 只用于「剧情画布」一页（`components/feature/StoryCanvas.vue`），随该路由懒加载，
> 不进入首屏；它提供节点拖拽、贝塞尔连线与缩放平移，避免手写 SVG 坐标与命中测试。
> 引入理由与替代方案对比见 [第十节](#十设计取舍为什么这里引入了两个依赖)。

> **关于 `naive-ui`（本轮新增，用于存读档 / 分支选择等弹窗）**：
> 选型与取舍见 [第十节](#十设计取舍为什么这里引入了两个依赖)。要点：
> 只用它的**弹窗、单选、输入、按钮**这几类，且必须经 `styles/naive-theme.ts`
> 桥接成站内 `--nw-*` 令牌，视觉上不出现 Naive 的默认外观。
> 其它界面仍是原生 CSS + 内联 SVG 图标。

---

## 二、路由与页面

| 路径 | 路由名 | 页面 | 状态 |
| --- | --- | --- | --- |
| `/` | `home` | `pages/HomeView.vue` | 已开发（主界面，用 `home-backdrop.jpg`） |
| `/studio` | `studio` | `pages/StudioView.vue` | 已开发（创作台 · 选择故事） |
| `/studio/resources` | `studioResources` | `pages/StudioResourcesView.vue` | 已开发（资源管理） |
| `/studio/operations` | `studioOperations` | `pages/StudioOperationsView.vue` | 已开发（操作编辑 / 时间线） |
| `/player/:sceneId` | `player` | `pages/PlayerView.vue` | 已开发（消费播放页，带 `beforeEnter` 守卫） |
| `/player` | — | 重定向到 `/studio` | 缺少 sceneId 时回创作台 |
| `/resources` | `resources` | `pages/ResourcesView.vue` | 已开发（**故事库占位页**：明确写出「开发中」与返回入口，不是空白页） |
| `/create` | — | 重定向到 `/studio` | 兼容旧链接 |
| `/:pathMatch(.*)*` | — | 重定向到首页 | 含已删除的 `/welcome`、`/features` |

- 首页「开始新故事」→ 创作台（`/studio`），「我的故事库」→ `/resources`；
  「教程」「设置」两个入口暂无页面，只播报提示、不制造无效跳转。
- 创作台内：选择故事页 → 「资源添加」进 `/studio/resources`、「操作编辑」进 `/studio/operations`；
  选择故事页底部的 **「开始编排」**只是导航（进入 `/studio/operations`），
  真正的生成按钮「一键生成（插值）」在操作编辑页底部，成功后进入 `/player/{sceneId}` 播放。
  > 为什么改成这样：「一键生成」这个名字放在选择故事页名不副实 —— 点了只是跳页。
  > 而且它原先在不满足条件时置灰，但锚点恰恰要在操作编辑页里添加，
  > 等于用「锚点不足」把用户挡在加锚点的门外。现在入口不拦，就绪状态单独提示。
- **页面标题**：`router/index.ts` 的 `afterEach` 把 `meta.title` 写进 `document.title`，
  格式为 `夜间电台 · <页面名>`；`meta.title` 的类型在 `routes.ts` 里通过 `RouteMeta` 扩展声明。
- **播放页路由守卫**：`sceneId` 是这一页的唯一入口参数，空值（`/player/`、`/player/%20`）
  由路由记录的 `beforeEnter` 拦下并重定向回 `/studio`；完全没有参数的 `/player` 也重定向到
  `/studio`，不会落到通配路由回首页。
- 除首页外，所有页面共用同一个背景图组件 `components/base/PageBackdrop.vue`。
- 路径字符串统一通过 `src/router/routes.ts` 的 `ROUTE_NAMES` 引用。
- 使用 HTML5 History 模式：开发环境由 Vite 自动回退；生产部署到静态服务器时需为
  未知路径配置 `index.html` 回退。

> **已删除的页面（本次清理）**：`/welcome`（WelcomeView 欢迎页）与 `/features`
> （FeatureView 功能选择页）是旧版流程的中间态 —— 现在的入口链路是
> 「主界面 → 创作台 → 播放页」，没有任何页面链接到它们。
> 两条旧地址**不写重定向**，由通配路由送回首页（与「页面已删除」语义一致）；
> `ROUTE_NAMES` 里对应的 `welcome` / `features` 也一并移除，没有任何消费方引用。
> 同批删除的历史占位页 `CreateView.vue`（早已无路由指向）见第三节。

---

## 三、目录结构

```
frontend/
├─ index.html                 入口 HTML（根元素显式声明 data-theme="night"）
├─ src/
│  ├─ main.ts                 应用入口：初始化主题机制 + 挂载路由
│  ├─ App.vue                 根组件：路由出口与页面切换过渡
│  ├─ router/
│  │  ├─ routes.ts            路由表与 ROUTE_NAMES（路径唯一来源）
│  │  └─ index.ts             路由实例（createWebHistory）
│  ├─ pages/                  页面级组件
│  │  ├─ HomeView.vue         主界面（首页）
│  │  ├─ StudioView.vue       创作台 · 选择故事
│  │  ├─ StudioResourcesView.vue   创作台 · 资源管理
│  │  ├─ StudioOperationsView.vue  创作台 · 操作编辑（时间线）
│  │  ├─ PlayerView.vue       消费播放页（分支选择 / 存读档 / 音色）
│  │  └─ ResourcesView.vue    我的故事库（占位页：写明「开发中」并提供返回入口）
│  ├─ components/             可复用 UI 组件
│  │  ├─ base/                通用基础组件
│  │  │  ├─ AppButton.vue     按钮：变体 / 尺寸 / 状态 / 槽形轮廓
│  │  │  ├─ BackLink.vue      返回上一层的图标入口
│  │  │  ├─ BaseModal.vue     弹窗外壳（遮罩 / 焦点 / Esc 关闭）
│  │  │  ├─ DemoModeBadge.vue 演示模式标记（只在 Mock 模式下渲染，接后端后自动消失）
│  │  │  ├─ GlassPanel.vue    通用玻璃面板容器
│  │  │  ├─ NaiveModalShell.vue Naive 弹窗主题外壳（**新弹窗必须用它包**，否则白底黑字）
│  │  │  ├─ PageBackdrop.vue  全站内页统一背景（静态图 + 压暗层）
│  │  │  ├─ PageHeader.vue    页面标题区（标题 + 两侧装饰线）
│  │  │  └─ ToastPill.vue     轻提示条
│  │  ├─ feature/             创作台与播放页业务组件
│  │  │  ├─ ResourceCard.vue / AddResourceModal.vue
│  │  │  ├─ AnchorCard.vue / TimelineStage.vue     剧情锚点与阶段分组（含 audioURL 字段）
│  │  │  ├─ StoryCanvas.vue / StoryNodeCard.vue / StoryEdgePath.vue
│  │  │  │                    剧情画布：点选连线 / 拖拽 / 霓虹贝塞尔（基于 @vue-flow/core）
│  │  │  ├─ InterpolateModal.vue / ExportDrawer.vue 插值生成与导出
│  │  │  └─ BranchChooserModal / SaveLoadModal / TimbreSelectModal + TimbrePicker
│  │  │                       播放页的三个面板（分支选择 / 存读档 / 音色）
│  │  ├─ audio/               音频视觉与播放控件
│  │  │  ├─ AudioOrb.vue      声音主体（球体 + 频谱），播放页中央
│  │  │  ├─ AudioSpectrumBars.vue  频谱竖条
│  │  │  └─ SeekBar.vue       自定义进度条（点击 / 拖拽 / 键盘三向跳转）
│  │  ├─ ambient/             背景装饰层（纯视觉，不参与业务）
│  │  │  └─ MeteorShower.vue  流星雨（3–5 条，pointer-events: none，压在内容之下）
│  │  └─ home/                主界面专用组件（品牌区 / 菜单 / 新闻面板 / 动效层）
│  ├─ stores/                 Pinia 状态
│  │  ├─ studio.ts            创作台：资源、剧情锚点、连线（edges）、生成与导出、配音配置
│  │  ├─ player.ts            播放：播放队列、字幕时间轴、分支与音色选项、读档恢复
│  │  └─ worldline.ts         世界线：currentWorldline 路径（只追加，与播放队列刻意分开）
│  ├─ composables/
│  │  ├─ useTheme.ts          主题初始化（仅夜间；切换能力已移除）
│  │  └─ useBackgroundAudio.ts 辅助音轨（BGM）控制器：循环 / 同步 / 音量
│  ├─ services/               前端 API 调用层
│  │  ├─ config.ts            接口基址 / 演示模式（Mock）开关 —— 运行状态的唯一判定入口
│  │  ├─ api.ts               请求封装与错误类型（含信封 / 裸对象两种兼容入口）
│  │  ├─ studio.ts            创作台 / 配音 / 播放域接口（含 getPlayScene；每处都带演示模式分支）
│  │  ├─ saves.ts             存读档：世界线存档的 localStorage 读写（与 mock 无关，长期保留）
│  │  └─ mock/                演示模式（Mock）的本地假后端 —— 接入真实后端后整目录可删
│  │     ├─ studioBackend.ts  假后端：资源 / 配音 / 锚点 / 插值 / 导出 / 播放场景（持久化进 localStorage）
│  │     ├─ demoScenes.ts     兜底演示剧情图（刷新后直接进播放页也能演示分支）
│  │     └─ silentAudio.ts    前端合成的静音 WAV，交给真实 <audio> 驱动进度与字幕
│  ├─ types/
│  │  ├─ api.ts               通用接口契约类型（业务码信封）
│  │  ├─ home.ts              主界面数据类型
│  │  └─ studio.ts            创作台 / 配音 / 播放域契约类型（含 PlayScene / PlayEdge / VoiceConfig）
│  ├─ utils/                  纯函数工具
│  │  ├─ math.ts / random.ts  数值与确定性随机（频谱造型可复现）
│  │  ├─ spectrum.ts          频谱数据模型
│  │  ├─ studioVocabulary.ts  创作台枚举到中文标签的映射
│  │  ├─ subtitles.ts         字幕解析（LRC / SRT / VTT / JSON）+ 下标二分查找
│  │  └─ notchOutline.ts      槽形按钮轮廓几何
│  ├─ styles/                 全局样式（详见第五节）
│  │  ├─ tokens.css           基础设计令牌（与主题无关）
│  │  ├─ themes/night.css     夜间主题 —— 当前唯一实际生效
│  │  ├─ themes/day.css       日间主题 —— 预留接入位（76 个同名占位令牌，取值 inherit）
│  │  ├─ base.css             重置与元素基线
│  │  ├─ utilities.css        通用工具类
│  │  ├─ naive-theme.ts       Naive UI 主题桥接（darkTheme + themeOverrides，取色源站内令牌）
│  │  ├─ naive-overrides.css  Naive UI 材质覆盖（玻璃拟态 / 降级 / 减弱动效）
│  │  └─ index.css            样式入口（固定加载顺序，naive-overrides 必须最后）
│  └─ assets/                 静态资源
│     ├─ home-backdrop.jpg        首页背景图
│     ├─ studio-select-bg.jpg     除首页外所有页面的统一背景图
│     └─ bgm-loop.m4a             播放页 BGM（真实音频，双音轨的辅助轨）
├─ .env.example               前端接口配置示例
├─ tsconfig*.json / vite.config.ts
└─ package.json
```

---

## 四、启动与构建

```bash
cd C:\Users\USER\Desktop\shumeinew\playwright\frontend

npm install          # 安装依赖（仓库已带 node_modules 时可跳过）
npm run dev          # 开发服务器 http://127.0.0.1:5173
npm run build        # 类型检查 + 生产构建（输出到 dist/）
npm run preview      # 预览构建产物
npm run type-check   # 仅类型检查
```

项目**没有**配置 ESLint / Prettier / 单元测试；如需接入请另行确认。

---

## 五、主题架构（夜间优先，日间预留）

### 5.1 文件职责与加载顺序

`src/styles/index.css` 的顺序有严格依赖：

```
tokens.css（与主题无关的令牌）
→ themes/night.css（当前唯一生效的主题）
→ themes/day.css（日间预留位：76 个同名占位令牌，取值 inherit）
→ base.css → utilities.css
→ naive-overrides.css（必须最后加载）
```

| 文件 | 职责 | 是否含主题取值 |
| --- | --- | --- |
| `styles/tokens.css` | 调色板原色、字体、间距、圆角、描边宽度、模糊、布局、动效、层级 | 否（全站共用） |
| `styles/themes/night.css` | 夜间主题的全部语义化令牌（76 项） | 是（当前唯一） |
| `styles/themes/day.css` | 日间主题接入说明与令牌契约清单 | **否**（不提前定义任何日间颜色） |
| `styles/base.css` | 盒模型、根尺寸、字体基线、焦点可见性 | 否 |
| `styles/utilities.css` | 仅 `nw-visually-hidden` | 否 |
| `styles/naive-overrides.css` | Naive UI 组件的材质与交互观感（含玻璃基元 `.nw-naive-surface`） | 仅引用令牌 |

### 5.2 夜间模式是默认且实际生效的主题

- 夜间令牌定义在 `:root` 上，因此**即使没有任何主题标识也生效**；`index.html` 中的
  `data-theme="night"` 只是显式声明，便于后续区分主题。
- 已实测：无论系统偏好是深色还是浅色，页面均渲染夜间模式（不受 `prefers-color-scheme` 干扰）。
- 命名规范沿用现有 `--nw-<类别>-<语义>` 前缀，避免与第三方样式冲突。

### 5.3 语义化主题变量

组件与页面**只引用语义化令牌**，不写具体色值。规范建议的键位均已落地：

| 语义用途 | 令牌 | 当前引用方 |
| --- | --- | --- |
| 页面背景 | `--nw-color-page-bg` | `base.css`、`PageBackdrop` |
| 主要容器背景 | `--nw-color-surface` | `AppButton`、`GlassPanel` |
| 浮层 / 突出面板 | `--nw-color-surface-elevated` | `GlassPanel --strong`（预留） |
| 主要文字 | `--nw-color-text-primary` | `PageHeader` 等 |
| 辅助文字 | `--nw-color-text-secondary` | 全局正文、按钮次级变体 |
| 常规边框 | `--nw-color-border` | 按钮次级变体 |
| 主题强调色 | `--nw-color-accent` | 主题色派生入口 |
| 强调色悬停 | `--nw-color-accent-hover` | 按钮悬停与焦点光环 |
| 键盘焦点 | `--nw-color-focus` / `--nw-color-focus-ring` | 全局焦点环、按钮焦点态 |
| 面板阴影 | `--nw-shadow-panel` | `GlassPanel` |
| 主题高光 | `--nw-glow-accent` | 标题柔光、按钮悬停辉光 |

### 5.4 日间模式的预留方式

1. **独立文件**：`styles/themes/day.css` 预留 `[data-theme='day']` 接入位，与夜间取值分离管理，
   不混写在页面 CSS 中。
2. **统一入口**：`src/composables/useTheme.ts` 只做一次性初始化（写 theme-color）；
   **主题切换功能已按需求整体移除** —— 不再有开关、状态与系统偏好监听。
3. **不依赖深色**：组件不依赖任何固定深色值，全部通过语义化令牌取色。
4. **夜间专属效果已封装**：`.nw-glass-panel`（`GlassPanel.vue`）、`.nw-page-backdrop` 背景图与压暗层
   （`components/base/PageBackdrop.vue`）、`.nw-audio-orb` 球体辉光（`AudioOrb.vue`）均已单独成类并加注注释，
   日间模式可按需覆盖，不会无条件作用于浅色背景。
5. **同名占位令牌齐备**：`day.css` 中 `[data-theme='day'] body` 声明了与 `night.css` **同名同序的
   76 个令牌**，取值统一为 `inherit` —— body 继承 `html`（即 `:root`）的夜间取值再传给后代，
   因此当前切到 day 也不会有任何视觉变化，但令牌清单是可枚举、可校验的，将来逐条替换即可。
   颜色值数量为 **0**，未写死任何日间颜色；也未引入 `localStorage` 持久化等尚无消费方的逻辑。
6. **没有主题控件**：`ThemeToggle.vue` 已删除（需求 1），`data-theme="night"` 只作为 `index.html`
   里的静态声明存在，不参与任何运行时判断。

---

## 六、可复用组件职责

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| `AppButton` | 变体（primary/secondary/ghost）、尺寸（md/lg/xl）、禁用、加载（置灰 + 显示 `loading-label` + 转圈）、默认/悬停/按下/焦点状态、槽形轮廓 | 页面定位、业务逻辑 |
| `BackLink` | 返回上一层的语义化入口（图标按钮） | 页面布局定位 |
| `GlassPanel` | 半透明玻璃材质、描边与阴影（`tone: soft / strong`） | 内部结构、布局定位 |
| `PageHeader` | 标题语义与两侧装饰线 | 导航、操作入口 |
| `ToastPill` | 单行结果提示（成功 / 失败 / 待接入），约 1.9 秒后自行消失 | 请求本身、错误语义判断 |
| `BaseModal` | 模态浮层：遮罩（`--nw-color-overlay`）、`Esc` 关闭、滚动锁定 | 表单内容 |
| `DemoModeBadge` | 演示模式标记：只在未接入真实后端时渲染，说明本页数据 / 音频是 Mock | 模式判定（读 `API_DEMO_MODE`）、业务逻辑 |
| `AudioOrb` | 声音主体（球体 + 频谱 + 轨道）：播放页中央 | 页面尺寸（由父级 viewBox / 容器决定） |
| `SeekBar` | 自定义进度条：点轨道即跳、拖拽拇指、键盘（←→/PageUp/PageDown/Home/End）、`role="slider"` | 真正的时间跳转（只 emit `seek` / `preview`） |
| `StoryCanvas` | 剧情画布：节点拖拽、点选连线、缩放平移、坐标回写 | 业务校验（自环 / 重复边由 store 拒绝） |
| `StoryNodeCard` | 画布节点卡片：id / 说话人 / 台词摘要 / 音频标记 / 选中态 | 数据修改（emit `select` / `edit`） |
| `StoryEdgePath` | 画布连线：霓虹发光三层贝塞尔（glow / core / 点击热区）+ 箭头 | 连线数据（emit `remove`） |
| `MeteorShower` | 背景装饰层：3–5 条斜向流星，纯 CSS 动画 | 内容层级与交互（`pointer-events: none`，`z-index: var(--nw-z-far)`） |
| `PageBackdrop` | 除首页外所有页面的统一背景：静态图（`studio-select-bg.jpg`）+ 竖向渐变压暗 + 站内暗角 | 前景内容与交互（整体 `aria-hidden`、`pointer-events: none`） |

**异形面板的实现说明**：原来的 `FeaturePanel`（梯形异形入口面板）随功能选择页一并删除。
它用同一个几何函数生成三层 `clip-path` 梯形（外描边 → 内阴影环 → 玻璃填充）的写法，
若将来还需要异形入口，参考点仍在槽形按钮 `utils/notchOutline.ts`：几何约束必须写清
（内边缘的上下端点错开，否则四点共线会退化成矩形）。

组件视觉全部来自语义化令牌，因此日间模式接入时**无需修改组件**。

### 6.1 接口调用与反馈约定（全站统一）

| 环节 | 约定 | 落点 |
| --- | --- | --- |
| 请求 | 只走 `src/services/*`，`try/catch` 在 service / store 层收口，统一转成 `lastError` / `error` | `services/api.ts`、`stores/studio.ts`、`stores/player.ts` |
| 成功反馈 | 一律 `ToastPill` 可见提示（如「资源已新增」「场景已就绪：SCENE_X」） | 各页面 `notify()` |
| 失败反馈 | 提示条 + 必要的页内错误面与「重试」，不假装成功；未接后端的页面用 `DemoModeBadge` 说明数据是 Mock，而不是把假数据说成真实结果 | 各页面 + 状态面板 + `DemoModeBadge` |
| 加载态 | 提交按钮 `:loading` → 置灰 + 显示 `loading-label`（「生成中…」「保存中」等）+ 转圈，且期间不可重复提交 | `AppButton` + 各表单 |
| 无障碍 | 结果同时写入 `role="status"` 区域或由可见提示条承担 | 各页面 `notify()` / `ToastPill` |

---

## 七、可访问性与动效

- 语义化标签：`header` / `nav` / `button` 层级清晰，装饰性 SVG 统一 `aria-hidden`。
- 全站 `:focus-visible` 焦点环（2px），按钮另加外层光环，状态不只靠颜色传达。
- 按钮为真实 `<button>`：默认 / 悬停 / 按下 / 键盘焦点 / 禁用 / 加载状态齐备。
- 交互结果通过 `role="status"` 区域播报，不新增可见文案。
- `prefers-reduced-motion: reduce` 下所有动画停止（实测运行中动画数为 0）。
- 动效仅使用 `transform` 与 `opacity`，周期为 7–132 秒的低频呼吸 / 漂移。

---

## 八、待接入后端接口

> **当前默认处于「演示模式（Mock）」**：未配置 `.env.local` 时不会发出任何真实网络请求，
> `src/services/mock/` 会返回契约形状的假数据，因此
> 「主页 → 选择故事 → 资源添加 → 操作编辑 → 一键生成 → 播放页」这条链路可以完整点通。
> 详见 8.1。
>
> TODO: 待后端接入，当前为演示用 Mock。

### 8.1 演示模式（Mock）说明

| 项 | 演示模式下的行为 |
| --- | --- |
| 触发条件 | `VITE_API_BASE_URL` 为空，**或** `VITE_API_MOCK` 不是 `false`（默认 `true`）；判定只在 `services/config.ts` 里做（`API_DEMO_MODE`） |
| 数据来源 | `src/services/mock/studioBackend.ts` 的本地假后端：资源 / 配音 / 锚点 / 已生成的场景图都由它提供，形状与契约一致 |
| **持久化** | 假后端把资源 / 配音 / 锚点 / 已生成的场景图写进 `localStorage`（键 `nw-demo-backend-v1`），**刷新后仍在**；写入失败（隐私模式、配额满）自动降级为「仅内存」 |
| 音频 | `src/services/mock/silentAudio.ts` 在前端合成的**静音 WAV**，不播放任何真实音频；刻意不持久化（object URL 刷新即失效），装载时按台词长度重新合成 |
| 播放页 | `audioUrl` 指向那段静音音频，因此进度条、字幕、声波动画仍由**真实 `<audio>` 的 `currentTime`** 驱动 |
| 刷新播放页 | 已生成的场景图也在 `localStorage` 里，刷新后照常播放；只有**未知 sceneId** 才由 `mock/demoScenes.ts` 的兜底剧情图接管（含 2 条分支与 1 处回环，可演示换场） |
| 界面提示 | 相关页面显示「演示模式」标记（`components/base/DemoModeBadge.vue`），接后端后自动消失 |
| 契约保真 | 假后端严格保持契约的**信息量**：例如 `GET /properties` 同样只回 `{ nodeId, name, type }`，绝不偷偷补上描述字段 —— 因此刷新后资源卡片会显示「列表接口未返回描述」，这正是真实后端下的表现 |
| 音频驱动 | 页面**没有**为演示模式写任何播放分支：换场、队列、字幕、分支全部走与真实后端相同的代码路径 |
| 配音提交 | 播放页选音色同样走演示分支：假后端把配置记进 `localStorage`，形状与 `POST /api/v1/voices` 一致 |

**为什么假数据必须收口在 `services/` 层**：页面与 store 只认「调用这个函数会拿到契约形状的数据」，
不关心数据从哪来。因此接入真实后端时，store 与所有组件零改动。

前端已预留规范的调用层与类型定义，**未实现任何后端逻辑**。

> **历史**：这里曾有一节 8.2 描述「欢迎域（`/api/v1/welcome/*`）的最小本地模拟」。
> 欢迎页删除后，该域连同 `services/welcome.ts`、`API_ENDPOINTS.enter/tutorial`、
> `{ success, data }` 信封与 `postJson` / `readEnvelope` 一并移除 ——
> 全站现在只剩契约的一种信封 `{ code, data }`（外加播放域对裸对象的兼容入口）。

### 8.2 剧情图提交格式（扁平双 List）

`POST /api/v1/plan/anchors` 的请求体是**两条互不嵌套的数组**，类型见 `types/studio.ts`
的 `StoryGraphPayload`：

```jsonc
{
  "nodes": [
    { "sceneId": "SCENE_ANCHOR_01", "x": 48, "y": 40, "text": "…",
      "speaker": "旁白", "audioURL": "https://…/a.mp3", "timeStage": 1 }
  ],
  "edges": [
    { "id": "EDGE_SCENE_ANCHOR_01__SCENE_ANCHOR_02",
      "sourceId": "SCENE_ANCHOR_01", "targetId": "SCENE_ANCHOR_02" }
  ]
}
```

约定（不是风格问题）：
1. `nodes` 里**没有** `children` / `edges`；`edges` 里**没有**节点数据 —— 关系只靠 id 引用；
2. 节点的坐标 `x / y` 就是画布落位，拖拽结束即写回；
3. `audioURL` 是编辑态字段（大写 URL）；播放域契约字段是 `audioUrl`，由
   `services/studio.ts` 的 `readPlayScene` 映射，两边不互相改名；
4. 自环、重复边、端点不存在这三种情况由 store 直接拒绝并给出可读原因。

### 8.3 接口一览（前端已按契约登记在 `services/api.ts`）

| 动作 | 方法 | 路径 | 入参 | 出参 |
| --- | --- | --- | --- | --- |
| 新建 / 查询资源 | POST·GET | `/api/v1/properties` | 见 `services/studio.ts` | `{ code, data }` 信封 |
| 更新 / 删除资源 | PUT·DELETE | `/api/v1/properties/{nodeId}` | ⚠️ 契约未定义，按 REST 惯例补充 | 同上 |
| 保存配音配置 | POST | `/api/v1/voices` | `VoiceConfig`（播放页音色选择提交） | 同上 |
| 查询配音配置 | GET | `/api/v1/voices/{characterId}` | 路径参数 | 同上（404 = 未配置） |
| 锚点 / 生成 / 导出 | POST | `/api/v1/plan/anchors`、`/plan/interpolate`、`/plan/export-segment` | 见 `services/studio.ts` | 同上 |
| 取播放场景 | GET | `/api/v1/play/scene/{sceneId}` | 路径参数 | 场景对象（契约示例为**裸对象**，也兼容 `{ code, data }`） |

播放域的取舍写在 `stores/player.ts` 与 `pages/PlayerView.vue` 头部注释里，要点：

- `edges` 是分支数组（**不是 `choices`**），每个 `edge.targetScene` 已带全下一层数据，
  点分支**无需再请求**即可开播（契约要求的「零延迟」）；
- 但后端对嵌套层标了 `@JsonIgnoreProperties("edges")`，嵌套 `edges` 恒为空，
  因此开播后前端会**补拉一次该场景**，把它的分支取回来；
- 契约未提供逐句时间戳，字幕按句长比例分配音频时长，界面标注「按句长估算」；
  后端补上 `subtitles` 字段后会自动改用真实时间轴。

接入步骤：

```bash
cp .env.example .env.local
# 编辑 .env.local
#   VITE_API_BASE_URL=https://<后端域名>
#   VITE_API_MOCK=false      # 必须显式写 false —— 默认值是 true
```

然后：

1. 删除 `src/services/studio.ts` 里每个函数的 `isStudioMockMode` 分支；
2. 删除 `src/services/mock/` 整个目录、`components/base/DemoModeBadge.vue`，
   以及各页面模板里的 `<DemoModeBadge>` 引用。

**UI 层无需任何其它改动** —— 演示模式与真实后端共用同一套字段收敛（`readPlayScene`）
与错误处理，播放页也没有为演示模式写分支。

⚠️ 只填 `VITE_API_BASE_URL` 而不写 `VITE_API_MOCK=false` 仍然算演示模式（mock 默认 `true`），
这是最容易踩的一个坑。

---

## 九、已知限制

1. **播放页已开发**：`pages/PlayerView.vue` + `stores/player.ts`。
   字幕同步以 `<audio>` 的 `currentTime` 为**唯一时间锚点**（`timeupdate` → 派生当前句下标），
   全程没有 `setTimeout` / `setInterval` 参与字幕推进；页面里唯一的定时器是
   「纯聆听模式下控件 3 秒后自动隐藏」这一 UI 行为。
   音频的装载与播放只有**一个入口**（watch `player.reloadToken`），
   因此换场、重试、队列续播都不会漏装载、也不会重复装载。
   分支选择、播放队列、双模式与响应式布局的实现说明见两个文件的头部注释。
2. **故事库尚未开发**：`ResourcesView.vue` 是**带明确说明的占位页**
   （写明「开发中」并提供返回入口，不是空白页）。
   历史占位页 `CreateView.vue`、旧版欢迎页与功能选择页（`/welcome`、`/features`）已删除。
3. **「教程 / 设置」未接入引导流程**：首页菜单这两项只播报「页面开发中」，不做无依据的跳转。
4. **后端接口待接入**：见上一节。当前默认走**演示模式（Mock）**，链路可完整点通，
   数据存在浏览器 `localStorage` 里（刷新仍在），播放页放的是前端合成的静音音频
   （界面有「演示模式」标记，不假装是真实音频）。接入真实后端后按 8.1 的步骤删除 Mock 分支即可。
5. **日间模式未开发**：`day.css` 里是与 `night.css` 同名同序的 76 个占位令牌（取值 `inherit`），
   因此切到日间没有任何视觉变化，只是把接入位和清单先占住；**主题切换入口已整体移除**
   （需求 1），`useTheme.ts` 只剩一次性初始化。
6. `GlassPanel` 已被创作台与播放页多处使用（字幕窗口、控件、分支卡、状态面板）。
7. 部分令牌为后续页面预留（字号 / 间距 / 圆角梯度、状态色、`--nw-z-modal` 等），
   在源文件中以「预留」注释标注，当前页面不消费。
8. 未在 Safari / Firefox 真机验证；`backdrop-filter` 已有 `@supports` 降级，
   槽形与梯形 `clip-path`、字幕窗口的 `mask-image` 渐隐已在 Chromium 内核实测。
9. 路由使用 HTML5 History 模式：若部署到静态服务器，需为未知路径配置 `index.html` 回退。
10. 无 ESLint / Prettier / 单元测试配置。
11. **播放域待后端确认**：`GET /play/scene/{sceneId}` 是否使用 `{ code, data }` 信封
    （契约示例是裸对象，前端两种都认）；播放域没有字幕时间戳字段。
12. **资源节点的「编辑 / 删除」在契约里没有对应接口**：`PUT / DELETE /properties/{nodeId}`
    的路径与回执形状是前端按 REST 惯例假定的。演示模式下由假后端实现，因此按钮可用；
    接入真实后端前需后端补上，否则这两个按钮会直接报错。
13. **没有「查询锚点」接口**：契约只有 `POST /plan/anchors`。真实后端模式下刷新即丢时间线；
    演示模式由假后端持久化进 `localStorage`，因此刷新后锚点仍在（这是假后端提供的便利，
    真实后端需要补 `GET` 才能等价）。
14. **播放页没有音量 / 倍速控件**（本阶段产品决定）。音频元素的这两个参数由
    `PlayerView.vue` 的 `FIXED_VOLUME` / `FIXED_PLAYBACK_RATE` 常量统一写回，
    将来加控件时把常量换成响应式状态即可，不需要改事件绑定。
15. **演示模式下资源详情会「退化」为轻量字段**：这是**刻意的契约保真** ——
    `GET /properties` 按契约只回 `{ nodeId, name, type }`，因此刷新后卡片会显示
    「列表接口未返回描述 / 属性」。真实后端接入后表现完全一致，不会出现
    「演示时好好的、接上后端就丢字段」的假象。
16. **BGM 用的是站点内置音轨**：`assets/bgm-loop.m4a`（真实音频，55.2 秒、48 kHz 立体声，
    峰值约 -17.7 dBFS），由 Vite 打进产物并带 hash。播放页的辅助音轨优先用
    `PlayScene.bgmUrl`（契约未定义该字段，有就用），没有则回退到这条内置音轨。
    音量常量 `BGM_VOLUME = 0.6` 在 `composables/useBackgroundAudio.ts`：
    按素材实测响度调过 —— 0.18 时几乎听不见，0.6 时安静可闻且明显低于人声。
17. **画布坐标只存在于前端数据里**：`SceneAnchor.x / y` 是画布落位与拖拽的结果，
    随 `nodes` 一起提交；契约里没有这两个字段，需后端确认是否入库（不入库也不影响连线关系）。
18. **字幕支持四种格式**：`utils/subtitles.ts` 解析 JSON / LRC / SRT / WebVTT；
    后端给不了时间戳时，播放页仍按句长比例估算并标注「按句长估算」。
19. **剧情卡片名称（`cardName`）可自定义**：双击卡片标题或点「重命名」图标进入编辑
    （`Enter` 确认 / `Esc` 取消）。`cardName` 是**展示名**，`sceneId` 是**身份**（不可改）；
    没命名时界面回退显示 `sceneId` 并用弱化色区分。画布节点与列表卡片口径一致
    （`utils/studioVocabulary.ts` 的 `anchorTitle`）。契约里没有该字段，需后端确认是否入库。
20. **说话人（speaker）已从界面彻底移除，但字段仍照契约提交**：AnchorCard 的下拉、
    StoryNodeCard 的展示、播放页的元信息行都已删除；提交时 `speaker` 恒为 `'旁白'`。
    这是**契约兼容**而非遗漏 —— 接口文档 3.1 / 4.1 里 `speaker` 是后端 `Scene` 实体的字段，
    前端完全不传可能导致后端反序列化出 `null`。详见 `types/studio.ts` 的 `SceneAnchor.speaker`。
21. **音色选择（`timbreId`）在播放页，并且会提交后端**：底栏「音色」按钮打开
    `TimbreSelectModal`（内嵌 `TimbrePicker.vue`，基于 Naive UI 的 `n-radio-group`）单选，
    确认后由 `PlayerView` 调 `stores/studio.ts` 的 `saveVoice` → `POST /api/v1/voices`，
    供后端调用 TTS。请求体由 `types/studio.ts` 的 `buildTimbreVoiceConfig` 组装：
    `characterId` = 当前场景的 `speaker`（通常「旁白」，空则回退 `NARRATOR_SPEAKER`）、
    `voiceName` = 音色标识本身、`promptStyle` = 音色说明、`pitch` / `rate` = 中性 1。
    **提交失败不阻断收听**（本地选中项照常生效，只如实播报一句）。
    ⚠️ 两处需后端确认：契约 2.1 里**没有 `timbreId` 这个字段**
    （原文只有 characterId / voiceName / promptStyle / pitch / rate），若后端定为 `voiceType`，
    只改 `types/studio.ts` 的类型与提交键即可；以及上面那套字段映射是否符合后端预期
    （若 `voiceName` 必须是对应 TTS 引擎的真实发音人名，改 `buildTimbreVoiceConfig` 一处即可）。
    > 创作台侧原来的「配音配置」弹窗（`VoiceConfigModal.vue`）已随音色选择迁移一并删除；
    > `GET /voices/{characterId}` 在 service 层按契约保留（404 = 未配置），
    > 但**当前没有调用方** —— 要做「进播放页预选上次保存的音色」时在 store 里接上即可。
22. **播放页封面下只保留「场景」一项**（原「说话人」「进度」两行已按需求删除）。
    进度条 `SeekBar` 保留 —— 需求删的是字段展示，不是操作入口。
23. **世界线与存读档（AVG）**：
    - `stores/worldline.ts` 维护 `currentWorldline`（`currentNodeId` + `nodeHistory`），
      **只追加、不可回退** —— 「重听上一段」不该在世界线上多记一笔；
      它与 `player.playlist`（可前后移动、会被分支截断的播放队列）是两件事，不要合并。
    - 分支选择改为弹窗 `BranchChooserModal`（原内联卡片在纯聆听模式下会被
      「3 秒隐藏控件」一起收掉，听众可能没看见选项就卡住）。
    - 存读档 `SaveLoadModal` + `services/saves.ts`，写在 `localStorage`
      （键 `nw-worldline-saves-v1`，与演示假后端的 `nw-demo-backend-v1` **刻意分开**：
      存档是用户资产，不该在后端接入清演示数据时被一起删掉）。
      `SaveData` 含 id / name / savedAt / currentNodeId / nodeHistory / audioProgress(可选)。
      上限 30 份，超出淘汰最旧；隐私模式或配额满时**如实报错，不假装存上了**。
    - 读档恢复音频进度的时机：store 只登记 `pendingSeek`，由组件在音频元数据就绪后
      seek（store 不碰 DOM，且早于 `loadedmetadata` 写 `currentTime` 会被浏览器忽略）。

---

## 十、设计取舍（为什么这里引入了两个依赖）

### 10.1 `@vue-flow/core` —— 剧情画布

**问题**：需求 8 要求「点选两张卡片连线、霓虹贝塞尔、拖拽时连线实时跟随」。
手写这套东西意味着：自己维护节点坐标、听 `scroll` / `resize` / `rAF` 重算端点、
自己做命中测试与键盘可达、自己实现缩放平移 —— 约 300 行且容易在细节上出错
（窗口缩放、容器滚动、DPR、触摸）。

**选择**：引入 `@vue-flow/core`（MIT，Vue 3 原生 TS），只用在一个懒加载页面里。

| 方案 | 结论 |
| --- | --- |
| `@vue-flow/core`（已采用） | 节点拖拽 / 贝塞尔 / 缩放平移开箱即用；坐标由库托管，拖拽即重算；仍需自己写节点与边的外观（已用令牌重写，视觉与站内一致） |
| 自写 SVG + `getBoundingClientRect` | 零依赖，符合"无第三方库"的旧约定，但要自己处理上述全部边界情况，且与你"尽量不要 SVG 手绘"的要求相反 |
| Element Plus / Naive UI / PrimeVue | 整套 UI 框架**不提供节点画布**，连线的核心难点仍在，属"引了重依赖却没解决问题" |

**代价与边界**：
1. 依赖链：`@vueuse/core` + `d3-drag` / `d3-selection` / `d3-zoom`（安装后 16 个包）；
2. 体积：只进 `StudioOperationsView` 的懒加载 chunk（gzip 约 60 kB），首屏不受影响；
3. 库自带 CSS 只引入基础样式 `style.css`，**不引入** `theme-default.css`（避免把画布刷成浅色），
   节点 / 连线外观全部用 `--nw-*` 令牌重写。

### 10.2 `naive-ui` —— 弹窗 / 单选 / 输入（本轮新增）

**问题**：新增的存读档、世界线分支选择、音色选择都需要**模态框与单选控件**，
且要求"搜一个好看又好用的组件库，尽量不 SVG 手绘"。

**调研结论**（按 npm registry 实际依赖与体积核对，非转述）：

| 方案 | 结论 |
| --- | --- |
| **Naive UI 2.45.3**（已采用） | 依赖 20+（`date-fns` / `highlight.js` / `lodash` / `css-render`），但按需引入、可 tree-shake；提供 `darkTheme` + `themeOverrides` 这一**官方主题覆盖入口**，能逐项改成站内取值 |
| Element Plus 2.14.7 | 依赖同样重（`dayjs` / `@popperjs/core` / `tinycolor`），视觉与交互更"后台管理系统"，改造成本更高 |
| Arco Design / Ant Design Vue | 依赖最重（`stylis` / `@emotion` / `babel-runtime`），体积与链路都最大 |
| PrimeVue 5 | ⚠️ 新版包含 `@primeui/license-manager`，存在许可不确定性，故排除 |
| Reka UI 2.11（headless） | 无样式、体积最小、可访问性由库保证，但**没有现成外观**，等于仍要自己写全部视觉，与"好用"的诉求不符 |
| 零依赖（只用自写 `BaseModal` + 原生控件） | 完全不新增依赖，但单选组的键盘导航、弹窗焦点陷阱都要手写，正是"看起来能用、键盘用不了"的高发区 |

**为什么最终选完整组件库而不是 headless**：需求明确要求"好看又好用"，
headless 只解决"好用"（无障碍）不解决"好看"（外观仍要自绘）；
Naive UI 两者都给，代价是体积 —— 通过**按需引入 + 路由懒加载**把它限制在
用到弹窗的两页（播放页 / 资源页），首屏 `index` chunk 不受影响。

**桥接方式（这是引入组件库后最容易失控的地方，因此有硬约束）**：

1. `styles/naive-theme.ts` 是**唯一的主题桥接点**：用 `darkTheme` 作基底
   （避免漏覆盖时漏出黑字），再把颜色 / 圆角 / 字号逐项改成站内 `--nw-*` 的取值。
   取色统一从该文件顶部的 `NW_NAIVE_COLORS` 引用，**不散落硬编码色值**。
2. `styles/naive-overrides.css` 补**材质**：玻璃拟态依赖 `backdrop-filter` +
   多层渐变，这是 Naive 的 JS 变量表达不了的，因此用 CSS 覆盖补上，
   并保留 `@supports not (backdrop-filter)` 的降级与 `prefers-reduced-motion` 处理。
3. 加载顺序：`styles/index.css` 里 `naive-overrides.css` **必须最后**，
   否则同权重下会被 Naive 默认样式盖掉（入口注释里写明了这一点）。
4. **不是全站替换**：既有弹窗（资源 / 配音 / 插值 / 导出）继续用项目自带的
   `BaseModal`，不做无谓搬迁 —— 它已经正确处理了焦点循环与 Esc。
   Naive UI 只用在**本轮新增**的 `SaveLoadModal` / `BranchChooserModal` / `TimbrePicker`。

**⚠️ 三个必须知道的坑（都真实踩过，改坏会直接回到「白底黑字」）**：

1. **`<n-config-provider>` 不穿过 `<Teleport>`**。
   Naive 的弹窗默认 Teleport 到 `body`，会跑到根部 provider 的子树**之外**，
   拿不到主题 → 退回默认**浅色**主题。这就是「弹窗白底黑字」的根因。
   因此**每个 Teleport 弹窗都要经 `components/base/NaiveModalShell.vue` 包裹** ——
   该组件把 provider 一并送进 `body`，让弹窗与主题处在同一棵子树里。
   写新弹窗时漏掉这层壳，就会白一个。
   > 顺带记录一条**死路**：想让 `<n-modal :to="false">` 就地渲染来绕开这个问题行不通。
   > `to` 的类型是 `[String, Object]`，传 `false` 会被 Vue 的类型校验拒绝并**静默忽略**
   > （弹窗根本不渲染）。Naive 底层的 vueuc `VLazyTeleport` 确有 `disabled` 能就地渲染，
   > 但 `n-modal` 没有把它暴露出来。

2. **不要给 `n-modal` 传 class 做样式作用域**。
   n-modal 内部会把 `$attrs` 的 class 合并**两次**（`BodyWrapper.mjs:279`），
   传字符串或数组都会在 DOM 上渲染出重复 class，调用方无法避免。
   弹窗样式一律以 Naive 自己稳定的 **`.n-modal-body-wrapper`** 为锚点
   （只有 Naive 弹窗会产生它，与站内 `BaseModal` 不冲突）。

3. **`preset="card"` 渲染的是 `n-card`，底部插槽叫 `action` 而不是 `footer`**。
   写 `#footer` **不会报错**，内容被静默丢弃（按钮整个消失，很难查）。

**代价与边界**：
1. 体积：播放页懒加载 chunk 由 21 kB 增至约 181 kB（gzip 约 54 kB），
   这是引入组件库的直接成本；首屏 `index` chunk 基本不变（28.8 kB gzip）。
2. Naive 的主题变量名是它的内部实现，升级时需对照官方 changelog 复核；
   因此本项目的覆盖集中在两个文件里，将来替换组件库只需改这两处。
3. 其余页面仍是「原生 CSS + 内联 SVG 图标」的既有规范。
