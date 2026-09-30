# GAudio 官方文档：原型绘制前置规划

> 状态：原型前的页面基础能力基线  
> 关联规划：[`official-docs-feature-plan.md`](./official-docs-feature-plan.md)  
> 目标：先确定全站能力、状态和规则，再绘制具体页面

## 1. 已确认的设计前提

以下内容来自当前产品讨论，后续原型默认遵守：

| 项目 | 已确认内容 |
| --- | --- |
| 产品 | GAudio 官方文档 |
| 核心用户 | 第一次接触 GAudio 的前端开发者 |
| 首要任务 | 安装 GAudio，并找到一段可直接使用的示例代码 |
| 设备策略 | 响应式设计，桌面端优先 |
| 主色 | Tailwind Violet 紫罗兰色系 |
| 主题 | 同时设计 Light Theme 和 Dark Theme |
| 代码区 | Light Theme 使用偏亮代码块/终端；Dark Theme 使用深色代码块/终端 |
| 原型留痕 | 无法静态表现的交互、响应式、数据和实现规则必须以画板批注保留 |

## 2. 原型前必须解决的五类问题

页面原型不能只确定“长什么样”，还要同时回答：

1. **全站状态**：语言、主题、版本、包管理器偏好如何选择和保存。
2. **信息到达**：用户如何通过导航、搜索、目录和上下页找到内容。
3. **内容交互**：代码如何复制、切换、溢出和反馈；Demo 如何加载和失败。
4. **设备变化**：桌面、平板、手机上的导航、目录、表格和代码如何变化。
5. **不可见规则**：SEO、键盘操作、持久化、加载、异常等如何在原型中批注。

## 3. 全站基础功能清单

### 3.1 语言切换

#### 推荐方案

- 首发按 **简体中文（zh-CN）+ English（en）** 两种语言规划信息架构。
- URL 必须包含语言，例如 `/zh-CN/...` 和 `/en/...`，确保页面可分享、可索引、可返回。
- 首次访问可参考浏览器语言推荐版本，但不在用户已经选择后自动跳转。
- 用户主动选择的语言保存到本地，后续访问优先使用该选择。
- 切换语言时尽量停留在同一内容页；对应翻译不存在时进入该语言首页并显示提示。

#### 内容规则

- API 名称、类名、方法名、事件名和错误码不翻译。
- 普通解释文字、导航、按钮、提示和排障内容翻译。
- 代码内容保持一致，注释可跟随页面语言。
- HLS、DASH、Media Session、Analyzer 等技术名词首次出现时给出简短解释，后续保持术语一致。
- 页面需要显示翻译状态：已同步、翻译待更新或仅英文可用。

#### 原型必须绘制

- Header 中的语言切换入口。
- 语言菜单展开态。
- 当前语言选中态。
- 手机端语言入口。
- “当前页面暂无该语言版本”的提示状态。

#### 原型批注

- 首次访问的语言判断顺序。
- URL 映射规则。
- 用户选择的持久化方式。
- 翻译缺失时的回退路径。
- SEO 的 `hreflang` 和 canonical 规则。

### 3.2 主题切换

#### 推荐方案

- 提供 **Light / Dark / System** 三种模式。
- 首次访问默认跟随系统。
- 用户主动选择后保存偏好，并覆盖系统设置。
- 系统主题变化时，只有处于 System 模式的页面跟随变化。
- 页面首次渲染前读取主题，避免先亮后暗或先暗后亮的闪烁。

#### 视觉规则

- Light 与 Dark 使用各自完整的语义 Token，不采用简单颜色反相。
- Light 代码块和终端保持偏亮背景，不能直接复用 Dark 的深色表面。
- 语法高亮、边框、选中、Hover、Focus、禁用和警告状态都需要双主题定义。
- 图表、波形、频谱、图片和第三方 Demo 需要检查双主题适配。
- 状态不能只靠颜色表达，必须同时使用文字、图标或结构差异。

#### 原型必须绘制

- Light 页面正常态。
- Dark 页面正常态。
- 主题菜单展开态，包含 Light、Dark、System。
- 当前主题选中态。
- 两种主题下的代码块、终端、提示框和表格。

#### 原型批注

