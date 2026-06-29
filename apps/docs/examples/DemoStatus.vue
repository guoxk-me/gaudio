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
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto minmax(112px, 0.34fr);
  height: 100%;
  min-height: 0;
  border: 1px solid var(--demo-border);
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 28%),
    var(--demo-panel-strong);
  color: var(--demo-text);
}

.status__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(202, 183, 143, 0.4) transparent;
}

.status__entry {
  display: grid;
  gap: 7px;
  min-width: 0;
  border-bottom: 1px solid var(--demo-line);
  padding: 12px 14px;
  background: transparent;
}

.status__entry:nth-child(odd) {
  border-right: 1px solid var(--demo-line);
}

.status__entry span {
  color: var(--demo-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status__entry strong {
  color: var(--demo-text);
  font-family: var(--vp-font-family-mono);
  overflow-wrap: anywhere;
  font-size: 12px;
}

.status h2 {
  margin: 0;
  border-bottom: 1px solid var(--demo-line);
  padding: 13px 14px 10px;
  color: var(--demo-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status__events {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 12px 14px 14px 30px;
  background: transparent;
  color: var(--demo-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(202, 183, 143, 0.4) transparent;
}

@media (max-width: 980px) {
  .status__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .status__entry:nth-child(odd) {
    border-right: 0;
  }

  .status__entry:not(:nth-child(3n)) {
    border-right: 1px solid var(--demo-line);
  }
}

@media (max-width: 640px) {
  .status__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .status__entry:not(:nth-child(3n)) {
    border-right: 0;
  }

  .status__entry:nth-child(odd) {
    border-right: 1px solid var(--demo-line);
  }
}

@media (max-width: 460px) {
  .status__grid {
    grid-template-columns: 1fr;
  }

  .status__entry:nth-child(odd) {
    border-right: 0;
  }
}
</style>
