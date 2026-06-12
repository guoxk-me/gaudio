# Interactive Player

The example runs against the same public package exports used by applications.

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import { defineClientComponent } from 'vitepress'

// AI modified: defer browser-only adaptive vendors until the documentation page mounts.
const AudioPlayerDemo = defineClientComponent(() => import('./AudioPlayerDemo.vue'))
</script>