- 首次主题判断与持久化逻辑。
- System 模式监听规则。
- 防主题闪烁要求。
- 操作系统或浏览器不支持时的回退。
- 减少动态效果模式对主题过渡的影响。

### 3.3 全站搜索

#### 基础能力

- Header 提供始终可发现的搜索入口。
- 支持键盘快捷键打开，例如 `⌘K / Ctrl K`。
- 搜索范围覆盖指南、配方、API 符号、事件名和错误码。
- 搜索结果显示标题、所属分区、简短摘要和命中片段。
- 搜索索引按语言隔离，避免中英文结果混杂。
- 如果未来维护多版本，搜索还要受当前版本约束。

#### 必须考虑的状态

- 搜索入口默认态。
- 搜索弹层初始态。
- 输入中与加载态。
- 有结果态。
- 无结果态。
- 搜索服务失败态。
- 键盘选中结果态。

#### 原型批注

- 键盘打开、关闭和上下选择规则。
- 搜索是否保存历史；首版建议不保存或只保存在本地。
- 移动端是全屏搜索页还是全屏 Dialog；建议全屏 Dialog。

### 3.4 版本与发布状态

#### 推荐方案

- Header 或公告条显示当前 GAudio 版本和发布状态。
- 当前包为预发布渠道时，持续显示清晰但不过度打扰的 `next` 标识。
- 首版没有历史版本文档时，只显示版本信息，不伪造可切换的版本列表。
- 一旦开始维护多个版本，再启用 Version Switcher，并让版本进入 URL。

#### 原型必须绘制

- 当前版本徽标。
- 预发布说明条或提示框。
- 未来 Version Switcher 的预留位置，不需要首版实现完整菜单。

#### 原型批注

- 多版本启用条件。
- 旧版本、最新稳定版和 next 的跳转规则。
- 搜索和语言如何继承当前版本。

### 3.5 包管理器切换

- 安装命令支持 pnpm、npm、yarn、bun 标签切换。
- 用户选择在所有安装代码块中同步，并保存到本地。
- 切换只改变命令，不改变周围说明和依赖含义。
- HLS/DASH 示例必须同步展示可选依赖安装命令。

原型需要展示默认态、切换态、复制成功态，以及手机端标签溢出处理。

### 3.6 导航系统

#### 全局 Header

- GAudio Logo/品牌入口。
- 一级导航：开始、指南、自适应流、配方、排障、API。
- 全站搜索。
- 语言切换。
- 主题切换。
- 版本状态。
- Repository 外链。
- 手机端菜单入口。

#### 文档侧边栏

- 展示当前分区的章节树。
- 支持展开/收起分组。
- 当前页面高亮。
- 显示尚未阅读不是首版必需功能。
- 切换页面后保持合理的展开状态和滚动位置。

#### 页内目录

- 桌面宽屏显示右侧 TOC。
- 滚动时跟随当前标题。
- 中等屏幕收起为页面顶部目录按钮。
- 手机端进入内容区顶部，不使用永久右栏。

#### 辅助导航

- Breadcrumb：显示当前位置，不代替页面标题。
- 上一页/下一页：支持连续学习。
- 标题锚点：用于复制段落深链接。
- Skip Link：键盘用户可以跳过重复导航直接进入正文。

### 3.7 代码与终端功能

#### 代码块

- 语言标签。
- 复制按钮及复制成功反馈。
- 行高亮与文件名标签。
- 长代码横向滚动；手机端不撑破页面。
- 可选择自动换行，但命令和代码默认保持原始格式。
- Light 与 Dark 各自拥有可读的代码背景和语法色。
- 明确区分“可直接复制”“片段”“伪代码”。

#### 终端模拟

- Light Theme 使用浅色终端，不与 Dark Theme 共用深色底。
- 显示命令提示符，但复制时不包含提示符。
- 成功、警告、错误输出需要文字与颜色共同区分。
- 终端内容较长时支持内部滚动或折叠。

#### 代码标签页

- 包管理器标签和代码方案标签需要区分层级，避免两组 Tabs 混淆。
- Tabs 必须支持键盘方向键切换。
- 当前选择需要明确的文字和 Focus 状态。

### 3.8 页面阅读功能

