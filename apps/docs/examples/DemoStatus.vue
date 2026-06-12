<script setup lang="ts">
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'

const props = defineProps<{
  demo: GaudioDemo
}>()

const {
  adaptiveBitrateLabel,
  adaptiveImplementationLabel,
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
  ['State', playerState.value],
  ['Buffered', bufferedLabel.value],
  ['Seekable', seekableLabel.value],
  ['Played', playedLabel.value],
  ['Rate', playbackRateLabel.value],
  ['Paused', isPaused.value],
  ['Ended', isEnded.value],
  ['Seeking', isSeeking.value],
  ['Implementation', adaptiveImplementationLabel.value],
  ['Manifest', manifestVariantLabel.value],
  ['Variant', adaptiveVariantLabel.value],
  ['Bitrate', adaptiveBitrateLabel.value],
  ['Segment', segmentLabel.value],
] as const)
</script>

<template>
  <aside class="status" aria-label="Player status and events">
    <div class="status__grid">
      <div v-for="[label, statusValue] in statuses" :key="label" class="status__entry">
        <span>{{ label }}</span>
        <strong>{{ statusValue }}</strong>
      </div>
    </div>

    <h2>Events</h2>
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
