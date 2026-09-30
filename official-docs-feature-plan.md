# GAudio 全新官方文档功能规划

> 状态：从零规划基线  
> 规划日期：2026-08-21  
> 唯一事实来源：`packages/gaudio/`

配套原型前置规划：[`official-docs-prototype-foundations.md`](./official-docs-prototype-foundations.md)

## 1. 规划边界

本规划只从 GAudio 核心包的公开导出、类型、实现契约和测试行为中推导内容，不参考或复用旧文档站的页面结构、路由、组件、文案和视觉设计。

### 纳入范围

- `gaudio` 核心入口。
- `gaudio/hls` HLS 入口。
- `gaudio/dash` DASH 入口。
- 核心包公开类型和可观察行为。
- 核心包测试已经验证的生命周期、并发、异常和清理语义。
- 为帮助前端开发者理解、安装、使用和排障而必须具备的文档站功能。

### 不纳入范围

- 旧文档站现有的信息架构和页面。
- 旧代码中已有但无法从 `packages/gaudio/` 证明的产品功能。
- 云端音频托管、转码、CDN、账号、控制台等 GAudio 核心包未提供的服务。
- 把第三方播放器库的全部配置复制成 GAudio 文档。
- 尚未进入公共入口的内部实现细节。

## 2. 标记与优先级

功能清单使用三种来源标记：

- **LIB**：直接来自 GAudio 的公共接口或已验证行为，是文档内容的事实基础。
- **DOCS**：文档产品为了降低学习、查找和排障成本而需要提供的能力。
- **DECISION**：不能由核心包决定，需要后续产品决策的事项。

优先级定义：

- **P0**：首版必须具备，否则无法完成“安装并找到可直接使用的示例代码”。
- **P1**：正式版完整体验，应紧随 P0 完成。
- **P2**：提升效率和生态扩展能力，可在内容稳定后建设。

## 3. 文档产品目标

### 核心用户

第一次接触 GAudio、具备 JavaScript 或 TypeScript 基础的前端开发者。

### 核心任务

1. 判断 GAudio 是否适合当前音频场景。
2. 安装正确的包和可选依赖。
3. 复制一段最小示例，在浏览器中成功播放第一个音频。
4. 根据场景继续完成 HLS、DASH、播放列表、音轨、Media Session 或分析器接入。
5. 遇到问题时，通过状态、事件和错误码定位原因。

### 首版成功标准

- 用户从首页最多两次导航即可到达可运行的最小示例。
- 安装示例能明确区分普通媒体、HLS 和 DASH 所需依赖。
- 每个公开入口都有独立的安装说明和最小示例。
- 每段核心示例均经过 TypeScript 校验；可运行示例经过浏览器验证。
- 每个稳定错误码都能搜索到解释、常见原因和处理建议。
- API 参考能说明默认值、前置条件、异常、生命周期和释放要求，而不只是罗列类型签名。

## 4. 内容组织原则

### 4.1 按用户任务组织，而不是按源码目录组织

GAudio 的公共 Module 是一个较小的 Interface，内部隐藏了加载、路由、适配、取消、资源所有权和清理等复杂 Implementation。官方文档应首先解释用户可观察到的契约：

- 输入是什么。
- 调用顺序有什么要求。
- 状态如何变化。
- 何时产生事件。
- 可能抛出什么错误。
- 谁拥有资源、何时释放。
- 哪些是扩展 Seam，哪些类不支持继承。

### 4.2 指南、配方和 API 参考分工明确

- **指南**解释概念和正确心智模型。
- **配方**解决一个具体任务，代码应可直接复制。
- **API 参考**完整描述公共 Interface。
- **排障**从症状、状态、事件或错误码反向定位问题。

### 4.3 不泄漏不稳定实现

文档可以解释行为和约束，但不把私有类、内部字段、调度细节或测试辅助方法当作公共能力承诺。

## 5. 推荐信息架构

