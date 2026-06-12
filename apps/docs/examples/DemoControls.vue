<script setup lang="ts">
import type { GaudioDemo } from './use-gaudio-demo'

const props = defineProps<{
  demo: GaudioDemo
}>()

const {
  activeSampleLabel,
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
  sourceUrl,
  stop,
  volume,
} = props.demo
</script>

<template>
  <section class="controls" aria-label="Audio player controls">
    <header class="controls__summary">
      <strong>{{ activeSampleLabel }}</strong>
      <span>{{ playerState }}</span>
    </header>

    <label class="controls__field">
      <span>Source URL</span>
      <input v-model="sourceUrl" type="url" autocomplete="off">
    </label>

    <label class="controls__field">
      <span>Protocol</span>
      <select v-model="protocolOverride">
        <option value="auto">auto</option>
        <option value="media">media</option>
        <option value="hls">HLS</option>
        <option value="dash">DASH</option>
      </select>
    </label>

    <div class="controls__actions">
      <button type="button" :disabled="isBusy" @click="loadSource">
        Load URL
      </button>
      <button type="button" :disabled="isBusy" @click="play">
        Play
      </button>
      <button type="button" @click="pause">
        Pause
      </button>
      <button type="button" @click="stop">
        Stop
      </button>
      <button type="button" :disabled="isBusy" @click="fastSeek">
        Fast seek
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
      aria-label="Seek"
      @input="seek"
    >

    <label class="controls__field">
      <span>Volume</span>
      <input v-model.number="volume" type="range" min="0" max="1" step="0.01" @input="setVolume">
    </label>

    <label class="controls__field">
      <span>Playback rate</span>
      <input v-model.number="playbackRate" type="range" min="0.5" max="2" step="0.05" @input="setPlaybackRate">
    </label>

    <div class="controls__options">
      <label><input v-model="isMuted" type="checkbox" @change="setMuted"> Muted</label>
      <label><input v-model="isLooping" type="checkbox" @change="setLoop"> Loop</label>
      <label><input v-model="shouldAutoplay" type="checkbox" @change="setAutoplay"> Autoplay</label>
      <label><input v-model="shouldPreservePitch" type="checkbox" @change="setPreservesPitch"> Preserve pitch</label>
      <label>
        Preload
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