- 页面标题、摘要、适用版本和预计阅读时间。
- 最后更新日期仅在能可靠维护时展示。
- 正文最大行宽，避免桌面大屏文字过长。
- 标题层级清晰且唯一 H1。
- 表格支持横向滚动，重要第一列可在需要时固定。
- 外部链接有可感知标识，并说明是否离开文档站。
- 页面底部提供“上一页、下一页、报告问题”。
- API 页面提供返回相关指南和配方的入口。

### 3.9 页面反馈

- “这页有帮助吗？”作为轻量反馈入口。
- “报告文档问题”携带页面路径、语言和版本，不携带私人数据。
- “编辑此页”是否提供取决于仓库协作策略，原型先预留位置。
- 成功、取消、提交失败都需要状态。

### 3.10 响应式与设备能力

#### 推荐断点行为

| 视口 | 页面结构 |
| --- | --- |
| `≥ 1280px` | 左侧导航 + 主内容 + 右侧 TOC 三栏 |
| `768–1279px` | 左侧导航 + 主内容；TOC 收起 |
| `< 768px` | 单栏；导航和 TOC 均使用临时抽屉/弹层 |

断点数值是首轮原型基线，最终应依据内容挤压情况调整，而不是机械服从设备名称。

#### 原型至少覆盖的画板宽度

- 1440px：桌面主要设计画板。
- 1024px：平板横屏/小型桌面压缩状态。
- 390px：手机主要设计画板。

#### 重点适配对象

- Header 导航拥挤。
- 左侧导航和右侧 TOC 的收起方式。
- 代码块、终端和表格的横向溢出。
- API 长类型签名。
- 搜索弹层和语言/主题菜单。
- 多列卡片回落为单列。
- 按钮触控尺寸和标题锚点位置。

### 3.11 无障碍基础

- 所有交互可通过键盘完成。
- Focus 状态明显，不能只依赖浏览器默认状态是否恰好可见。
- Icon Button 必须有可访问名称和 Tooltip。
- 菜单、Tabs、Dialog、Drawer 使用正确语义和焦点管理。
- 页面具有 Skip Link 和合理的标题结构。
- Light/Dark 的正文、弱文字、链接、代码和状态色均满足对比度要求。
- 支持 `prefers-reduced-motion`。
- 复制成功等短暂反馈同时提供可被辅助技术感知的状态。
- 音频 Demo 不自动播放；播放状态不能只靠动画表达。

### 3.12 性能与加载

以下大部分不会直接画在静态页面中，但必须批注：

- 文档外壳首屏不加载 hls.js 或 dashjs。
- 音频 Demo、波形和大型代码示例按需加载。
- 主题在首屏前确定，减少闪烁和布局变化。
- 搜索索引按需要加载，不阻塞主内容阅读。
- 字体加载提供回退，避免大幅布局跳动。
- 页面切换保留基础壳层，正文显示加载反馈。
- 弱网络和资源失败时，文档正文仍可阅读。

### 3.13 SEO、分享与链接

- 每页具有唯一标题和描述。
- 中英文页面建立双向语言声明。
- API、错误码和事件名拥有稳定 URL。
- 标题锚点可复制并在打开后定位。
- 分享 URL 保留语言和版本，不需要保留主题。
- 404 页面提供搜索、返回首页和主要分区入口。
- 改名或移动页面时规划重定向，避免旧链接失效。

## 4. 页面基础骨架

### 4.1 桌面文档页

```text
Announcement / Version status
Global Header
├── Left Sidebar
├── Main Content
│   ├── Breadcrumb
│   ├── Title + Summary + Metadata
│   ├── Article Content
│   ├── Page Feedback
│   └── Previous / Next
└── Right Table of Contents
Footer
```

### 4.2 手机文档页

```text
Compact Header
├── Menu Drawer trigger
├── Brand
├── Search
└── Theme trigger
Main Content
├── Breadcrumb / Back link
├── Page title
├── Collapsible page TOC
├── Article content
├── Feedback
└── Previous / Next
Footer
```

手机端语言、版本和 Repository 入口放入 Menu Drawer，避免 Header 堆叠过多图标。

## 5. 基础组件清单

### 5.1 全局与导航

- AnnouncementBar。
- GlobalHeader。
- DesktopSidebar。
- MobileNavigationDrawer。
- TableOfContents。
- Breadcrumb。
- PreviousNextNavigation。
- Footer。
- LanguageSwitcher。
- ThemeSwitcher。
- VersionBadge / VersionSwitcher。
- GlobalSearch / SearchDialog。

