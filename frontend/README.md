# 夜间电台 · 前端（nightwave-radio）

播客电台 / 声音内容平台的前端工程。本仓库**只包含前端**：页面结构、视觉样式、通用 CSS、
可复用组件、主题架构、前端交互与响应式适配。

> 不包含后端服务、数据库、服务端接口实现与部署配置。需要后端支持的能力见
> [八、待接入后端接口](#八待接入后端接口)。

## 开发策略：夜间模式优先，日间模式预留

当前阶段**只开发夜间模式**。所有页面以统一的深蓝色夜间电台设计语言为基准；
日间模式**不制作视觉**，仅在架构、令牌与组件层面预留接入能力，详见
[第四节](#四主题架构夜间优先日间预留)。

---

## 一、技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Vue 3（`<script setup>` + TypeScript） | 组合式 API，类型严格模式 |
| 路由 | vue-router 4（HTML5 History） | 第二个页面起引入；页面按路由懒加载分包 |
| 构建 | Vite 8 | 开发态 HMR |
| 类型检查 | vue-tsc | `npm run type-check` |
| 样式 | 原生 CSS + 自定义属性 | 无预处理器、无 UI 框架 |
| 依赖 | `vue`、`vue-router` | devDeps：`vite`、`@vitejs/plugin-vue`、`typescript`、`vue-tsc` |

运行时不含任何第三方 UI / 动画 / 图标库，全部视觉由 CSS 渐变、伪元素与内联 SVG 绘制。

---

## 二、路由与页面

| 路径 | 路由名 | 页面 | 状态 |
| --- | --- | --- | --- |
| `/` | `home` | `pages/HomeView.vue` | 已开发（主界面，用 `home-backdrop.jpg`） |
| `/welcome` | `welcome` | `pages/WelcomeView.vue` | 已开发（欢迎页） |
| `/features` | `features` | `pages/FeatureView.vue` | 已开发（功能选择页） |
| `/studio` | `studio` | `pages/StudioView.vue` | 已开发（创作台 · 选择故事） |
| `/studio/resources` | `studioResources` | `pages/StudioResourcesView.vue` | 已开发（资源管理） |
| `/studio/operations` | `studioOperations` | `pages/StudioOperationsView.vue` | 已开发（操作编辑 / 时间线） |
| `/player/:sceneId` | `player` | `pages/PlayerView.vue` | 已开发（消费播放页，带 `beforeEnter` 守卫） |
| `/player` | — | 重定向到 `/studio` | 缺少 sceneId 时回创作台 |
| `/resources` | `resources` | `pages/ResourcesView.vue` | 已开发（**故事库占位页**：明确写出「开发中」与返回入口，不是空白页） |
| `/create` | — | 重定向到 `/studio` | 兼容旧链接 |
| `/:pathMatch(.*)*` | — | 重定向到首页 | — |

- 首页「进入」→ 欢迎页 → 功能选择页；功能选择页「资源」→ `/resources`，「创作」→ `/studio`。
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
- `CreateView.vue` 现在**没有任何路由指向它**（`/create` 已改为重定向），属于可删的历史占位页。
- 除首页外，所有页面共用同一个背景图组件 `components/base/PageBackdrop.vue`。
- `/welcome` 目前只能通过地址直接访问，但页内左上角有「返回首页」入口，不会成为死胡同。
- 路径字符串统一通过 `src/router/routes.ts` 的 `ROUTE_NAMES` 引用。
- 使用 HTML5 History 模式：开发环境由 Vite 自动回退；生产部署到静态服务器时需为
  未知路径配置 `index.html` 回退。

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
│  │  ├─ WelcomeView.vue      欢迎页
│  │  ├─ FeatureView.vue      功能选择页
│  │  ├─ StudioView.vue       创作台 · 选择故事
│  │  ├─ StudioResourcesView.vue   创作台 · 资源管理
│  │  ├─ StudioOperationsView.vue  创作台 · 操作编辑（时间线）
│  │  ├─ PlayerView.vue       消费播放页（字幕同步 / 分支选择 / 双模式）
│  │  ├─ ResourcesView.vue    资源浏览页（路由占位）
│  │  └─ CreateView.vue       音频创作页（历史占位，已无路由指向）
│  ├─ components/             可复用 UI 组件
│  │  ├─ base/                通用基础组件
│  │  │  ├─ AppButton.vue     按钮：变体 / 尺寸 / 状态 / 槽形轮廓
│  │  │  ├─ BackLink.vue      返回上一层的图标入口
│  │  │  ├─ BaseModal.vue     弹窗外壳（遮罩 / 焦点 / Esc 关闭）
│  │  │  ├─ DemoModeBadge.vue 演示模式标记（只在 Mock 模式下渲染，接后端后自动消失）
│  │  │  ├─ FeaturePanel.vue  异形入口面板底型（外侧长、内侧斜线收束）
│  │  │  ├─ GlassPanel.vue    通用玻璃面板容器
│  │  │  ├─ PageBackdrop.vue  全站内页统一背景（静态图 + 压暗层）
│  │  │  ├─ PageHeader.vue    页面标题区（标题 + 两侧装饰线）
│  │  │  ├─ ThemeToggle.vue   夜间 / 日间主题切换
│  │  │  └─ ToastPill.vue     轻提示条
│  │  ├─ feature/             功能入口与创作台业务组件
│  │  │  ├─ ResourcePanel.vue / CreatePanel.vue   功能选择页左右入口
│  │  │  ├─ ResourceCard.vue / AddResourceModal.vue / VoiceConfigModal.vue
│  │  │  ├─ AnchorCard.vue / TimelineStage.vue     剧情锚点与阶段分组
│  │  │  └─ InterpolateModal.vue / ExportDrawer.vue 插值生成与导出
│  │  ├─ audio/               音频视觉组件
│  │  │  ├─ AudioOrb.vue      声音主体（球体 + 频谱），首页与播放页封面
│  │  │  ├─ AudioWave.vue     环形音波，功能选择页与播放页「纯聆听模式」
│  │  │  └─ AudioSpectrumBars.vue  频谱竖条
│  │  └─ home/                主界面专用组件（品牌区 / 菜单 / 新闻面板 / 动效层）
│  ├─ stores/                 Pinia 状态
│  │  ├─ studio.ts            创作台：资源、剧情锚点、生成与导出
│  │  └─ player.ts            播放：播放队列、字幕时间轴、模式与分支
│  ├─ composables/
│  │  └─ useTheme.ts          主题机制统一入口
│  ├─ services/               前端 API 调用层
│  │  ├─ config.ts            接口基址 / 演示模式（Mock）开关 —— 运行状态的唯一判定入口
│  │  ├─ api.ts               请求封装与错误类型（含信封 / 裸对象两种兼容入口）
│  │  ├─ welcome.ts           欢迎页动作接口
│  │  ├─ studio.ts            创作台与播放域接口（含 getPlayScene；每处都带演示模式分支）
│  │  └─ mock/                演示模式（Mock）的本地假后端 —— 接入真实后端后整目录可删
│  │     ├─ studioBackend.ts  假后端：资源 / 配音 / 锚点 / 插值 / 导出 / 播放场景（持久化进 localStorage）
│  │     ├─ demoScenes.ts     兜底演示剧情图（刷新后直接进播放页也能演示分支）
│  │     └─ silentAudio.ts    前端合成的静音 WAV，交给真实 <audio> 驱动进度与字幕
│  ├─ types/
│  │  ├─ api.ts               通用接口契约类型
│  │  ├─ home.ts              主界面数据类型
│  │  └─ studio.ts            创作台与播放域契约类型（含 PlayScene / PlayEdge）
│  ├─ utils/                  纯函数工具
│  │  ├─ math.ts / random.ts  数值与确定性随机（构图可复现）
│  │  ├─ spectrum.ts          频谱数据模型
│  │  ├─ studioVocabulary.ts  创作台枚举到中文标签的映射
│  │  └─ notchOutline.ts      槽形按钮轮廓几何
│  ├─ styles/                 全局样式（详见第五节）
│  │  ├─ tokens.css           基础设计令牌（与主题无关）
│  │  ├─ themes/night.css     夜间主题 —— 当前唯一实际生效
│  │  ├─ themes/day.css       日间主题 —— 预留接入位（仅说明，无取值）
│  │  ├─ base.css             重置与元素基线
│  │  ├─ utilities.css        通用工具类
│  │  ├─ theme.css            共享视觉原语（玻璃材质基类）
│  │  └─ index.css            样式入口（固定加载顺序）
│  └─ assets/                 静态资源
│     ├─ home-backdrop.jpg        首页背景图
│     └─ studio-select-bg.jpg     除首页外所有页面的统一背景图
├─ .env.example               前端接口配置示例
├─ tsconfig*.json / vite.config.ts
└─ package.json
```

---

## 四、启动与构建

```bash
cd C:\Users\USER\Desktop\shumei\playwright\frontend

npm install          # 安装依赖
npm run dev          # 开发服务器 http://127.0.0.1:5173
npm run build        # 类型检查 + 生产构建（输出到 dist/）
npm run preview      # 预览构建产物
npm run type-check   # 仅类型检查
```

项目**没有**配置 ESLint / Prettier / 单元测试；如需接入请另行确认。

---

## 五、主题架构（夜间优先，日间预留）

### 4.1 文件职责与加载顺序

`src/styles/index.css` 的顺序有严格依赖：

```
tokens.css（与主题无关的令牌）
→ themes/night.css（当前唯一生效的主题）
→ themes/day.css（日间预留位，当前无可执行规则）
→ base.css → utilities.css → theme.css
```

| 文件 | 职责 | 是否含主题取值 |
| --- | --- | --- |
| `styles/tokens.css` | 调色板原色、字体、间距、圆角、描边宽度、模糊、布局、动效、层级 | 否（全站共用） |
| `styles/themes/night.css` | 夜间主题的全部语义化令牌（96 项） | 是（当前唯一） |
| `styles/themes/day.css` | 日间主题接入说明与令牌契约清单 | **否**（不提前定义任何日间颜色） |
| `styles/base.css` | 盒模型、根尺寸、字体基线、焦点可见性 | 否 |
| `styles/utilities.css` | 仅 `nw-visually-hidden` | 否 |
| `styles/theme.css` | `.nw-glass` 玻璃基类 | 仅引用令牌 |

### 4.2 夜间模式是默认且实际生效的主题

- 夜间令牌定义在 `:root` 上，因此**即使没有任何主题标识也生效**；`index.html` 中的
  `data-theme="night"` 只是显式声明，便于后续区分主题。
- 已实测：无论系统偏好是深色还是浅色，页面均渲染夜间模式（不受 `prefers-color-scheme` 干扰）。
- 命名规范沿用现有 `--nw-<类别>-<语义>` 前缀，避免与第三方样式冲突。

### 4.3 语义化主题变量

组件与页面**只引用语义化令牌**，不写具体色值。规范建议的键位均已落地：

| 语义用途 | 令牌 | 当前引用方 |
| --- | --- | --- |
| 页面背景 | `--nw-color-page-bg` | `base.css`、`PageBackdrop` |
| 主要容器背景 | `--nw-color-surface` | `AppButton`、`GlassPanel`、`.nw-glass` |
| 浮层 / 突出面板 | `--nw-color-surface-elevated` | `GlassPanel --strong`（预留） |
| 主要文字 | `--nw-color-text-primary` | `PageHeader` 等 |
| 辅助文字 | `--nw-color-text-secondary` | 全局正文、按钮次级变体 |
| 常规边框 | `--nw-color-border` | 按钮次级变体 |
| 主题强调色 | `--nw-color-accent` | 主题色派生入口 |
| 强调色悬停 | `--nw-color-accent-hover` | 按钮悬停与焦点光环 |
| 键盘焦点 | `--nw-color-focus` / `--nw-color-focus-ring` | 全局焦点环、按钮焦点态 |
| 面板阴影 | `--nw-shadow-panel` | `GlassPanel`、`.nw-glass` |
| 主题高光 | `--nw-glow-accent` | 标题柔光、按钮悬停辉光 |

### 4.4 日间模式的预留方式

1. **独立文件**：`styles/themes/day.css` 预留 `[data-theme='day']` 接入位，与夜间取值分离管理，
   不混写在页面 CSS 中。
2. **统一入口**：`src/composables/useTheme.ts` 负责解析并写入根元素标识；
   系统偏好监听已接好，后续启用日间解析即可自动跟随系统。
3. **不依赖深色**：组件不依赖任何固定深色值，全部通过语义化令牌取色。
4. **夜间专属效果已封装**：`.nw-glass`（`theme.css`）、`.nw-page-backdrop` 背景图与压暗层
   （`components/base/PageBackdrop.vue`）、`.nw-audio-orb` 球体辉光（`AudioOrb.vue`）均已单独成类并加注注释，
   日间模式可按需覆盖，不会无条件作用于浅色背景。
5. **同名占位令牌齐备**：`day.css` 中 `[data-theme='day'] body` 声明了与 `night.css` **同名同序的
   96 个令牌**，取值统一为 `inherit` —— body 继承 `html`（即 `:root`）的夜间取值再传给后代，
   因此当前切到 day 也不会有任何视觉变化，但令牌清单是可枚举、可校验的，将来逐条替换即可。
   颜色值数量为 **0**，未写死任何日间颜色；也未引入 `localStorage` 持久化等尚无消费方的逻辑。
6. **主题控件**：`components/base/ThemeToggle.vue` 已提供夜间 / 日间切换入口
   （主界面右上角），但日间解析尚未启用，点击后仍停留在夜间取值。

---

## 六、可复用组件职责

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| `AppButton` | 变体（primary/secondary/ghost）、尺寸（md/lg/xl）、禁用、加载（置灰 + 显示 `loading-label` + 转圈）、默认/悬停/按下/焦点状态、槽形轮廓 | 页面定位、业务逻辑 |
| `FeaturePanel` | 异形入口面板底型：外侧长边 + 内侧斜线收束的梯形轮廓、玻璃材质、悬停/按下/焦点状态、进入动画 | 文案与跳转目标 |
| `ResourcePanel` / `CreatePanel` | 把「资源」「创作」的文案与路由目标映射到 `FeaturePanel`（左右镜像） | 轮廓与材质定义 |
| `BackLink` | 返回上一层的语义化入口（图标按钮） | 页面布局定位 |
| `GlassPanel` | 半透明玻璃材质、描边与阴影（`tone: soft / strong`） | 内部结构、布局定位 |
| `PageHeader` | 标题语义与两侧装饰线 | 导航、操作入口 |
| `ToastPill` | 单行结果提示（成功 / 失败 / 待接入），约 1.9 秒后自行消失 | 请求本身、错误语义判断 |
| `BaseModal` | 模态浮层：遮罩（`--nw-color-overlay`）、`Esc` 关闭、滚动锁定 | 表单内容 |
| `AudioOrb` | 声音主体（球体 + 频谱 + 轨道）：首页中央与播放页封面 | 页面尺寸（由父级 viewBox / 容器决定） |
| `AudioWave` | 环形音波：功能选择页中央、播放页「纯聆听模式」的封面 | 页面构图 |
| `PageBackdrop` | 除首页外所有页面的统一背景：静态图（`studio-select-bg.jpg`）+ 竖向渐变压暗 + 站内暗角 | 前景内容与交互（整体 `aria-hidden`、`pointer-events: none`） |

**异形面板的实现方式**：`FeaturePanel` 用同一个几何函数生成三层 `clip-path` 梯形
（外描边 → 内阴影环 → 玻璃填充）叠合，因此轮廓始终是梯形而不是圆角卡片。
几何约束写在组件注释里：内边缘的上下端点必须错开，否则四点共线会退化成矩形。

组件视觉全部来自语义化令牌，因此日间模式接入时**无需修改组件**。

### 6.1 接口调用与反馈约定（全站统一）

| 环节 | 约定 | 落点 |
| --- | --- | --- |
| 请求 | 只走 `src/services/*`，`try/catch` 在 service / store 层收口，统一转成 `lastError` / `error` | `services/api.ts`、`stores/studio.ts`、`stores/player.ts` |
| 成功反馈 | 一律 `ToastPill` 可见提示（如「资源已新增」「场景已就绪：SCENE_X」） | 各页面 `notify()` |
| 失败反馈 | 提示条 + 必要的页内错误面与「重试」；未接后端时说明「后端接口待接入：…」，不假装成功 | 各页面 + 状态面板 |
| 加载态 | 提交按钮 `:loading` → 置灰 + 显示 `loading-label`（「生成中…」「保存中」等）+ 转圈，且期间不可重复提交 | `AppButton` + 各表单 |
| 无障碍 | 结果同时写入 `role="status"` 区域（欢迎页）或由可见提示条承担 | `WelcomeView` 等 |

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
| 触发条件 | `VITE_API_MOCK` 不是 `false`（默认 `true`）。`VITE_API_BASE_URL` 只是可选的基址覆盖，不再是判定条件 |
| 数据来源 | `src/services/mock/studioBackend.ts` 的内存假后端；刷新页面即回到初始状态 |
| 音频 | `src/services/mock/silentAudio.ts` 在前端合成的**静音 WAV**，不播放任何真实音频 |
| 数据来源 | `src/services/mock/studioBackend.ts` 的假后端 |
| **持久化** | 假后端把资源 / 配音 / 锚点 / 已生成的场景图写进 `localStorage`（键 `nw-demo-backend-v1`），**刷新后仍在**；写入失败（隐私模式、配额满）自动降级为「仅内存」 |
| 音频 | `src/services/mock/silentAudio.ts` 在前端合成的**静音 WAV**，不播放任何真实音频；刻意不持久化（object URL 刷新即失效），装载时按台词长度重新合成 |
| 播放页 | `audioUrl` 指向那段静音音频，因此进度条、字幕、声波动画仍由**真实 `<audio>` 的 `currentTime`** 驱动 |
| 刷新播放页 | 已生成的场景图也在 `localStorage` 里，刷新后照常播放；只有**未知 sceneId** 才由 `mock/demoScenes.ts` 的兜底剧情图接管（含 2 条分支，可演示换场） |
| 界面提示 | 相关页面显示「演示模式」标记（`components/base/DemoModeBadge.vue`），接后端后自动消失 |
| 契约保真 | 假后端严格保持契约的**信息量**：例如 `GET /properties` 同样只回 `{ nodeId, name, type }`，绝不偷偷补上描述字段 —— 因此刷新后资源卡片会显示「列表接口未返回描述」，这正是真实后端下的表现 |
| 音频驱动 | 页面**没有**为演示模式写任何播放分支：换场、队列、字幕、分支全部走与真实后端相同的代码路径 |

**为什么假数据必须收口在 `services/` 层**：页面与 store 只认「调用这个函数会拿到契约形状的数据」，
不关心数据从哪来。因此接入真实后端时，store 与所有组件零改动。

前端已预留规范的调用层与类型定义，**未实现任何后端逻辑**。

| 动作 | 方法 | 路径 | 入参 | 出参 |
| --- | --- | --- | --- | --- |
| 进入 | POST | `/api/v1/welcome/enter` | `{ locale: string }` | `{ success, data: { accepted, redirectUrl? } }` |
| 教程 | POST | `/api/v1/welcome/tutorial` | `{ locale: string }` | 同上 |
| 资源 / 锚点 / 生成 / 导出 | POST·PUT·DELETE | `/api/v1/resources`、`/api/v1/plan/*` 等 | 见 `services/studio.ts` | `{ code, data }` 信封 |
| 取播放场景 | GET | `/api/v1/play/scene/{sceneId}` | 路径参数 | 场景对象（契约示例为**裸对象**，也兼容 `{ code, data }`） |

播放域的取舍写在 `stores/player.ts` 与 `pages/PlayerView.vue` 头部注释里，要点：

- `edges` 是分支数组（**不是 `choices`**），每个 `edge.targetScene` 已带全下一层数据，
  点分支**无需再请求**即可开播（契约要求的「零延迟」）；
- 但后端对嵌套层标了 `@JsonIgnoreProperties("edges")`，嵌套 `edges` 恒为空，
  因此开播后前端会**补拉一次该场景**，把它的分支取回来；
- 契约未提供逐句时间戳，字幕按句长比例分配音频时长，界面标注「按句长估算」；
  后端补上 `subtitles` 字段后会自动改用真实时间轴。

接入步骤（本仓库的 `frontend/.env.local` 已按此配好）：

```bash
cp .env.example .env.local
# 编辑 .env.local：通常只改这一个开关
#   VITE_API_MOCK=false      # 关闭 Mock（唯一开关；不写仍是演示模式）
#   VITE_API_BASE_URL=       # 留空 = 与前端同源：开发态由 vite.config.ts 的 /api 代理转发到 8080
```

**已接入的真实接口**（后端 `mid` 模块的 `PropertyController` / `VoiceController` / `PEngineController`）：
资源新增 / 列表、配音保存 / 查询、锚点保存、插值生成。统一响应体是 `{ code, msg, data }`
（成功码 200，说明字段名是 `msg`），由 `services/api.ts` 的 `requestCodeJson` 解包。

**后端尚未实现的接口仍走 Mock**（前端用开关显式登记，后端没有的先不管）：

| 未接入的接口 | 前端开关 | 影响 |
| --- | --- | --- |
| `PUT / DELETE /api/v1/properties/{nodeId}` | `services/studio.ts` 的 `BACKEND_READY.updateProperty / deleteProperty` | 资源的「编辑 / 删除」 |
| `POST /api/v1/plan/export-segment` | `BACKEND_READY.exportSegment` | 片段导出（成品仍是本地静音音频） |
| `GET /api/v1/play/scene/{sceneId}` | `BACKEND_READY.playScene` | 播放页的场景图与音频 |
| `POST /api/v1/welcome/*` | `services/welcome.ts` 的 `WELCOME_BACKEND_READY` | 欢迎页「进入 / 教程」 |

后端补上这些接口后，把对应开关改成 `true`（欢迎域在 `welcome.ts` 里改），再删掉该处的 Mock 分支
即可自动切到真实请求。**UI 层无需任何其它改动** —— 演示模式与真实后端共用同一套字段收敛
（`readPlayScene`）与错误处理。

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
2. **故事库与音频创作页尚未开发**：`ResourcesView.vue` 是**带明确说明的占位页**
   （写明「开发中」并提供返回入口，不是空白页）；`CreateView.vue` 已无路由指向
   （`/create` 重定向到 `/studio`），可随时删除。
3. **「教程」未接入引导流程**：目前只完成请求调用与状态反馈，不做无依据的跳转。
4. **部分后端接口尚未接入**：见上一节。本仓库的 `.env.local` 已把 `VITE_API_MOCK` 置为 `false`，
   因此**后端已实现的接口走真实请求**，其余（改删资源、导出、播放、欢迎域）仍走**演示模式**：
   这些页面的数据存在浏览器 `localStorage` 里（刷新仍在），播放页放的是前端合成的静音音频
   （界面保留「演示模式」标记，不假装是真实音频）。后端补上后按 8.1 的步骤把开关改为 `true` 即可。
5. **日间模式未开发**：`day.css` 为空说明文件，`useTheme.ts` 的解析当前恒定为夜间；
   主界面右上角的「切换主题」只给提示、不做真实切换。
6. `GlassPanel` 已被创作台与播放页多处使用（字幕窗口、控件、分支卡、状态面板）。
7. 部分令牌为后续页面预留（字号 / 间距 / 圆角梯度、状态色、`--nw-z-modal` 等），
   在源文件中以「预留」注释标注，当前页面不消费。
8. 未在 Safari / Firefox 真机验证；`backdrop-filter` 已有 `@supports` 降级，
   槽形与梯形 `clip-path`、字幕窗口的 `mask-image` 渐隐已在 Chromium 内核实测。
9. 路由使用 HTML5 History 模式：若部署到静态服务器，需为未知路径配置 `index.html` 回退。
10. 无 ESLint / Prettier / 单元测试配置。
11. **播放域待后端确认**：`GET /play/scene/{sceneId}` 是否使用 `{ code, data }` 信封
    （契约示例是裸对象，前端两种都认）；播放域没有字幕时间戳字段。
12. **资源节点的「编辑 / 删除」后端尚未实现**：`PUT / DELETE /properties/{nodeId}`
    的路径与回执形状是前端按 REST 惯例假定的。这一对按钮**始终**由假后端实现
    （见 `services/studio.ts` 的 `BACKEND_READY`），因此接入后端后按钮仍可用、不会报错；
    后端补上接口时把开关改为 `true`。
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
