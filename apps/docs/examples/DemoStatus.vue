<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { demoEventForDisplay, demoStatusForDisplay } from './demo-i18n'

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
  [props.text.status.labels.state, demoStatusForDisplay(playerState.value, props.text)],
  [props.text.status.labels.buffered, demoStatusForDisplay(bufferedLabel.value, props.text)],
  [props.text.status.labels.seekable, demoStatusForDisplay(seekableLabel.value, props.text)],
  [props.text.status.labels.played, demoStatusForDisplay(playedLabel.value, props.text)],
  [props.text.status.labels.rate, playbackRateLabel.value],
  [props.text.status.labels.paused, demoStatusForDisplay(isPaused.value, props.text)],
  [props.text.status.labels.ended, demoStatusForDisplay(isEnded.value, props.text)],
  [props.text.status.labels.seeking, demoStatusForDisplay(isSeeking.value, props.text)],
  [props.text.status.labels.implementation, demoStatusForDisplay(adaptiveImplementationLabel.value, props.text)],
  [props.text.status.labels.manifest, demoStatusForDisplay(manifestVariantLabel.value, props.text)],
  [props.text.status.labels.variant, demoStatusForDisplay(adaptiveVariantLabel.value, props.text)],
  [props.text.status.labels.bitrate, demoStatusForDisplay(adaptiveBitrateLabel.value, props.text)],
  [props.text.status.labels.quality, demoStatusForDisplay(adaptiveQualityControlLabel.value, props.text)],
  [props.text.status.labels.segment, demoStatusForDisplay(segmentLabel.value, props.text)],
] as const)

const eventTimeFormatter = computed(() => new Intl.DateTimeFormat(
  props.text.locale === 'zh' ? 'zh-CN' : 'en-US',
  {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  },
))

function eventTimeForDisplay(timestamp: number): string {
  return eventTimeFormatter.value.format(timestamp)
}
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
      <!-- AI modified: the live region wraps the native list so assistive technology keeps both semantics. -->
      <div
        role="log"
        class="max-h-72 overflow-auto pl-5 font-mono text-xs leading-relaxed"
        style="color: var(--gaudio-studio-text-muted)"
        tabindex="0"
        :aria-label="text.status.events"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <ol>
          <!-- AI modified: stable event ids and render-time translation keep repeated localized events distinct. -->
          <li v-for="eventEntry in eventLog" :key="eventEntry.id" class="mb-1">
            <time :datetime="new Date(eventEntry.timestamp).toISOString()">
              {{ eventTimeForDisplay(eventEntry.timestamp) }}
            </time>
            {{ demoEventForDisplay(eventEntry.message, text) }}
          </li>
        </ol>
      </div>
    </div>
  </aside>
</template>