| 一级区域 | 用户问题 | 主要内容 | 首版 |
| --- | --- | --- | --- |
| 首页 | GAudio 是什么，能解决什么？ | 价值说明、三类入口、最短上手路径 | P0 |
| 快速开始 | 如何安装并播放第一个音频？ | 安装、基础示例、运行环境、常见阻塞 | P0 |
| 核心指南 | Player、Source、状态和事件如何协作？ | 生命周期、控制、设置、资源管理 | P0 |
| 自适应流 | HLS/DASH 如何接入和配置？ | 适配器、策略、预设、清晰度、流事件 | P0 |
| 功能指南 | 如何完成进阶播放体验？ | 播放列表、备用源、音轨、Media Session、分析器 | P1 |
| 配方 | 某个具体功能能否直接复制？ | 单任务、可运行代码 | P0/P1 |
| 排障 | 为什么不能播放或行为不符合预期？ | 症状诊断、错误码、事件观察、浏览器能力 | P0 |
| API 参考 | 某个符号的完整契约是什么？ | 三个入口、类型、方法、事件、错误 | P0 |
| 兼容性与版本 | 当前版本适用于什么环境？ | 运行时要求、可选依赖、预发布状态、变更记录 | P0 |
| 扩展 GAudio | 如何接入自定义能力？ | Source、Engine、Adapter、Analyzer 扩展 Seam | P1 |

## 6. 全新功能清单

### 6.1 首页与入口

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| HOME-01 | 一句话产品定位 | DOCS | P0 | 明确这是浏览器优先、TypeScript 友好的音频播放与流媒体库 |
| HOME-02 | 核心能力概览 | LIB | P0 | 覆盖普通媒体、HLS、DASH、播放列表、音轨、Media Session、分析器 |
| HOME-03 | “开始使用”主入口 | DOCS | P0 | 直接进入最短安装与播放路径 |
| HOME-04 | 可复制的最小示例 | LIB + DOCS | P0 | 只使用 `gaudio` 公共入口，包含创建、播放和释放 |
| HOME-05 | 场景入口卡片 | DOCS | P0 | 普通音频、HLS、DASH 三条路径清晰分流 |
| HOME-06 | 包状态提示 | LIB | P0 | 展示当前版本及预发布状态，避免用户误判稳定性 |
| HOME-07 | 能力边界说明 | LIB | P1 | 明确 GAudio 不负责音频托管、转码和 DRM 服务 |
| HOME-08 | 兼容性快捷入口 | DOCS | P1 | 链接到浏览器能力和 SSR 说明 |

### 6.2 安装与快速开始

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| START-01 | 包管理器安装切换 | DOCS | P0 | 支持 pnpm、npm、yarn、bun 命令切换与复制 |
| START-02 | 核心包安装说明 | LIB | P0 | 只播放普通媒体时不要求安装 HLS/DASH 依赖 |
| START-03 | HLS 可选依赖说明 | LIB | P0 | 明确使用 `gaudio/hls` 时需要 `hls.js`，并说明按需加载 |
| START-04 | DASH 可选依赖说明 | LIB | P0 | 明确使用 `gaudio/dash` 时需要 `dashjs`，并说明按需加载 |
| START-05 | 三种最小示例 | LIB | P0 | 分别提供普通媒体、HLS、DASH 可复制示例 |
| START-06 | 首次播放检查清单 | DOCS | P0 | 容器、浏览器环境、有效 URL、用户手势、CORS、释放步骤 |
| START-07 | 自动播放限制说明 | LIB | P0 | 解释 `PLAYBACK_BLOCKED` 与用户手势的关系 |
| START-08 | 客户端初始化说明 | LIB | P0 | SSR 项目只在客户端挂载后创建播放实例 |
| START-09 | TypeScript 使用基线 | LIB | P0 | 说明类型声明随包提供及最低工具链要求 |
| START-10 | 第一个完整播放器流程 | DOCS | P1 | 从加载、播放、暂停、进度到 dispose 的连续示例 |

### 6.3 核心概念与生命周期

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| CORE-01 | 模块关系图 | LIB + DOCS | P0 | 展示 AudioPlayer、AudioSource、AudioEngine、Adapter、Analyzer 的职责边界 |
| CORE-02 | Player 生命周期 | LIB | P0 | 覆盖 idle、loading、ready、playing、paused、buffering、ended、error |
| CORE-03 | 加载与播放顺序 | LIB | P0 | 说明 `play()` 必要时会先加载，`setSource()` 本身不加载 |
| CORE-04 | 更换音源语义 | LIB | P0 | 说明替换音源会取消旧工作并回到 idle |
| CORE-05 | 并发与取消语义 | LIB | P1 | 解释操作被后续操作取代时的 `LOAD_ABORTED` |
| CORE-06 | 释放与终态 | LIB | P0 | `dispose()` 后禁止继续操作，但只读查询保持安全 |
| CORE-07 | 清理重试说明 | LIB | P1 | 解释重复释放可继续完成未成功的清理工作 |
| CORE-08 | 资源所有权 | LIB | P1 | 说明 Blob URL、自定义 Source、Adapter 和 Engine 的释放责任 |
| CORE-09 | 生命周期事件时间线 | LIB + DOCS | P0 | 将 loadstart、loadedmetadata、canplay、play、playing 等按阶段呈现 |
| CORE-10 | 不变量与前置条件 | LIB | P0 | 每个主要操作说明允许状态、状态变化和失败方式 |

