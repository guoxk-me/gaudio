# gaudio 项目代码审查报告

> 审查日期: 2026-06-17 | 版本: v0.4.0 (预发布)

## 概述

对 `gaudio` v0.4.0（浏览器优先的 TypeScript 音频流库）进行了全面代码审查。整体代码质量较高——架构清晰、测试覆盖充分、错误处理有层次。以下按严重程度列出发现的问题和改进建议。

---

## 1. 死代码 / 冗余文件

### 1.1 `packages/gaudio/src/types.ts` — 死文件

- **文件**: `packages/gaudio/src/types.ts` (35 行)
- **问题**: 该文件是 `index.ts` 中类型导出的一个子集，仅包含类型重导出（无 class 导出）。没有任何文件 import 它，`package.json` 和 `tsdown.config.ts` 也未将其声明为入口点。
- **建议**: 直接删除。

### 1.2 根目录 `dist/` — 疑似过期构建产物

- **路径**: `/Users/guoxk/me/i/gaudio/dist/` (26 个文件，含 .js/.cjs/.d.ts/.map)
- **问题**: 正常构建输出应在 `packages/gaudio/dist/`。根目录的 `dist/` 看起来是早期构建配置遗留的产物（时间戳 Jun 12），可能是某次错误配置的构建生成的。
- **建议**: 确认无引用后删除，并检查是否有脚本/配置错误地将构建输出指向了根目录。

---

## 2. 代码重复

### 2.1 HLS 与 DASH 适配器的结构性重复

HLS 和 DASH 两个适配器子系统存在大量结构性重复，几乎是一一对应的"镜像"实现：

| 模式 | HLS 文件 | DASH 文件 |
|---|---|---|
| 适配器实现类 | `hls-audio-adapter.ts` (204 行) | `dash-audio-adapter.ts` (101 行) |
| 引擎扩展 | `hls-audio-engine.ts` | `dash-audio-engine.ts` |
| 播放预设 | `hls-playback-presets.ts` | `dash-playback-presets.ts` |
| VOD 默认配置 | `hls-vod-defaults.ts` | `dash-vod-defaults.ts` |
| 测试文件 | `hls-audio-adapter.test.ts` (405 行) | `dash-audio-adapter.test.ts` (451 行) |

**重复的模式**:
- 适配器实现：`createEngine()` 中 DI + callback 注入、实例生命周期追踪（`onDispose`、`onXxxInstanceChange`）的逻辑完全相同
- 引擎扩展：事件翻译（vendor event → `AudioEngineEvents`）、错误分类逻辑结构一致
- 预设文件：`Record<AdaptivePlaybackPreset, object>` + `xxxForPreset()` 工厂函数模式相同
- 测试：fake vendor 实现、harness builder、参数化 preset 验证、事件翻译验证的模式相同

**建议**: 考虑到 hls.js 和 dash.js 的 API 差异较大（hls.js 用 `HlsConfig` 部分配置合并，dash.js 用 `MediaPlayerSettingClass` + `updateSettings()`），完全抽象可能得不偿失。但可以：
- 提取公共的 `createEngine` 生命周期管理（callback 注入、active engine 追踪）到一个共享工具
- 测试中的 fake vendor 可以共享一个通用的 fake event emitter 基类

### 2.2 `audioEngineEventNames` 数组与 `AudioEngineEvents` 接口重复

- **文件**: `src/engine/audio-engine.ts:70-93`
- **问题**: `audioEngineEventNames` 数组手动列出了 `AudioEngineEvents` 的所有 22 个 key。每添加一个新事件类型，需要在两处同步修改。
- **当前状态**: 已有 `as const satisfies readonly (keyof AudioEngineEvents)[]` 提供编译时检查，不会出现不同步——但维护负担仍然存在。
- **建议**: 这是有意的设计权衡（注释也说明了原因），且 TypeScript 的 `satisfies` 已经提供了类型安全。优先级低，可以不处理。

---

## 3. 错误处理问题

### 3.1 `AudioPlayer.load()` 中 autoplay 失败时的状态不一致

- **文件**: `src/player/audio-player.ts:285-291`
- **问题**: 当 `shouldAutoplay` 为 true 时，`load()` 在设置状态为 `'ready'` 后调用 `await this.play()`。如果 `play()` 抛出异常（例如浏览器阻止自动播放），该异常会直接向上传播出 `load()`，但 `PlaybackState` 仍停留在 `'ready'` 而不是 `'error'`。

```typescript
// audio-player.ts:285-291
if (loadRequestId === this.loadRequestId) {
  this.hasLoadedSource = true
  this.setState('ready')
  if (this.shouldAutoplay) {
    await this.play()  // 如果这里 throw，状态停留在 'ready'
  }
}
```

`play()` 方法内部（line 308-313）确实会 `publishError` 并设置状态为 `'error'`，但这个状态变更发生在 `play()` 抛出之前。问题是 `load()` 没有 catch 这个错误——错误直接传播出去，调用方得到的 Promise 是 rejected，但后续调用 `getState()` 会返回 `'error'`（因为 `play()` 里已经调了 `publishError`）。

