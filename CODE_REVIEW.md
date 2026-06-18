# gaudio 代码审查报告

> 审查日期: 2026-06-18
> 当前版本: `gaudio@0.4.0` 预发布
> 结论标签: **Executed** = 已执行命令验证，**Inspected** = 源码/配置审查，**Assumed** = 依赖外部发布/仓库设置

## 结论摘要

整体架构清晰，`AudioPlayer -> AudioEngineRouter -> AudioEngine -> AudioSource` 的分层仍然成立。核心包没有强制加载 `hls.js` 或 `dashjs`，HLS/DASH 通过独立入口和 optional peer dependency 保持可选。新增 analyzer 配置后，player 仍然是用户主入口，低阶 `AudioAnalyzer` 和自定义 engine 接入保留扩展空间。

## 发现与建议

### P1: 发布前需要版本策略

**Inspected:** `packages/gaudio/package.json` 仍是 `0.4.0`。本轮新增 `AudioPlayerOptions.analyzer`、`AudioPlayer.getAnalyzer()`、`AudioAnalyzerOptions`、`AudioPlayerAnalyzerOptions` 等公开 API。预发布阶段允许主动调整，但发布 npm 包前建议至少提升 minor/pre-release 版本，例如 `0.5.0` 或 `0.5.0-beta.0`，避免用户把新增 API 当成同一版本补丁里的隐式变化。

### P2: analyzer 需要浏览器集成测试

**Executed:** 单元测试覆盖了 player 配置、router 转发、media-element Web Audio graph 创建、播放时 `AudioContext.resume()`、释放时 `AudioContext.close()`。
**Inspected:** 目前仍没有真实浏览器加载真实媒体的 E2E。Web Audio 的 `createMediaElementSource()`、CORS 静音样本、浏览器 autoplay 策略在真实环境里更容易暴露差异。接近 1.0 时建议补 Playwright 场景：MP3 + HLS/DASH demo 加载、`analyzer: true` 后 `getAnalyzer()` 可用、播放后样本非空或可解释为 CORS 限制。

### P2: GitHub Pages 仍需要仓库设置配合

**Inspected:** 已添加 GitHub Actions workflow 后，仓库 Settings -> Pages 的 Source 仍需要选择 "GitHub Actions"。
**Assumed:** 默认部署路径是 `https://<owner>.github.io/gaudio/`，与当前 VitePress `DOCS_BASE ?? '/gaudio/'` 匹配。如果仓库名或自定义域变化，需要调整 workflow 的 `DOCS_BASE` 或 VitePress `base`。

### P3: Engine 仍是公开低阶 API，行为策略要继续收敛

**Inspected:** `MediaElementAudioEngine` 公开导出，直接使用 engine 时仍可以绕过 `AudioPlayer` 的输入校验。例如 player 对 volume/rate/seek 做严格校验，engine 层更偏向浏览器兼容处理。当前文档建议大多数用户使用 `AudioPlayer`，低阶 engine 面向 adapter/高级用户。后续若稳定 engine API，需要明确是“低阶宽容”还是“全层一致抛错”。

## 功能审查

**Inspected:** 当前用户可用能力包括：

- 普通 URL、source description、`HttpAudioSource`、自定义 `AudioSource`。
- MP3/AAC/WAV/OGG 等浏览器原生媒体。
- HLS 和 DASH optional adapters，包含播放策略、预设、运行时配置更新和 vendor instance diagnostics。
- Player 生命周期状态、媒体事件、时间/range getter、错误码、adaptive manifest/variant/segment/error 事件。
- Player-level analyzer 配置：`analyzer: true`、`fftSize`、自定义 `createAnalyzer`。
- 低阶 `AudioAnalyzer`、`EventEmitter`、`MediaElementAudioEngine` 和 `AudioEngineAdapter` contract。

## 规范与格式

**Inspected:** 代码使用 TypeScript strict、TSDoc、类型化事件和清晰的文件分层。命名整体符合业务含义，未发现新引入的 `any` 或禁用 lint 的情况。AI 修改处均保留了简短原因注释。

**Executed:** `pnpm --filter gaudio typecheck` 与 `pnpm --filter gaudio test` 已通过。全仓 lint/typecheck/test/build 需在最终验证阶段执行。

## 架构评估

**Inspected:** analyzer 放入 player 后没有破坏 adapter 可选依赖边界：

- `AudioEngine.createAnalyzer` 是可选方法，不强迫所有自定义 engine 立刻实现新 contract。
- `AudioEngineRouter.createAnalyzer()` 只转发 active engine，协议切换时 player 会释放旧 analyzer。
- `MediaElementAudioEngine` 复用单个 `MediaElementAudioSourceNode`，并旁路连接到 `AudioContext.destination`，避免开启分析导致媒体静音。
- HLS/DASH engine 继承 media-element engine，因此默认获得 analyzer 支持。

## 文档状态

**Inspected:** VitePress 已有中英文指南、交互示例和 TypeDoc 生成 API。
**Updated:** 新增手写 API Reference 页，列出用户可 import 的 API、用户需要理解的 runtime API 和类型。Getting Started、README、demo 文案已同步 analyzer 配置路径。

## 建议路线

1. 发布前确定版本号和 changelog。
2. 增加浏览器 E2E，覆盖真实 media + analyzer + GitHub Pages build output。
3. 接近 1.0 前冻结 `AudioPlayerOptions`、事件 payload、错误码和 adapter contract。
4. 若继续扩展协议，优先通过 `AudioEngineAdapter` 增量接入，避免扩大 core bundle。