### 6.4 音源与协议路由

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| SOURCE-01 | 字符串 URL 音源 | LIB | P0 | 提供最简用法和适用范围 |
| SOURCE-02 | 结构化 URL 音源 | LIB | P0 | 解释 `url`、`protocol`、`mimeType` 的作用 |
| SOURCE-03 | `HttpAudioSource` 指南 | LIB | P1 | 明确它是 URL 包装，不提供请求头、凭据或令牌刷新 |
| SOURCE-04 | `BlobAudioSource` 指南 | LIB | P1 | 说明对象 URL 创建、所有权和撤销时机 |
| SOURCE-05 | 自定义 `AudioSource` 契约 | LIB | P1 | 覆盖 open、close、取消安全、幂等和失败后清理 |
| SOURCE-06 | 协议识别规则 | LIB | P0 | 说明显式协议、MIME、扩展名和未知类型回退 |
| SOURCE-07 | Adapter 缺失诊断 | LIB | P0 | 解释自适应流没有对应 Adapter 时的错误 |
| SOURCE-08 | 带鉴权音源的边界 | LIB | P1 | 说明需要自定义 Source 或业务侧签名 URL，不虚构核心包能力 |

### 6.5 播放控制与设置

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| PLAY-01 | 加载、播放、暂停、停止 | LIB | P0 | 说明方法效果和对应状态变化 |
| PLAY-02 | 精确跳转与快速跳转 | LIB | P0 | 区分 seek 和 fastSeek，说明浏览器能力差异 |
| PLAY-03 | 音量与静音 | LIB | P0 | 包含默认值、范围、事件 |
| PLAY-04 | 循环播放 | LIB | P1 | 包含默认值和结束行为 |
| PLAY-05 | 播放速度 | LIB | P1 | 包含 playbackRate 与 ratechange |
| PLAY-06 | 音调保持 | LIB | P1 | 说明 preservesPitch 是浏览器能力相关设置 |
| PLAY-07 | preload 与 autoplay | LIB | P0 | 列出默认值、适用场景和浏览器限制 |
| PLAY-08 | 时间与媒体状态查询 | LIB | P0 | currentTime、duration、paused、ended、seeking |
| PLAY-09 | 媒体时间范围 | LIB | P1 | buffered、seekable、played 的含义与示例 |
| PLAY-10 | 状态驱动 UI 配方 | LIB + DOCS | P1 | 使用状态和事件驱动按钮、进度条与加载提示 |

### 6.6 事件系统

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| EVENT-01 | 事件总览 | LIB | P0 | 按加载、播放、跳转、缓冲、设置、结束、错误分组 |
| EVENT-02 | 事件负载参考 | LIB | P0 | 每个事件列出 payload 类型与触发条件 |
| EVENT-03 | 状态变化事件 | LIB | P0 | 解释 statechange 与底层媒体事件的区别 |
| EVENT-04 | 订阅与取消订阅 | LIB | P0 | on、once、off/清理的完整示例 |
| EVENT-05 | 监听器异常隔离 | LIB | P1 | 说明单个监听器失败不会阻断同级监听器 |
| EVENT-06 | 事件调试记录器配方 | DOCS | P1 | 可复制代码输出时间、状态和关键事件 |
| EVENT-07 | 自适应流事件分组 | LIB | P0 | manifest、variant、segment、streamerror 独立呈现 |

### 6.7 HLS 自适应流

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| HLS-01 | HLS 最小接入 | LIB | P0 | 使用 `createHlsAdapter` 和 `gaudio/hls` 独立入口 |
| HLS-02 | 浏览器能力探测 | LIB | P0 | 展示 `isSupported`，区分原生 HLS 与 hls.js |
| HLS-03 | 播放策略选择 | LIB | P0 | 解释 native-first、hls-first、native-only、hls-only |
| HLS-04 | 内容类型 | LIB | P1 | 解释 vod、long-form、live 的配置意图 |
| HLS-05 | 预设选择 | LIB | P1 | FastStart、Balanced、Stable 的使用场景和权衡 |
| HLS-06 | 第三方配置覆盖 | LIB | P1 | 明确 `config` 是高级能力，避免成为首条上手路径 |
| HLS-07 | 运行时配置更新 | LIB | P1 | 解释 next-load 与 reload、恢复位置和恢复播放 |
| HLS-08 | reload 代价说明 | LIB | P1 | 明确缓冲、请求及估计/重试状态会丢失 |
| HLS-09 | 当前实现查询 | LIB | P1 | 说明 `implementation` 和 `hlsInstance` 的可用条件 |
| HLS-10 | 原生 HLS 限制 | LIB | P0 | 原生路径不承诺手动清晰度列表和 hls.js 实例 |

