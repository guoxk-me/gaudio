<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { ChevronsRight, Gauge, Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX } from '@lucide/vue'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  canSeek,
  currentTimeLabel,
  durationLabel,
  fastSeek,
  isBusy,
  isMuted,
  isPaused,
  nextTrack,
  pause,
  play,
  playbackRate,
  prevTrack,
  seek,
  seekRangeMax,
  seekValue,
  setMuted,
  setPlaybackRate,
  setVolume,
  stop,
  volume,
} = props.demo

const seekSliderValue = computed({
  get: () => [seekValue.value],
  set: (values: number[]) => {
    seekValue.value = values[0] ?? 0
  },
})

const volumeSliderValue = computed({
  get: () => [volume.value],
  set: (values: number[]) => {
    volume.value = values[0] ?? 0
    setVolume()
  },
})

const rateSliderValue = computed({
  get: () => [playbackRate.value],
  set: (values: number[]) => {
    playbackRate.value = values[0] ?? 1
    setPlaybackRate()
  },
})

const playbackRateLabel = computed(() => `${playbackRate.value.toFixed(2)}x`)

// AI modified: Reka emits valueCommit before v-model, so seek from the committed payload.
async function onSeekCommit(values: number[]): Promise<void> {
  seekValue.value = values[0] ?? 0
  await seek()
}

function toggleMute(): void {
  isMuted.value = !isMuted.value
  setMuted()
}
</script>

<template>
  <section
    role="region"
    class="gaudio-studio__transport"
    :aria-label="text.controls.ariaLabel"
  >
    <!-- AI modified: a section supports this named region without conflicting with footer semantics. -->
    <!-- AI modified: split timeline and output controls so the transport bar does not collapse on wide or narrow pages. -->
    <div class="gaudio-studio__seek-row">
      <span class="gaudio-studio__time-label">{{ currentTimeLabel }}</span>
      <Slider
        v-model="seekSliderValue"
        :min="0"
        :max="seekRangeMax"
        :step="1"
        :disabled="!canSeek"
        :thumb-label="text.controls.seek"
        class="min-w-0"
        @value-commit="onSeekCommit"
      />
      <span class="gaudio-studio__time-label text-right">{{ durationLabel }}</span>
    </div>

    <div class="gaudio-studio__transport-controls">
      <div class="gaudio-studio__transport-main">
        <Button variant="ghost" size="icon-sm" class="gaudio-studio__icon-button" :disabled="isBusy" :aria-label="text.catalog.previous" @click="prevTrack">
          <SkipBack data-icon="inline-start" />
        </Button>
        <Button
          v-if="isPaused"
          size="icon"
          class="gaudio-studio__primary-play"
          :disabled="isBusy"
          :aria-label="text.controls.play"
          @click="play"
        >
          <Play data-icon="inline-start" />
        </Button>
        <Button
          v-else
          size="icon"
          class="gaudio-studio__primary-play"
          :aria-label="text.controls.pause"
          @click="pause"
        >
          <Pause data-icon="inline-start" />
        </Button>
        <Button variant="ghost" size="icon-sm" class="gaudio-studio__icon-button" :aria-label="text.controls.stop" @click="stop">
          <Square data-icon="inline-start" />
        </Button>
        <Button variant="ghost" size="icon-sm" class="gaudio-studio__icon-button" :disabled="isBusy" :aria-label="text.catalog.next" @click="nextTrack">
          <SkipForward data-icon="inline-start" />
        </Button>
      </div>

      <div class="gaudio-studio__output-controls">
        <div class="gaudio-studio__control-cluster" role="group" :aria-label="text.controls.volume">
          <Button variant="ghost" size="icon-sm" class="gaudio-studio__icon-button" :aria-label="isMuted ? text.controls.unmute : text.controls.mute" @click="toggleMute">
            <VolumeX v-if="isMuted" data-icon="inline-start" />
            <Volume2 v-else data-icon="inline-start" />
          </Button>
          <Slider
            v-model="volumeSliderValue"
            :min="0"
            :max="1"
            :step="0.01"
            :thumb-label="text.controls.volume"
            class="gaudio-studio__volume-slider"
          />
        </div>

        <div class="gaudio-studio__control-cluster gaudio-studio__rate-control" role="group" :aria-label="text.controls.playbackRate">
          <Gauge class="size-3.5" style="color: var(--gaudio-studio-text-muted)" />
          <Slider
            v-model="rateSliderValue"
            :min="0.5"
            :max="2"
            :step="0.05"
            :thumb-label="text.controls.playbackRate"
            class="gaudio-studio__rate-slider"
          />
          <span class="gaudio-studio__rate-label">{{ playbackRateLabel }}</span>
        </div>

        <Button variant="outline" size="sm" class="gaudio-studio__quick-seek" :disabled="!canSeek" @click="fastSeek">
          <ChevronsRight data-icon="inline-start" />
          <span>{{ text.controls.fastSeek }}</span>
        </Button>
      </div>
    </div>
  </section>
</template>
