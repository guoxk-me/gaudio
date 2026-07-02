<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import DemoVisualization from './DemoVisualization.vue'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const demo = props.demo

const {
  activeCoverThumbUrl,
  activeFormatGroup,
  activeTrack,
  adaptiveBitrateLabel,
  adaptiveImplementationLabel,
  playerState,
} = demo

const metaItems = computed(() => [
  activeFormatGroup.value.label,
  adaptiveImplementationLabel.value,
  adaptiveBitrateLabel.value,
  playerState.value,
])
</script>

<template>
  <section class="gaudio-studio__now-playing">
    <!-- AI modified: tighter now-playing stage makes the analyzer feel attached to the active track. -->
    <div class="gaudio-studio__track-stage">
      <img
        :src="activeCoverThumbUrl"
        :alt="`${activeTrack.title} cover art`"
        class="gaudio-studio__cover"
        width="512"
        height="512"
        decoding="async"
      >

      <div class="min-w-0 flex-1">
        <p class="mb-1 text-[11px] font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
          {{ text.studio.nowPlaying }}
        </p>
        <h2 class="gaudio-studio__track-title" style="color: var(--gaudio-studio-text)">
          {{ activeTrack.title }}
        </h2>
        <p class="truncate text-sm sm:text-base" style="color: var(--gaudio-studio-text-muted)">
          {{ activeTrack.artist }}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <Badge
            v-for="item in metaItems"
            :key="item"
            variant="outline"
            class="gaudio-studio__meta-badge text-xs"
          >
            {{ item }}
          </Badge>
        </div>
      </div>
    </div>

    <DemoVisualization :demo="demo" :text="text" />
  </section>
</template>