### 6.8 DASH 自适应流

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| DASH-01 | DASH 最小接入 | LIB | P0 | 使用 `createDashAdapter` 和 `gaudio/dash` 独立入口 |
| DASH-02 | 浏览器能力探测 | LIB | P0 | 展示 `isSupported` 和不支持时的处理 |
| DASH-03 | 内容类型 | LIB | P1 | 解释 vod、long-form、live |
| DASH-04 | 预设选择 | LIB | P1 | FastStart、Balanced、Stable 的使用场景和权衡 |
| DASH-05 | settings 覆盖 | LIB | P1 | 说明稀疏设置与深度合并语义 |
| DASH-06 | 运行时 settings 更新 | LIB | P1 | 说明 `getSettings`、`updateSettings` 和实例状态 |
| DASH-07 | dash.js 实例访问 | LIB | P1 | 说明 `dashInstance` 的可用条件与高级使用边界 |
| DASH-08 | SSR 与运行时注意事项 | LIB | P0 | 区分安全导入和第三方依赖被实际求值的环境要求 |

### 6.9 自适应质量与流信息

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| ADAPT-01 | 自适应播放信息 | LIB | P0 | 解释当前协议及其原生、hls.js 或 dash.js 实现 |
| ADAPT-02 | 清晰度列表 | LIB | P1 | 展示可选 variant 属性及可用性 |
| ADAPT-03 | 自动/手动质量切换 | LIB | P1 | 说明 auto 与 variant id 的切换方式 |
| ADAPT-04 | variant 排序警告 | LIB | P1 | 明确返回顺序不是质量等级排序 |
| ADAPT-05 | 清单加载事件 | LIB | P0 | 解释 manifestloaded 和更新场景 |
| ADAPT-06 | 分片事件 | LIB | P1 | 解释 segmentloadstart、segmentloaded 及用途 |
| ADAPT-07 | 流错误事件 | LIB | P0 | 区分可恢复流错误和 Player 终态错误 |
| ADAPT-08 | 直播状态 UI 配方 | LIB + DOCS | P1 | 展示 live 状态、可跳转范围和质量模式 |

### 6.10 播放列表、备用源与音轨

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| LIST-01 | 设置播放列表 | LIB | P1 | 解释列表结构、startIndex 和初始加载行为 |
| LIST-02 | 上一首、下一首、指定曲目 | LIB | P1 | 覆盖 next、previous、selectPlaylistTrack |
| LIST-03 | 播放结束自动前进 | LIB | P1 | 说明 ended 后的列表行为 |
| LIST-04 | 备用音源顺序尝试 | LIB | P1 | 解释 fallbackSources 顺序和失败处理 |
| LIST-05 | 列表元数据 | LIB | P1 | 说明 title、artist、album、artwork 与 Media Session 的关系 |
| TRACK-01 | 多语言/替代音轨 | LIB | P1 | 解释 audioTracks、默认音轨和语言信息 |
| TRACK-02 | 切换音轨 | LIB | P1 | 使用 selectAudioTrack，说明切换时机 |
| TRACK-03 | 切换时保留进度 | LIB | P1 | 说明 preserveTime 默认值和关闭场景 |
| TRACK-04 | 切换时保留播放状态 | LIB | P1 | 解释播放/暂停状态如何延续 |

### 6.11 Media Session

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| MEDIA-01 | 启用 Media Session | LIB | P1 | 提供浏览器能力检测和最小配置 |
| MEDIA-02 | 媒体元数据 | LIB | P1 | title、artist、album、artwork 的映射规则 |
| MEDIA-03 | 系统媒体操作 | LIB | P1 | play、pause、stop、上一首、下一首、跳转 |
| MEDIA-04 | 默认跳转步长 | LIB | P1 | 说明 seek offset 默认值和自定义方式 |
| MEDIA-05 | 多 Player 所有权 | LIB | P1 | 解释当前所有者切换和恢复语义 |
| MEDIA-06 | 锁屏/系统控件配方 | LIB + DOCS | P1 | 提供播放列表联动的完整示例 |

