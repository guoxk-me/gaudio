# 事件

核心生命周期事件跟随浏览器 media element：

```ts
player.on('loadstart', () => console.log('loading'))
player.on('loadedmetadata', ({ duration }) => console.log(duration))
player.on('playing', () => console.log('playing'))
player.on('waiting', () => console.log('buffering'))
player.on('seeking', ({ currentTime }) => console.log(currentTime))
player.on('bufferupdate', ({ ranges }) => console.log(ranges))
player.on('error', error => console.error(error.code))
```

自适应适配器会暴露协议中立事件：

```ts
player.on('adaptivechange', update => console.log(update))
player.on('manifestloaded', update => console.log(update.variants))
player.on('variantchange', update => console.log(update.variantId, update.bitrate))
player.on('segmentloadstart', update => console.log(update.url))
player.on('segmentloaded', update => console.log(update.url))
player.on('streamerror', update => console.log(update.category, update.isFatal))
```

可恢复的供应商错误会在供应商重试期间发出 `streamerror`。致命失败也会发出带类型化 `GAudioError` code 的 `error`。

交互 demo 会实时记录这些事件，包括状态变化、时间范围更新、自适应 manifest 事件、分段活动和类型化错误 code。