### 5.2 控件

- Button。
- IconButton。
- TextLink。
- Menu / Select。
- Tabs。
- SegmentedControl。
- SearchInput。
- Dialog。
- Drawer。
- Tooltip。
- Badge。
- CopyButton。

### 5.3 内容组件

- PageHeader。
- ProseTypography。
- HeadingAnchor。
- Callout：Note、Tip、Warning、Danger、Browser、SSR、CORS、Experimental。
- CodeBlock。
- TerminalBlock。
- PackageManagerTabs。
- Steps。
- FeatureCard / LinkCard。
- DataTable。
- API Signature。
- ParameterTable。
- EventTable。
- ErrorCodeCard。
- StateTimeline。
- InlineCode。
- Divider。
- EmptyState。

### 5.4 GAudio 专用内容组件

- InstallCommand。
- PlayerLifecycleDiagram。
- AudioDemoShell。
- PlayerControlsDemo。
- BufferRangeVisualization。
- AdaptiveImplementationBadge。
- VariantList / QualitySelector。
- EventLog。
- ErrorDiagnosticPanel。
- FrequencyVisualizer。
- WaveformVisualizer。

这些组件先在原型中验证信息和状态，不代表第一版全部需要实现成交互 Demo。

## 6. 首轮原型必须包含的页面模板

| 模板 | 用途 | 必须表现的关键能力 |
| --- | --- | --- |
| 首页 | 理解价值并进入上手 | Header、搜索入口、语言、主题、Quick Start CTA、入口卡片 |
| 快速开始 | 安装并复制第一段代码 | 包管理器 Tabs、步骤、代码复制、Callout、上下页 |
| 核心指南 | 理解生命周期 | 左导航、右 TOC、图示、事件/状态内容 |
| HLS/DASH 指南 | 安装可选依赖并配置 Adapter | 安装命令、策略/预设、警告、代码示例 |
| API 参考 | 查符号和参数 | 签名、参数表、返回值、错误、相关指南 |
| 错误码页面 | 从错误快速恢复 | 错误码、原因、检查步骤、恢复方式、相关 API |
| 搜索弹层 | 跨内容查找 | 初始、有结果、无结果、键盘选中 |
| 404 | 从失效链接恢复 | 搜索、首页和主要分区入口 |

## 7. 全局状态矩阵

| 状态 | 默认规则 | 是否进入 URL | 是否持久化 | 原型表现 |
| --- | --- | --- | --- | --- |
| 语言 | 首次参考浏览器，之后尊重用户选择 | 是 | 是 | 菜单正常态 + 展开态 + 缺失翻译态 |
| 主题 | System | 否 | 是 | Light + Dark + 三选项菜单 |
| 文档版本 | 当前发布版本 | 多版本后是 | 建议是 | 当前版本徽标 + 预留切换入口 |
| 包管理器 | pnpm，可后续调整 | 否 | 是 | Tabs 默认态 + 切换态 |
| 搜索查询 | 空 | 否 | 否 | 初始、加载、结果、无结果、失败 |
| 侧边栏展开 | 当前分区展开 | 否 | 当前会话即可 | 展开、收起、当前页 |
| 页内目录 | 根据视口显示 | 否 | 否 | 右栏、折叠入口、当前标题 |
| 代码复制 | 未复制 | 否 | 否 | 默认、Hover、Focus、Copied、失败 |
| Demo 加载 | 未启动或按需加载 | 否 | 否 | 未加载、加载、可播放、失败、不支持 |

## 8. 原型状态不能遗漏

### 每个交互控件

- Default。
- Hover。
- Focus Visible。
- Active/Pressed。
- Selected。
- Disabled（仅确实存在不可用场景时）。
- Loading（仅异步控件）。
- Error（仅可能失败的交互）。

### 全站关键组合态

- Light + 中文 + 桌面。
- Dark + English + 桌面。
- System Theme 菜单展开。
- 搜索弹层有结果和无结果。
- 手机导航抽屉展开。
- 手机代码块横向滚动。
- 翻译缺失提示。
- 预发布版本提示。
- Demo 不支持当前浏览器。
- Demo 资源加载失败。

不需要把每一种排列组合都画成完整页面；基础组件状态板加关键页面组合即可。