### 6.12 音频分析器

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| ANALYZE-01 | 启用分析器 | LIB | P1 | 说明必须先启用并成功加载后才能取得实例 |
| ANALYZE-02 | FFT 配置 | LIB | P1 | 展示默认值、有效范围和性能影响 |
| ANALYZE-03 | 频谱数据 | LIB | P1 | `getFrequencyData` 可视化配方 |
| ANALYZE-04 | 波形数据 | LIB | P1 | `getWaveformData` 可视化配方 |
| ANALYZE-05 | CORS 静默问题 | LIB | P0 | 明确音频可播放但 Web Audio 数据可能为空 |
| ANALYZE-06 | 自定义 Analyzer 工厂 | LIB | P2 | 说明扩展入口和生命周期 |
| ANALYZE-07 | 性能建议 | LIB + DOCS | P1 | 控制采样频率、动画帧更新和不可见时暂停 |

### 6.13 错误、诊断与恢复

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| ERROR-01 | 稳定错误码索引 | LIB | P0 | 收录全部公共错误码，可被站内搜索命中 |
| ERROR-02 | 按症状排障 | DOCS | P0 | 无法播放、一直 loading、没有声音、没有频谱、清晰度为空等入口 |
| ERROR-03 | 按加载阶段排障 | LIB + DOCS | P0 | Source、协议路由、manifest、segment、decode、playback 分阶段 |
| ERROR-04 | Error 对象契约 | LIB | P0 | 说明 code、message、cause 及检查方式 |
| ERROR-05 | 可恢复性矩阵 | LIB | P1 | 标记建议重试、换源、补 Adapter、等待用户手势或重建 Player |
| ERROR-06 | `LOAD_ABORTED` 指南 | LIB | P0 | 区分正常取消、换源和真实网络失败 |
| ERROR-07 | `PLAYBACK_BLOCKED` 指南 | LIB | P0 | 提供用户手势恢复路径 |
| ERROR-08 | `ADAPTER_UNAVAILABLE` 指南 | LIB | P0 | 检查依赖、注册和浏览器支持 |
| ERROR-09 | manifest/segment/stream 错误 | LIB | P0 | 解释三类自适应流错误层级 |
| ERROR-10 | dispose 后错误 | LIB | P1 | 说明终态及创建新实例的恢复方式 |
| ERROR-11 | 调试信息模板 | DOCS | P1 | 收集版本、URL 类型、浏览器、状态、事件和错误码，不默认暴露敏感 URL |

### 6.14 扩展 GAudio

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| EXT-01 | 扩展点总览 | LIB | P1 | Source、Engine、Adapter、Analyzer 四种 Seam 的职责与选择条件 |
| EXT-02 | 自定义 Source 教程 | LIB | P1 | 强调取消、幂等 close、失败清理和所有权 |
| EXT-03 | 自定义 Engine 教程 | LIB | P2 | 覆盖完整 Engine Interface、事件桥接和释放契约 |
| EXT-04 | 自定义 Adapter 教程 | LIB | P2 | 覆盖协议支持、加载、事件与实例隔离 |
| EXT-05 | 自定义 Analyzer 教程 | LIB | P2 | 覆盖数据读取和资源释放 |
| EXT-06 | 继承支持政策 | LIB | P1 | 只推荐扩展 `MediaElementAudioEngine`；不推荐继承 AudioPlayer、AudioAnalyzer、EventEmitter |
| EXT-07 | Adapter 实例隔离 | LIB | P1 | 每个 Player/播放上下文使用独立 Adapter 实例 |
| EXT-08 | 扩展契约测试清单 | LIB + DOCS | P2 | 取消、重复清理、陈旧事件、并发加载、错误 cause |

