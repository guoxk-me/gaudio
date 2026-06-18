<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
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
  <aside class="status" :aria-label="text.status.ariaLabel">
    <div class="status__grid">
      <div v-for="[label, statusValue] in statuses" :key="label" class="status__entry">
        <span>{{ label }}</span>
        <strong>{{ statusValue }}</strong>
      </div>
    </div>

    <h2>{{ text.status.events }}</h2>
    <ol class="status__events">
      <li v-for="eventMessage in eventLog" :key="eventMessage">
        {{ eventMessage }}
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.status {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.status__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.status__entry {
  display: grid;
  gap: 2px;
  min-width: 0;
  border-radius: 8px;
  padding: 8px;
  background: var(--vp-c-bg);
}

.status__entry span {
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.status__entry strong {
  overflow-wrap: anywhere;
  font-size: 13px;
}

.status h2 {
  margin-top: 18px;
}

.status__events {
  max-height: 260px;
  overflow: auto;
  padding-left: 20px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}
</style>
