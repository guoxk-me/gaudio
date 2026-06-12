# Events

Core lifecycle events follow the browser media element:

```ts
player.on('loadstart', () => console.log('loading'))
player.on('loadedmetadata', ({ duration }) => console.log(duration))
player.on('playing', () => console.log('playing'))
player.on('waiting', () => console.log('buffering'))
player.on('seeking', ({ currentTime }) => console.log(currentTime))
player.on('bufferupdate', ({ ranges }) => console.log(ranges))
player.on('error', error => console.error(error.code))
```

Adaptive adapters expose protocol-neutral events:

```ts
player.on('adaptivechange', update => console.log(update))
player.on('manifestloaded', update => console.log(update.variants))
player.on('variantchange', update => console.log(update.variantId, update.bitrate))
player.on('segmentloadstart', update => console.log(update.url))
player.on('segmentloaded', update => console.log(update.url))
player.on('streamerror', update => console.log(update.category, update.isFatal))
```

Recoverable vendor failures emit `streamerror` while the vendor retries. Fatal failures also emit `error` with a typed `GAudioError` code.