### 6.15 API 参考

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| API-01 | 按包入口分组 | LIB | P0 | `gaudio`、`gaudio/hls`、`gaudio/dash` 独立导航 |
| API-02 | 按 Module 分组 | LIB + DOCS | P0 | Player、Source、Engine、Adaptive、Analysis、Events、Errors、Media Session |
| API-03 | 符号级页面 | LIB | P0 | 类、函数、接口、类型别名、枚举/联合类型均可定位 |
| API-04 | 方法契约 | LIB | P0 | 参数、返回值、默认值、前置条件、异常、状态变化、释放要求 |
| API-05 | 事件负载类型 | LIB | P0 | 从事件名可跳到 payload，从 payload 可反查事件 |
| API-06 | 错误码交叉链接 | LIB + DOCS | P0 | API 的 throws 链接至错误与排障页面 |
| API-07 | 指南反向链接 | DOCS | P1 | 每个核心符号显示相关指南和配方 |
| API-08 | 导出入口标记 | LIB | P0 | 防止从错误入口导入 HLS/DASH 功能 |
| API-09 | 生命周期徽标 | DOCS | P1 | 标记“加载后可用”“dispose 后不可用”“浏览器能力相关” |
| API-10 | 源码同步校验 | DOCS | P0 | CI 检查公开导出、签名和参考页覆盖，避免文档漂移 |

### 6.16 配方与可运行示例

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| RECIPE-01 | 普通音频最小播放器 | LIB | P0 | 可复制、可运行、包含 dispose |
| RECIPE-02 | HLS 播放器 | LIB | P0 | 含依赖、Adapter、策略和错误处理 |
| RECIPE-03 | DASH 播放器 | LIB | P0 | 含依赖、Adapter 和错误处理 |
| RECIPE-04 | 播放状态按钮组 | LIB + DOCS | P1 | UI 由 Player 状态驱动 |
| RECIPE-05 | 进度条与缓冲区 | LIB + DOCS | P1 | currentTime、duration、buffered、seekable |
| RECIPE-06 | 播放列表与备用源 | LIB | P1 | 自动下一首及 fallbackSources |
| RECIPE-07 | 多语言音轨 | LIB | P1 | 音轨列表与保持进度 |
| RECIPE-08 | 系统媒体控件 | LIB | P1 | Media Session 与列表元数据 |
| RECIPE-09 | 频谱可视化 | LIB | P1 | 动画循环、CORS 和清理 |
| RECIPE-10 | HLS 手动清晰度 | LIB | P1 | 明确仅支持具备 variant 能力的实现 |
| RECIPE-11 | Blob/本地文件播放 | LIB | P1 | 展示对象 URL 生命周期 |
| RECIPE-12 | 状态与事件调试器 | DOCS | P1 | 能复制到业务项目快速诊断 |
| RECIPE-13 | SSR 框架接入模板 | LIB + DOCS | P1 | 只给出客户端生命周期共性，框架版本后续分层 |
| RECIPE-14 | 能力探测与降级 | LIB | P1 | HLS/DASH 支持检查及普通媒体回退 |

### 6.17 文档站通用功能

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| SITE-01 | 全站搜索 | DOCS | P0 | 可搜索标题、API 符号、事件名和错误码 |
| SITE-02 | 分区导航 | DOCS | P0 | 学习、任务、排障、参考路径互不混淆 |
| SITE-03 | 页内目录 | DOCS | P0 | 长指南和 API 页快速定位 |
| SITE-04 | 代码复制 | DOCS | P0 | 明确成功反馈，键盘可操作 |
| SITE-05 | 包管理器偏好记忆 | DOCS | P1 | 用户选择后全站同步命令 |
| SITE-06 | 代码标签页 | DOCS | P1 | 用于普通媒体/HLS/DASH或 ESM/CJS，不隐藏关键差异 |
| SITE-07 | 版本与预发布提示 | LIB + DOCS | P0 | 页面和示例明确当前版本，防止稳定版/next 混用 |
| SITE-08 | Light / Dark / System 主题模式 | DOCS | P0 | 两套主题完整适配；代码块和终端保持各自可读的明暗表面 |
| SITE-09 | 响应式布局 | DOCS | P0 | 桌面优先，同时覆盖平板和手机查阅 |
| SITE-10 | 无障碍基础 | DOCS | P0 | 键盘导航、焦点、语义结构、对比度、减少动态效果 |
| SITE-11 | 上一页/下一页 | DOCS | P1 | 支持连续学习路径 |
| SITE-12 | 页面反馈入口 | DOCS | P1 | 指向具体页面/版本，方便报告错误 |
| SITE-13 | 复制页面链接/标题锚点 | DOCS | P1 | 精确分享某个参数、错误码或步骤 |
| SITE-14 | 外链与下载安全提示 | DOCS | P1 | 音频示例来源、CORS 和许可证可追溯 |
| SITE-15 | 多语言路由与语言切换 | DOCS + DECISION | P0 | 首版建立可分享的语言 URL 和切换状态；同时首发哪些语言仍由产品确认 |
| SITE-16 | 离线/PWA | DECISION | P2 | 只有明确用户需求后再建设 |

