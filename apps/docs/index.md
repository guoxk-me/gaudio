---
layout: home
title: GAudio — Browser-first TypeScript audio streaming library
titleTemplate: false
description: Typed browser audio player for native media, playlists, Web Audio analysis, Media Session, and optional HLS/DASH streaming.

hero:
  name: GAudio
  text: Browser-first audio streaming library
  tagline: Pre-release TypeScript player for native media, playlists, source lifecycle, Web Audio analysis, Media Session controls, and optional HLS/DASH adaptive playback.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Interactive Example
      link: /examples/

features:
  - title: One typed player
    details: Load, play, pause, stop, seek, fast seek, loop, mute, volume, playback rate, pitch preservation, preload, autoplay, ranges, and lifecycle state from AudioPlayer.
  - title: Source lifecycle
    details: Use URL strings, explicit descriptions, HttpAudioSource, BlobAudioSource, or custom lazy sources for signed URLs, local files, object URL cleanup, and app-owned resource leases.
  - title: Product playlists
    details: Model queues with fallback CDN sources, automatic next-track continuation, Media Session metadata, and alternate language or companion audio tracks.
  - title: Optional adaptive streaming
    details: Add HLS or DASH only when needed, with audio-focused presets, VOD/long-form/live tuning, manifest events, segment events, variant reporting, and manual quality controls where supported.
  - title: Audio analysis
    details: Enable player-owned frequency and waveform sampling for visualizers, or connect custom Web Audio graphs through AudioAnalyzer and analyzer factories.
  - title: Browser integration
    details: Connect browser, keyboard, headset, and operating-system media controls through Media Session while keeping typed events and stable GAudioError codes for telemetry.
---

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// AI modified: keep the audio player out of every non-home documentation entry.
const HomeMiniPlayer = defineAsyncComponent(() => import('./.vitepress/theme/components/HomeMiniPlayer.vue'))
</script>

<ClientOnly>
  <HomeMiniPlayer />
</ClientOnly>

# Capability Map

GAudio is meant for application audio, not just a thin wrapper around `<audio>`. The core package covers native media and product playback flows; adaptive adapters stay behind subpath imports so simple MP3, AAC, WAV, and OGG players do not pay for HLS or DASH code.

| Area | What you can build |
| --- | --- |
| Native playback | Music players, podcast players, preview surfaces, local file playback, browser-supported media formats, and system media controls. |
| Catalog and queue flows | Ordered playlists, next/previous navigation, automatic continuation, fallback sources, track metadata, and time-preserving alternate audio selection. |
| Protected or local media | Signed URL refresh, extensionless media routing, local `File` previews, object URL ownership, and custom source cleanup through `AudioSource`. |
| Visual experiences | Canvas spectrum visualizers, waveform meters, and custom Web Audio analyzer graphs attached to the active player signal. |
| Adaptive delivery | HLS and DASH audio VOD, long-form programs, live streams, audio-focused buffer presets, runtime vendor tuning, variant telemetry, and manual quality selection where the active implementation supports it. |
| Observability | Typed player events, adaptive manifest/segment/variant events, stable error codes, buffered/seekable/played ranges, source inspection, active adaptive playback inspection, and deterministic teardown. |

## Integration Surfaces

Start with `AudioPlayer` for most applications. Reach for sources when the application owns authentication or cleanup, playlists when the product owns track order, Media Session when browser or OS controls matter, and adapters when the source is HLS or DASH.

```ts
import { AdaptivePlaybackPreset, AudioPlayer, BlobAudioSource } from 'gaudio'
import { createHlsAdapter } from 'gaudio/hls'

const player = new AudioPlayer({
  source: new BlobAudioSource(file),
  preload: 'metadata',
  mediaSession: true,
  analyzer: { fftSize: 1024 },
  adapters: [
    createHlsAdapter({
      contentType: 'long-form',
      preset: AdaptivePlaybackPreset.Stable,
    }),
  ],
})

player.on('variantchange', updateQualityBadge)
player.on('error', reportAudioFailure)

await player.load()
await player.play()
```

## Where To Go Next

- Use [Getting Started](./guide/getting-started.md) for installation, source inputs, browser capabilities, autoplay behavior, and analyzer setup.
- Use [Configuration](./guide/configuration.md) for player options, Media Session metadata, source options, and adaptive adapter settings.
- Use [Recipes](./guide/recipes.md) for copyable integrations: playlists, signed URLs, local files, HLS/DASH quality controls, live streams, telemetry, and canvas visualization.
- Use [Adaptive Playback](./guide/adaptive-playback.md) when choosing HLS or DASH presets, content types, vendor settings, and quality behavior.
- Use [API Reference](./guide/api-reference.md) for the public API map and the generated declaration reference.
