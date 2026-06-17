# Interactive Demo

The example runs against the same public package exports used by applications. It demonstrates core playback, source input shapes, browser capability checks, HLS and DASH adapters, adaptive events, runtime adapter updates, `AudioAnalyzer`, `EventEmitter`, and typed error reporting.

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import { defineClientComponent } from 'vitepress'

// AI modified: defer browser-only adaptive vendors until the documentation page mounts.
const AudioPlayerDemo = defineClientComponent(() => import('./AudioPlayerDemo.vue'))
</script>
