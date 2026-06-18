<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeSampleLabel,
  adaptiveQualityChoices,
  adaptiveQualitySelection,
  applyAdaptiveQualitySelection,
  currentTimeLabel,
  durationLabel,
  fastSeek,
  isBusy,
  isLooping,
  isMuted,
  loadSource,
  pause,
  play,
  playbackRate,
  playerState,
  preload,
  protocolOverride,
  seek,
  seekRangeMax,
  seekValue,
  setAutoplay,
  setLoop,
  setMuted,
  setPlaybackRate,
  setPreload,
  setPreservesPitch,
  setVolume,
  shouldAutoplay,
  shouldPreservePitch,
  sourceMode,
  sourceUrl,
  stop,
  volume,
} = props.demo
</script>

<template>
  <section class="controls" :aria-label="text.controls.ariaLabel">
    <header class="controls__summary">
      <strong>{{ activeSampleLabel }}</strong>
      <span>{{ playerState }}</span>
    </header>

    <label class="controls__field">
      <span>{{ text.controls.sourceUrl }}</span>
      <input v-model="sourceUrl" type="url" autocomplete="off">
    </label>

    <label class="controls__field">
      <span>{{ text.controls.protocol }}</span>
      <select v-model="protocolOverride">
        <option value="auto">auto</option>
        <option value="media">media</option>
        <option value="hls">HLS</option>
        <option value="dash">DASH</option>
      </select>
    </label>

    <label class="controls__field">
      <span>{{ text.controls.sourceMode }}</span>
      <select v-model="sourceMode">
        <option value="url-string">{{ text.controls.sourceModes.urlString }}</option>
        <option value="source-description">{{ text.controls.sourceModes.sourceDescription }}</option>
        <option value="http-source">{{ text.controls.sourceModes.httpSource }}</option>
        <option value="custom-source">{{ text.controls.sourceModes.customSource }}</option>
      </select>
    </label>

    <label class="controls__field">
      <span>{{ text.controls.quality }}</span>
      <select v-model="adaptiveQualitySelection" :disabled="isBusy" @change="applyAdaptiveQualitySelection">
        <option v-for="qualityChoice in adaptiveQualityChoices" :key="qualityChoice.id" :value="qualityChoice.id">
          {{ qualityChoice.id === 'automatic' ? text.controls.automaticQuality : qualityChoice.label }}
        </option>
      </select>
    </label>

    <div class="controls__actions">
      <button type="button" :disabled="isBusy" @click="loadSource">
        {{ text.controls.loadUrl }}
      </button>
      <button type="button" :disabled="isBusy" @click="play">
        {{ text.controls.play }}
      </button>
      <button type="button" @click="pause">
        {{ text.controls.pause }}
      </button>
      <button type="button" @click="stop">
        {{ text.controls.stop }}
      </button>
      <button type="button" :disabled="isBusy" @click="fastSeek">
        {{ text.controls.fastSeek }}
      </button>
    </div>

    <div class="controls__timeline">
      <span>{{ currentTimeLabel }}</span>
      <span>{{ durationLabel }}</span>
    </div>
    <input
      v-model.number="seekValue"
      type="range"
      :min="0"
      :max="seekRangeMax"
      :step="1"
      :aria-label="text.controls.seek"
      @input="seek"
    >

    <label class="controls__field">
      <span>{{ text.controls.volume }}</span>
      <input v-model.number="volume" type="range" min="0" max="1" step="0.01" @input="setVolume">
    </label>

    <label class="controls__field">
      <span>{{ text.controls.playbackRate }}</span>
      <input v-model.number="playbackRate" type="range" min="0.5" max="2" step="0.05" @input="setPlaybackRate">
    </label>

    <div class="controls__options">
      <label><input v-model="isMuted" type="checkbox" @change="setMuted"> {{ text.controls.muted }}</label>
      <label><input v-model="isLooping" type="checkbox" @change="setLoop"> {{ text.controls.loop }}</label>
      <label><input v-model="shouldAutoplay" type="checkbox" @change="setAutoplay"> {{ text.controls.autoplay }}</label>
      <label><input v-model="shouldPreservePitch" type="checkbox" @change="setPreservesPitch"> {{ text.controls.preservePitch }}</label>
      <label>
        {{ text.controls.preload }}
        <select v-model="preload" @change="setPreload">
          <option value="none">none</option>
          <option value="metadata">metadata</option>
          <option value="auto">auto</option>
        </select>
      </label>
    </div>
  </section>
</template>

<style scoped>
.controls {
  display: grid;
  gap: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.controls__summary,
.controls__timeline,
.controls__actions,
.controls__options {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.controls__summary span {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.controls__field {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

.controls input[type="url"],
.controls select {
  min-height: 38px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.controls input[type="range"] {
  width: 100%;
  accent-color: var(--vp-c-brand-1);
}

.controls button {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--vp-c-brand-1);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.controls button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.controls__options label {
  font-size: 14px;
}
</style>