### 6.18 内容质量与自动化

| ID | 功能 | 来源 | 优先级 | 验收要点 |
| --- | --- | --- | --- | --- |
| QA-01 | 示例 TypeScript 校验 | DOCS | P0 | 每段核心代码进入 CI，使用当前公开导出编译 |
| QA-02 | 浏览器冒烟测试 | DOCS | P0 | 普通媒体、HLS、DASH 最小示例至少覆盖一个真实浏览器 |
| QA-03 | 公共导出覆盖检查 | LIB + DOCS | P0 | 新增或删除公共符号时文档检查失败 |
| QA-04 | 错误码覆盖检查 | LIB + DOCS | P0 | 公共错误码均有参考项和排障入口 |
| QA-05 | 事件覆盖检查 | LIB + DOCS | P0 | 公共事件均有 payload 和触发条件说明 |
| QA-06 | 内部 API 泄漏检查 | DOCS | P1 | 文档不引用未导出的符号 |
| QA-07 | 链接检查 | DOCS | P0 | 站内链接、锚点和 API 交叉引用无失效 |
| QA-08 | 示例资源可用性检查 | DOCS | P1 | 音频、manifest 和 segment 可访问且支持所需 CORS |
| QA-09 | 可访问性检查 | DOCS | P1 | 自动检查加键盘人工巡检 |
| QA-10 | 性能预算 | DOCS | P1 | 文档首屏不加载 hls.js/dashjs；示例按需加载 |
| QA-11 | 版本一致性检查 | LIB + DOCS | P0 | 安装命令、版本徽标、API 数据来自同一发布版本 |
| QA-12 | 内容事实标注 | DOCS | P1 | 浏览器差异、第三方库行为和 GAudio 保证分开表述 |

## 7. 首版页面清单

### P0：必须上线

1. 首页。
2. 安装。
3. 五分钟播放第一个音频。
4. HLS 快速开始。
5. DASH 快速开始。
6. 核心概念与模块关系。
7. AudioPlayer 生命周期。
8. 音源与协议路由。
9. 播放控制与设置。
10. 状态和事件。
11. 自适应流基础。
12. 错误处理与错误码参考。
13. SSR、浏览器能力与兼容性。
14. 资源释放与 dispose。
15. 三个公共入口的 API 参考。
16. 版本与变更记录。

### P1：完整正式版

1. 播放列表和备用源。
2. 多语言/替代音轨。
3. Media Session。
4. 音频分析器与 CORS。
5. HLS 策略、预设和运行时更新。
6. DASH 预设和运行时设置。
7. 自适应清晰度、manifest、segment 和流错误。
8. Blob 与本地文件。
9. 自定义 AudioSource。
10. 扩展点总览与继承政策。
11. 完整配方库。
12. 症状式排障中心。

### P2：生态与高级能力

1. 自定义 Engine 教程。
2. 自定义 Adapter 教程。
3. 自定义 Analyzer 教程。
4. 扩展契约测试套件说明。
5. 框架专项集成指南。
6. 可交互参数实验室。
7. 第二语言内容的全面翻译与持续同步。
8. 离线/PWA 阅读。

## 8. 建议的导航结构

```text
GAudio
├── 开始
│   ├── 为什么选择 GAudio
│   ├── 安装
│   ├── 五分钟快速开始
│   └── 兼容性与 SSR
├── 核心指南
│   ├── 核心概念
│   ├── 生命周期
│   ├── 音源与协议路由
│   ├── 播放控制与设置
│   ├── 状态与事件
│   └── 资源释放
├── 自适应流
│   ├── HLS
│   ├── DASH
│   ├── 内容类型与预设
│   ├── 清晰度与流信息
│   └── 自适应流错误
├── 功能
│   ├── 播放列表与备用源
│   ├── 多语言音轨
│   ├── Media Session
│   ├── 音频分析器
│   └── Blob 与本地文件
├── 配方
├── 排障
│   ├── 按症状
│   ├── 按播放阶段
│   └── 错误码
├── 扩展
│   ├── 自定义 Source
│   ├── 自定义 Engine
│   ├── 自定义 Adapter
│   └── 自定义 Analyzer
└── API
    ├── gaudio
    ├── gaudio/hls
    └── gaudio/dash
```

## 9. 分阶段实施计划

### 阶段 0：建立内容契约

- 固定公共入口清单。
- 固定公共符号、事件和错误码数据源。
- 定义示例必须满足的编译、运行和清理标准。
- 定义指南、配方、API 参考、排障四种内容模板。
- 建立“GAudio 保证 / 浏览器差异 / 第三方实现差异”的写作规则。

