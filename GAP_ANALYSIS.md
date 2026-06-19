# gaudio 项目差距分析报告

> 审查日期: 2026-06-19 | 分支: `dev` | 版本: `0.4.0`
> 验证: typecheck ✅ · test (106/106) ✅ · build ✅

## 总体评价

项目架构清晰，**`AudioPlayer → AudioEngineRouter → AudioEngine → AudioSource`** 分层合理，类型系统严谨，测试覆盖 106 个用例全部通过。HLS/DASH 通过独立 entry point 保持 optional peer dependency 隔离，analyzer 集成干净。作为 pre-release 阶段，整体质量不错。

以下是按优先级排列的差距和改进建议：

---

## 🔴 P0 — 阻塞发布的关键缺失

### 1. 缺少 LICENSE 文件

项目根目录没有任何 LICENSE 文件。这对开源项目是致命问题——用户无法知道是否可以使用、修改或分发你的代码。

### 2. 只有 docs deploy workflow，没有 PR CI

`.github/workflows/docs.yml` 只在 `main` push 时触发。缺少 PR 触发的 typecheck + lint + test workflow。这意味着 PR review 时看不到 CI 状态。

### 3. 没有 npm publish workflow

文档部署有了，但包发布全靠手动。没有 `npm publish`、没有 provenance、没有版本管理自动化。

---

## 🟡 P1 — API 层面的功能缺口

### 4. 缺少 `EventEmitter.once()` 和 `AudioPlayer.once()`

当前只有 `on()`/`off()`。`once()` 是事件系统的基本操作，对于 `loadedmetadata`、`canplay` 等一次性事件非常实用。整个 `EventEmitter` 类非常小（57行），加入这个方法很简单。

### 5. 缺少 `AudioPlayer.getSource()`

有 `setSource()` 但没有对应的 getter。用户在 source 变更后无法获取当前配置的 source。

### 6. 缺少 `AudioPlayer.getActiveProtocol()` / `getActiveImplementation()`

用户无法直接从 player 查询当前激活的协议和实现。必须通过 adapter 实例间接获取。这应该作为 player 级别的便捷 API。

### 7. `canPlayType()` 只能检测浏览器原生支持，不管 adapter

当用户注册了 HLS/DASH adapter 后，`player.canPlayType('application/vnd.apple.mpegurl')` 可能返回 `''`，但实际上 player 可以播放 HLS（通过 adapter）。这会误导用户。

### 8. `AudioPlayer` 没有 `removeAllListeners(eventName?)`

只能通过 `on()` 返回的函数逐个取消，或调用 `dispose()` 全量销毁。没有按事件名批量移除的能力。

### 9. 没有 `setAnalyzerOptions()` 运行时重配置

文档和 extensibility plan 都提到此问题。如果用户想改 FFT size，当前必须重新 `load()`。合理的做法是提供一个 setter 可以动态调整（或至少返回错误码说明不可用）。

---

## 🟡 P1 — 基础设施缺口

### 10. 缺少 CHANGELOG.md

extensibility plan 也标注了这一点。pre-release 阶段迭代快，changelog 对用户跟踪 breaking changes 至关重要。

### 11. 缺少 CONTRIBUTING.md

对开源项目，贡献者需要知道开发流程、commit 规范、测试要求等。

### 12. 缺少 browser E2E 测试

CODE_REVIEW.md 标为 P2，extensibility plan 也列了。所有测试都在 jsdom 里跑。没有真实浏览器验证：

- 真实 MP3/HLS/DASH 加载
- `analyzer: true` 后 `getAnalyzer()` 返回可用数据
- CORS 限制下的静默样本
- 浏览器 autoplay 策略

### 13. 没有对 `HlsAudioEngine` / `DashAudioEngine` 的直接单元测试

adapter 测试覆盖了 adapter 层，但 engine 类本身（特别是 `reload()`、`attachSourceUrl`、vendor 事件转换等）没有独立测试。

---

## 🔵 P2 — 音频库常见的缺失功能

### 14. 缺少 `AudioAnalyzer` 的持续轮询辅助

当前 `AudioAnalyzer` 完全是 pull-based。每个需要可视化的用户都要自己写 `requestAnimationFrame` 循环。extensibility plan 提到过 `createVisualizerLoop()`，可以考虑作为一个轻量 helper。

### 15. 没有 Media Session API 集成