## 9. 画板批注规范

### 9.1 为什么需要批注

静态原型无法可靠表达持久化、键盘操作、系统主题监听、URL 映射、响应式切换、加载和错误恢复。遗漏这些信息会让实现者自行猜测，因此必须在画板中留下明确记录。

### 9.2 批注类型

| 前缀 | 类型 | 示例 |
| --- | --- | --- |
| `I` | Interaction | 点击主题按钮打开三选项菜单 |
| `R` | Responsive | 小于 768px 时侧边栏进入 Drawer |
| `S` | State | 复制成功反馈保持约 2 秒后恢复 |
| `D` | Data/Content | API 名称不翻译，说明文字翻译 |
| `A` | Accessibility | 打开 Dialog 后焦点进入搜索输入框 |
| `T` | Technical | 主题在首屏渲染前读取，避免闪烁 |
| `O` | Out of scope | 首版不提供历史版本切换 |

### 9.3 画板表现规则

- 在 Foundations 区增加统一的 `Prototype Notes Legend`。
- 批注使用独立于产品 UI 的非产品色，例如琥珀色，并标明“不进入产品 Token”。
- 每条批注具有唯一编号，例如 `I-01`、`R-03`。
- 批注放在目标画板外侧，与目标组件就近对齐。
- 不只依赖连线；批注文字要直接写清目标组件名称。
- 不能把重要规则只写在图层名中。
- 同一条全局规则在 Foundations 记录一次，页面只引用编号。
- 页面特有规则必须留在对应页面旁边。
- 已确认、待确认和暂不实现使用不同的文字标签，而不只靠颜色区分。

## 10. 原型文件建议分区

```text
00 Cover & Scope
01 Foundations
   ├── Color / Typography / Spacing
   ├── Light Theme
   ├── Dark Theme
   └── Prototype Notes Legend
02 Global Components
   ├── Header & Navigation
   ├── Language / Theme / Version
   ├── Search
   ├── Buttons & Menus
   └── Code / Terminal / Callouts
03 Page Templates
   ├── Home
   ├── Quick Start
   ├── Guide
   ├── API Reference
   └── Error Reference
04 Responsive States
   ├── 1440 Desktop
   ├── 1024 Compact
   └── 390 Mobile
05 Interaction States
   ├── Language menu
   ├── Theme menu
   ├── Search dialog
   ├── Mobile navigation
   └── Copy / Demo states
06 Prototype Notes & Decisions
```

## 11. 画原型前的决策清单

### 已经可以直接采用

- 桌面优先，补 1024 和 390 响应式状态。
- Tailwind Violet 作为品牌主色。
- Light / Dark / System 三种主题模式选择模型。
- Light 主题代码块和终端使用亮色表面。
- 全局 Header 包含搜索、语言、主题和版本状态。
- 画板使用编号批注表达不可见规则。
- Quick Start 是首轮最重要页面。

### 仍需产品确认，但不阻塞基础组件绘制

1. 中英文是否同时首发，还是先完成一种语言后再翻译。
2. 默认语言是根据浏览器自动推荐，还是固定 English/中文。
3. 当前阶段是否只展示 `next`，还是同时保留 stable 文档。
4. 是否首版接入真实搜索服务，还是先做本地索引。
5. 是否提供可直接播放的在线 Demo，以及示例媒体由谁长期托管。
6. Repository、编辑页面和反馈分别跳转到哪里。
7. 是否收集匿名搜索和反馈数据。

## 12. Foundations 完成标准

进入具体页面绘制前，基础区至少应完成：

- Light 和 Dark 两套语义颜色。
- Typography、Spacing、Radius、Border、Shadow、Focus Ring。
- Header、Sidebar、TOC 和 Footer 骨架。
- 语言、主题、搜索、版本、包管理器五类全局控件。
- Button、Link、Menu、Tabs、Dialog、Drawer 基础状态。
- Code、Terminal、Callout、Table 的双主题状态。
- 桌面、压缩桌面和手机三种布局规则。
- Prototype Notes Legend 和第一组全局批注。
- Quick Start 页面所需的最小组件集合。

满足这些条件后，才适合开始绘制首页、Quick Start 和 API 页面；否则页面之间很容易出现重复决策和交互不一致。