等等，重新审视：`play()` 在 catch 块里调用了 `this.publishError(playerError)`（这会设置状态为 `'error'`），然后 `throw playerError`。所以当错误传播到 `load()` 时，状态实际上已经是 `'error'` 了。**但这里仍有一个时序问题**——`load()` 返回一个 rejected promise，调用方可能期望状态是 `'ready'`（对于成功加载的 source），但实际是 `'error'`。这个行为是合理的（autoplay 失败 = 整体失败），只是需要在文档中明确说明。

**实际影响**: 低。`play()` 内部已正确处理了错误状态的发布。更准确的说法是加载成功 + 自动播放失败时的语义需要更明确的文档说明，而不是代码 bug。

**更正**: 经过更仔细的审查，`play()` 方法内的 `publishError` 确实会将状态设为 `'error'`。最终调用方得到 rejected promise 且状态为 `'error'`，这个结果是自洽的。这段代码没有问题。

### 3.2 输入校验不一致：Player 抛异常 vs Engine 静默钳制

- **Player 层**: `setVolume()` 对非法值抛 `RangeError`，`setPlaybackRate()` 同理，`seek()` / `fastSeek()` 对负数抛 `RangeError`。
- **Engine 层**: `MediaElementAudioEngine.setVolume()` 将值 clamp 到 `[0,1]`，`setPlaybackRate()` clamp 到 `>=0.25`。引擎不抛异常。

**影响**: 通过 `AudioPlayer` 的调用方会收到 `RangeError`，但直接操作 Engine（或通过 Router）的调用方不会。对于 v0.4.0 预发布阶段来说这是合理的——Player 是主要的公开 API。但如果未来 Engine 也被暴露为公开 API，需要统一行为。

**建议**: 当前阶段可接受。如果 Engine 保持公开，建议在 Engine 层也做输入校验（抛异常或至少统一策略）。

---

## 4. 测试覆盖缺口

### 4.1 `AudioAnalyzer` — 无单元测试

- **文件**: `src/analysis/audio-analyzer.ts`
- **说明**: 该类依赖 Web Audio API (`AudioContext`、`AnalyserNode`)，在 node 环境下难以测试。但可以通过 mock 覆盖基本逻辑（节点创建、`getFrequencyData`/`getWaveformData` 的字节数据转换）。
- **当前覆盖**: 仅在 demo composable (`use-gaudio-demo.ts`) 中被使用，无自动化测试。

### 4.2 `HttpAudioSource` — 无单元测试

- **文件**: `src/source/http-audio-source.ts`
- **说明**: 该类是对 URL 字符串/AudioSourceDescription 的简单包装，逻辑较少，但 `open()` / `close()` 的生命周期测试仍有益处。

### 4.3 预设和默认配置数据文件 — 无独立测试

- `hls-playback-presets.ts`、`dash-playback-presets.ts`、`hls-vod-defaults.ts`、`dash-vod-defaults.ts`
- **说明**: 预设值通过 adapter 测试的参数化测试间接覆盖，但没有验证预设值本身符合预期结构/范围的独立测试。考虑到这些是面向用户的配置，独立测试会更有价值。

### 4.4 无集成 / E2E 测试

- 所有测试使用 fake/mock 对象（`FakeAudioEngine`、`FakeAudioElement`、`FakeHls`、`FakeDashPlayer`），在 node 环境下运行。
- 没有测试使用真实浏览器加载真实音频流。
- **评估**: 对于 v0.4.0 预发布阶段，单元测试覆盖已经很好。在接近 1.0 时考虑添加 E2E 测试（如 Playwright + 真实媒体文件）。

---

## 5. 架构与设计观察

### 5.1 整体评价

- **分层清晰**: Engine → Adapter → Player → Source 四层架构，职责明确
- **可扩展**: 自适应协议通过 `AudioEngineAdapter` 接口注册，新协议只需实现一个适配器
- **生命周期管理到位**: `loadRequestId` 生成计数器防止过期事件，`WeakMap` 防止 adapter 被重复注册到多个 router
- **错误体系完善**: `GAudioError` 带有 12 种机器可读错误码，区分可恢复/致命错误
- **可选依赖设计优雅**: hls.js / dashjs 作为可选 peer dependency + 独立入口点，不强制安装

### 5.2 API 改进建议

- **`AudioPlayer` 缺少 `getSource()` 方法**: 可以通过 `setSource()` 设值但没有对应的 getter。调用方无法查询当前 source 是什么。
- **`stop()` 行为**: 回到开头但保留 source（状态变为 `'ready'`），这与部分开发者的直觉（stop 意味着完全重置到 idle）可能不符。不过当前设计有文档说明，且是合理的选择。

### 5.3 无 TODO/FIXME/BUG 注释

代码库中没有遗留的 TODO 或 FIXME，说明技术债务管理良好。

---

## 6. 建议优先级

| 优先级 | 问题 | 操作 |
|---|---|---|
| 高 | 死文件 `src/types.ts` | 删除 |
| 高 | 根目录 `dist/` 过期构建产物 | 清理 |
| 中 | `AudioPlayer` 缺少 `getSource()` | 添加 |
| 中 | `AudioAnalyzer` / `HttpAudioSource` 缺少测试 | 补充 |
| 低 | HLS/DASH 适配器代码重复 | 观察，暂不重构 |
| 低 | 输入校验策略不一致 | 统一策略 |
| 低 | `audioEngineEventNames` 手动维护 | 可接受（已有类型安全保护） |