`navigator.mediaSession` 可以提供系统级的播放控制（锁屏控制、耳机按钮等）。多数成熟的音频播放库（Howler.js、MediaElement.js 等）都集成了这个。

### 16. 没有 playlist 支持

`AudioPlayer` 一次只能有一个 source。没有 built-in 的队列、顺序播放、随机播放能力。这是音频播放器库的核心体验功能。

### 17. 没有 `BlobAudioSource` 或 `MediaStreamAudioSource`

extensibility plan 提到考虑 `BlobAudioSource`。常见场景：用户上传的音频文件（`File`/`Blob`）、`MediaStream`（录音）、本地 `ObjectURL`。

### 18. 没有动态 adapter 注册

adapter 只能在 constructor 时传入。如果用户在运行时想 lazy-load HLS adapter（import 后才注册），当前做不到。

### 19. 没有跨来源 fade/gapless 切换

切换 source 必须 unload → load，中间有明显间隙。常见需求是 crossfade 过渡。

### 20. 没有音频效果链

extensibility plan 明确说不要加 DSP/EQ。但基础的 `GainNode` 访问或 effects bypass hook 能让高级用户自定义 Web Audio 链路而不绕过 player。

---

## 🟢 P3 — 文档和用户体验优化

### 21. demo 里中英文切换但 guide 文档结构可以更统一

当前 VitePress 有中英文设定，demo 支持 i18n。但 guide 页面只有英文（getting-started, events, adaptive-playback）。对于标注了 bilingual 的项目，应该有中文版 guide。

### 22. `bufferupdate` 事件 Shape 变迁

从 v0.1 plan 到当前实现的变迁中，`BufferUpdate` 从 `{bufferedStart, bufferedEnd}` 改为 `{ranges: TimeRange[]}`。如果过去有用户依赖旧 shape，需要 migration note。

### 23. 错误码 `ENGINE_ERROR` 过于宽泛

多个不同场景（analyzer 创建失败、Web Audio 不可用、playback 失败等）都映射到 `ENGINE_ERROR`。对于需要针对性处理的 app，更细粒度的错误码会更有用。

### 24. 没有 TypeScript 严格类型推断测试

虽然 tsconfig 有 `strict: true`，但缺少专门的类型测试来确保 API 推断类型符合预期（如 `AudioPlayerOptions` 的可选字段类型）。

---

## 📊 与初始 plan 的差距对比

| 原始 plan (2026-06-08) 中提到的 Future | 当前状态 |
|---|---|
| `SegmentLoader` (HTTP Range) | ❌ 未实现 |
| MSE engine | ❌ 未实现（被 HLS/DASH adapter 方案替代） |
| `AudioWorklet` 自定义 DSP | ❌ 未实现 |
| Playwright E2E | ❌ 未实现 |
| HLS adapter | ✅ 已实现 |
| DASH adapter | ✅ 已实现 |
| Analyzer | ✅ 已实现 |

---

## 🎯 建议的迭代优先级

### 立刻（本周）

- 添加 LICENSE 文件
- 添加 PR CI workflow（typecheck + lint + test）
- 创建 CHANGELOG.md

### 0.5.0 之前

- `EventEmitter.once()` / `AudioPlayer.once()`
- `AudioPlayer.getSource()`
- `AudioPlayer.getActiveProtocol()` / `getActiveImplementation()`
- `AudioPlayer.removeAllListeners(eventName?)`
- `canPlayType()` 考虑 adapter 支持
- `BlobAudioSource` helper
- CONTRIBUTING.md

### 0.6.0 之前

- Browser E2E 测试（Playwright）
- `HlsAudioEngine` / `DashAudioEngine` 直接单测
- `setAnalyzerOptions()` 运行时重配置
- 动态 adapter 注册

### 1.0 之前

- Media Session API 集成
- Playlist 支持
- Gapless / crossfade 过渡
- 中文版 guide 文档
- runtime analyzer 重配置
- 错误码细化
- npm publish workflow + provenance

---

## 当前已验证通过

- **typecheck**: `pnpm run typecheck` — 通过（gaudio + @gaudio/docs）
- **test**: `pnpm run test` — 106 tests passed（12 文件 gaudio + 2 文件 docs）
- **build**: `pnpm run build` — ESM + CJS + .d.ts 全部产出
- **lint**: 配置完整（@antfu/eslint-config v9），无禁用规则
