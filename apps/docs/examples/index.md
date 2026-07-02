---
pageClass: gaudio-example-page
---

# Interactive Demo

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import { defineClientComponent } from 'vitepress'

// AI modified: defer browser-only adaptive vendors until the documentation page mounts.
const AudioPlayerDemo = defineClientComponent(() => import('./AudioPlayerDemo.vue'))
</script>

## API Surface In This Demo

| Area | What you can try in the studio |
| --- | --- |
| Core playback | Play, pause, stop, seek, fast seek, volume, rate, mute, loop, autoplay, preload, pitch preservation |
| Sources | URL string, `AudioSourceDescription`, `HttpAudioSource`, `BlobAudioSource`, custom `AudioSource` lifecycle |
| Playlist & session | `setPlaylist`, fallback sources, audio tracks, Media Session metadata |
| Adaptive streaming | HLS/DASH adapters, manifest/variant/segment events, manual quality, runtime config updates |
| Analysis | Player-owned `AudioAnalyzer` canvas visualization and sample capture |
| Utilities | Typed `EventEmitter`, `GAudioError`, browser `canPlayType`, live event log |

For narrative guides, start with [Getting Started](/guide/getting-started), [Configuration](/guide/configuration), and [Recipes](/guide/recipes). For generated signatures, open the [API reference](/api/).