完成条件：任何新增页面都能判断放在哪里、依据是什么、如何验证。

### 阶段 1：完成最短成功路径

- 首页。
- 安装选择器。
- 普通媒体最小示例。
- HLS 最小示例。
- DASH 最小示例。
- 自动播放、CORS、SSR、dispose 的必要提示。

完成条件：新用户可以只依赖 P0 页面成功播放三类媒体之一。

### 阶段 2：建立正确心智模型

- 核心概念。
- 生命周期和状态。
- 音源与协议路由。
- 播放控制、设置、时间范围。
- 事件和错误。

完成条件：用户能预测常规操作的状态变化和错误，而不是通过试错使用 API。

### 阶段 3：覆盖 GAudio 的差异化能力

- HLS/DASH 策略和预设。
- 自适应流信息与质量切换。
- 播放列表、备用源和音轨。
- Media Session。
- Analyzer。

完成条件：核心包的主要用户能力都有任务指南、可复制配方和 API 交叉链接。

### 阶段 4：扩展与质量闭环

- 自定义 Source/Engine/Adapter/Analyzer。
- 公开接口覆盖检查。
- 示例类型检查与浏览器验证。
- 错误码、事件、链接和版本一致性检查。

完成条件：包升级时，文档漂移能够被 CI 及时发现。

## 10. 首版明确不做

- 不做账号、登录、项目控制台。
- 不做音频上传、托管、转码或 CDN 配置。
- 不做音乐内容发现、曲库或歌单社区。
- 不把完整播放器产品 UI 当成文档主线。
- 不在快速开始中暴露 hls.js/dashjs 的大量高级配置。
- 不承诺所有浏览器拥有相同的原生 HLS、Media Session、Web Audio 或 fastSeek 能力。
- 不把内部 Implementation 写成公共 API。
- 不先建设大量框架包装层；核心示例保持框架无关。

## 11. 验收指标

### 用户任务指标

- Time to First Audio：新用户从进入首页到成功播放的时间。
- 安装成功率：核心、HLS、DASH 三条路径的依赖选择正确率。
- 示例复制成功率：复制后无需修改 GAudio API 即可通过类型检查。
- 排障到达率：错误码或典型症状能在一次搜索中到达正确页面。
- 二次任务完成率：完成首次播放后，用户能继续找到列表、音轨、Media Session 或 Analyzer 指南。

### 内容质量指标

- 公共导出文档覆盖率 100%。
- 公共错误码文档覆盖率 100%。
- 公共事件及 payload 覆盖率 100%。
- P0 示例 TypeScript 校验通过率 100%。
- P0 页面内部链接有效率 100%。
- P0 交互可键盘操作，文字与代码满足对比度要求。

## 12. 需要后续确认的产品决策

以下事项不能从 GAudio 核心包本身得出，不应在首轮规划中假装已经确定：

1. 官方文档是否首发中英双语，以及翻译维护策略。
2. 是否提供在线可编辑 Playground，还是只提供受控可运行 Demo。
3. 示例音频和自适应流测试资源由谁托管、如何保障 CORS 与长期可用性。
4. 是否维护多个版本的文档，还是只展示当前预发布版本。
5. 是否对 React、Vue、Nuxt、Next.js 等框架提供官方封装或仅提供接入配方。
6. 是否收集匿名文档搜索、复制和任务完成数据。

## 13. 本规划的包内依据

本规划只检查并使用了以下 `packages/gaudio/` 范围内的事实来源：

- `package.json`：公共入口、版本、运行时和可选依赖。
- `src/index.ts`：核心公共导出。
- `src/adapters/hls/index.ts`：HLS 公共导出。
- `src/adapters/dash/index.ts`：DASH 公共导出。
- `src/player/`：Player、生命周期、事件、播放列表和 Media Session 契约。
- `src/source/`：URL、HTTP、Blob 和自定义 Source 契约。
- `src/engine/`：Engine 和 Adapter Interface。
- `src/adapters/`：自适应流类型、HLS/DASH 行为和设置更新。
- `src/analysis/`：Analyzer 能力与生命周期。
- `src/errors/`：稳定错误类型和错误码。
- `src/events/`：事件订阅和异常隔离行为。
- `src/**/*.test.ts`：并发、取消、清理、重入、所有权和错误语义的已验证行为。

旧文档站的任何页面、代码或导航均未作为本功能规划的依据。
