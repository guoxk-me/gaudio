<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
  eventsOnly?: boolean
}>()

const {
  adaptiveBitrateLabel,
  adaptiveImplementationLabel,
  adaptiveQualityControlLabel,
  adaptiveVariantLabel,
  bufferedLabel,
  eventLog,
  isEnded,
  isPaused,
  isSeeking,
  manifestVariantLabel,
  playbackRateLabel,
  playedLabel,
  playerState,
  seekableLabel,
  segmentLabel,
} = props.demo

const statuses = computed(() => [
  [props.text.status.labels.state, playerState.value],
  [props.text.status.labels.buffered, bufferedLabel.value],
  [props.text.status.labels.seekable, seekableLabel.value],
  [props.text.status.labels.played, playedLabel.value],
  [props.text.status.labels.rate, playbackRateLabel.value],
  [props.text.status.labels.paused, isPaused.value],
  [props.text.status.labels.ended, isEnded.value],
  [props.text.status.labels.seeking, isSeeking.value],
  [props.text.status.labels.implementation, adaptiveImplementationLabel.value],
  [props.text.status.labels.manifest, manifestVariantLabel.value],
  [props.text.status.labels.variant, adaptiveVariantLabel.value],
  [props.text.status.labels.bitrate, adaptiveBitrateLabel.value],
  [props.text.status.labels.quality, adaptiveQualityControlLabel.value],
  [props.text.status.labels.segment, segmentLabel.value],
] as const)
</script>

<template>
  <aside role="complementary" :aria-label="text.status.ariaLabel">
    <div v-if="!eventsOnly" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="[label, statusValue] in statuses"
        :key="label"
        class="gaudio-studio__stat-card"
      >
        <span class="text-[11px] font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">{{ label }}</span>
        <Badge variant="outline" class="gaudio-studio__meta-badge w-fit max-w-full justify-start font-mono text-xs whitespace-normal">
          {{ statusValue }}
        </Badge>
      </div>
    </div>

    <div v-else>
      <h2 class="mb-3 text-xs font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
        {{ text.status.events }}
      </h2>
      <ol class="max-h-72 overflow-auto pl-5 font-mono text-xs leading-relaxed" style="color: var(--gaudio-studio-text-muted)">
        <li v-for="eventMessage in eventLog" :key="eventMessage" class="mb-1">
          {{ eventMessage }}
        </li>
      </ol>
    </div>
  </aside>
</template>
