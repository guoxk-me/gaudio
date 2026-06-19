<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeFormatGroup,
  activeTrack,
  adaptiveBitrateLabel,
  adaptiveImplementationLabel,
  adaptiveQualityChoices,
  adaptiveQualitySelection,
  applyAdaptiveQualitySelection,
  currentTimeLabel,
  durationLabel,
  isBusy,
  isMuted,
  nextTrack,
  pause,
  play,
  playerState,
  prevTrack,
  seek,
  seekRangeMax,
  seekValue,
  setMuted,
  setVolume,
  volume,
} = props.demo

const progressStyle = computed(() => ({
  width: `${Math.min(100, Math.max(0, (seekValue.value / seekRangeMax) * 100))}%`,
}))
</script>

<template>
  <section class="music-player" aria-label="Music player demo">
    <div class="music-player__art" aria-hidden="true">
      <div class="music-player__disc" />
      <div class="music-player__needle" />
    </div>

    <div class="music-player__main">
      <div class="music-player__header">
        <div>
          <p class="music-player__kicker">
            {{ activeFormatGroup.label }} · {{ adaptiveImplementationLabel }}
          </p>
          <h2>{{ activeTrack.title }}</h2>
          <p>{{ activeTrack.artist }} · {{ adaptiveBitrateLabel }}</p>
        </div>
        <strong>{{ playerState }}</strong>
      </div>

      <div class="music-player__waveform" aria-hidden="true">
        <span v-for="barIndex in 36" :key="barIndex" :style="{ height: `${18 + ((barIndex * 17) % 52)}px` }" />
      </div>

      <div class="music-player__timeline">
        <span>{{ currentTimeLabel }}</span>
        <div class="music-player__progress">
          <span :style="progressStyle" />
        </div>
        <span>{{ durationLabel }}</span>
      </div>

      <input
        v-model.number="seekValue"
        class="music-player__seek"
        type="range"
        :min="0"
        :max="seekRangeMax"
        :step="1"
        :aria-label="text.controls.seek"
        @input="seek"
      >

      <div class="music-player__transport">
        <button type="button" :disabled="isBusy" aria-label="Previous track" @click="prevTrack">
          <span aria-hidden="true">‹</span>
        </button>
        <button class="music-player__play" type="button" :disabled="isBusy" @click="play">
          {{ text.controls.play }}
        </button>
        <button type="button" @click="pause">
          {{ text.controls.pause }}
        </button>
        <button type="button" :disabled="isBusy" aria-label="Next track" @click="nextTrack">
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div class="music-player__settings">
        <label>
          <span>{{ text.controls.quality }}</span>
          <select v-model="adaptiveQualitySelection" :disabled="isBusy" @change="applyAdaptiveQualitySelection">
            <option v-for="qualityChoice in adaptiveQualityChoices" :key="qualityChoice.id" :value="qualityChoice.id">
              {{ qualityChoice.id === 'auto' ? text.controls.automaticQuality : qualityChoice.label }}
            </option>
          </select>
        </label>

        <label>
          <span>{{ text.controls.volume }}</span>
          <input v-model.number="volume" type="range" min="0" max="1" step="0.01" @input="setVolume">
        </label>

        <label class="music-player__mute">
          <input v-model="isMuted" type="checkbox" @change="setMuted">
          <span>{{ text.controls.muted }}</span>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.music-player {
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
  gap: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(8, 13, 20, 0.98), rgba(17, 24, 39, 0.94)),
    var(--vp-c-bg);
  color: #f8fafc;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
}

.music-player__art {
  position: relative;
  display: grid;
  min-height: 280px;
  place-items: center;
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(20, 184, 166, 0.22), transparent 52%),
    linear-gradient(315deg, rgba(251, 113, 133, 0.28), transparent 55%),
    #101827;
}

.music-player__disc {
  width: min(76%, 260px);
  aspect-ratio: 1;
  border: 18px solid rgba(248, 250, 252, 0.08);
  border-radius: 50%;
  background:
    radial-gradient(circle, #f8fafc 0 7%, #0f172a 7% 13%, transparent 13%),
    repeating-radial-gradient(circle, rgba(248, 250, 252, 0.16) 0 1px, transparent 1px 9px),
    linear-gradient(135deg, #22d3ee, #fb7185);
}

.music-player__needle {
  position: absolute;
  top: 38px;
  right: 44px;
  width: 8px;
  height: 132px;
  border-radius: 999px;
  transform: rotate(24deg);
  transform-origin: top;
  background: #f8fafc;
  box-shadow: 0 0 0 8px rgba(248, 250, 252, 0.08);
}

.music-player__main {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.music-player__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.music-player__header h2,
.music-player__header p,
.music-player__kicker {
  margin: 0;
}

.music-player__header h2 {
  font-size: clamp(30px, 5vw, 56px);
  line-height: 0.96;
  letter-spacing: 0;
}

.music-player__header p,
.music-player__kicker {
  color: #cbd5e1;
}

.music-player__header strong {
  border: 1px solid rgba(34, 211, 238, 0.42);
  border-radius: 8px;
  padding: 6px 10px;
  color: #67e8f9;
  font-size: 12px;
  text-transform: uppercase;
}

.music-player__waveform {
  display: grid;
  grid-template-columns: repeat(36, minmax(2px, 1fr));
  gap: 5px;
  align-items: center;
  min-height: 86px;
}

.music-player__waveform span {
  display: block;
  border-radius: 999px;
  background: linear-gradient(180deg, #67e8f9, #fb7185);
  opacity: 0.82;
}

.music-player__timeline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: #cbd5e1;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}

.music-player__progress {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.24);
}

.music-player__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, #fb7185);
}

.music-player__seek {
  width: 100%;
  accent-color: #22d3ee;
}

.music-player__transport,
.music-player__settings {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.music-player button,
.music-player select,
.music-player input[type="range"] {
  font: inherit;
}

.music-player button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  padding: 0 14px;
  background: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  cursor: pointer;
}

.music-player__play {
  border-color: transparent !important;
  background: #f8fafc !important;
  color: #0f172a !important;
  font-weight: 800;
}

.music-player__settings label {
  display: grid;
  gap: 6px;
  min-width: 160px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.music-player__settings select {
  min-height: 38px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  padding: 0 10px;
  background: #0f172a;
  color: #f8fafc;
}

.music-player__mute {
  display: flex !important;
  min-width: auto !important;
  grid-auto-flow: column;
  align-items: center;
}

@media (max-width: 760px) {
  .music-player {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .music-player__art {
    min-height: 220px;
  }

  .music-player__header {
    display: grid;
  }
}
</style>
