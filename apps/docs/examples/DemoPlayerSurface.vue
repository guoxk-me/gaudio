<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import DemoVisualization from './DemoVisualization.vue'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeFormatGroup,
  activeSamplePath,
  activeTrack,
  adaptiveImplementationLabel,
  currentTimeLabel,
  demoFormatGroups,
  durationLabel,
  fastSeek,
  isBusy,
  isActiveFormat,
  isMuted,
  nextTrack,
  pause,
  play,
  playbackRate,
  playerState,
  prevTrack,
  selectFormat,
  seek,
  seekRangeMax,
  seekValue,
  setMuted,
  setPlaybackRate,
  setVolume,
  stop,
  volume,
} = props.demo

const progressStyle = computed(() => ({
  width: `${Math.min(100, Math.max(0, (seekValue.value / seekRangeMax) * 100))}%`,
}))

// AI modified: keep the main player metadata useful even when source tags are absent.
const playerMetaItems = computed(() => [
  activeFormatGroup.value.label,
  adaptiveImplementationLabel.value,
  playerState.value,
])
</script>

<template>
  <section class="music-player" aria-label="Music player demo">
    <div class="music-player__now-playing">
      <div class="music-player__art" aria-hidden="true">
        <span>{{ activeFormatGroup.label }}</span>
      </div>

      <div class="music-player__identity">
        <p class="music-player__kicker">
          {{ text.catalog.bundledSample }} / {{ activeFormatGroup.extension }}
        </p>
        <h2 :title="activeTrack.title">
          {{ activeTrack.title }}
        </h2>
        <p class="music-player__meta" :title="activeSamplePath">
          <span v-for="metaItem in playerMetaItems" :key="metaItem">{{ metaItem }}</span>
        </p>

        <div class="music-player__samples" role="tablist" :aria-label="text.catalog.format">
          <button
            v-for="formatGroup in demoFormatGroups"
            :key="formatGroup.folder"
            type="button"
            role="tab"
            :aria-selected="isActiveFormat(formatGroup.folder)"
            :class="{ 'music-player__sample--active': isActiveFormat(formatGroup.folder) }"
            :disabled="isBusy"
            @click="selectFormat(formatGroup)"
          >
            {{ formatGroup.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- AI modified: align transport controls and the scrubber in one playback row. -->
    <div class="music-player__playback" aria-label="Playback controls">
      <span class="music-player__time">{{ currentTimeLabel }}</span>

      <div class="music-player__transport">
        <button class="music-player__icon-button" type="button" :disabled="isBusy" aria-label="Previous track" @click="prevTrack">
          <span aria-hidden="true">‹</span>
        </button>
        <button class="music-player__play-button" type="button" :disabled="isBusy" :aria-label="text.controls.play" @click="play">
          <span class="music-player__play-icon" aria-hidden="true" />
        </button>
        <button class="music-player__icon-button" type="button" :aria-label="text.controls.pause" @click="pause">
          <span class="music-player__pause-icon" aria-hidden="true" />
        </button>
        <button class="music-player__icon-button" type="button" :aria-label="text.controls.stop" @click="stop">
          <span class="music-player__stop-icon" aria-hidden="true" />
        </button>
        <button class="music-player__icon-button" type="button" :disabled="isBusy" aria-label="Next track" @click="nextTrack">
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div class="music-player__scrubber">
        <div class="music-player__progress" aria-hidden="true">
          <span :style="progressStyle" />
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
      </div>

      <span class="music-player__time">{{ durationLabel }}</span>
    </div>

    <div class="music-player__settings">
      <label>
        <span>{{ text.controls.volume }}</span>
        <input v-model.number="volume" type="range" min="0" max="1" step="0.01" @input="setVolume">
      </label>

      <label>
        <span>{{ text.controls.playbackRate }}</span>
        <input v-model.number="playbackRate" type="range" min="0.5" max="2" step="0.05" @input="setPlaybackRate">
      </label>

      <label class="music-player__mute">
        <input v-model="isMuted" type="checkbox" @change="setMuted">
        <span class="music-player__checkmark" aria-hidden="true" />
        <span>{{ text.controls.muted }}</span>
      </label>

      <button class="music-player__secondary" type="button" :disabled="isBusy" @click="fastSeek">
        {{ text.controls.fastSeek }}
      </button>
    </div>

    <DemoVisualization :demo="demo" :text="text" />
  </section>
</template>

<style scoped>
.music-player {
  display: grid;
  gap: clamp(12px, 1.7vw, 16px);
  min-width: 0;
  border: 1px solid var(--demo-border);
  border-radius: 8px;
  padding: clamp(16px, 2.2vw, 22px);
  background:
    radial-gradient(circle at 0 0, rgba(224, 162, 74, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 30%),
    var(--demo-surface);
  color: var(--demo-text);
}

.music-player :focus-visible {
  outline: 2px solid var(--demo-focus);
  outline-offset: 3px;
}

.music-player__now-playing {
  display: grid;
  grid-template-columns: clamp(72px, 8vw, 96px) minmax(0, 1fr);
  gap: clamp(14px, 2vw, 20px);
  align-items: center;
  border-bottom: 1px solid var(--demo-line);
  padding-bottom: clamp(14px, 2vw, 18px);
}

.music-player__art {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border: 1px solid rgba(217, 154, 66, 0.28);
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 50%, rgba(243, 239, 230, 0.94) 0 8%, transparent 9%),
    radial-gradient(circle at 50% 50%, transparent 0 24%, rgba(217, 154, 66, 0.32) 25% 26%, transparent 27%),
    linear-gradient(135deg, rgba(217, 154, 66, 0.96), rgba(143, 188, 102, 0.7) 55%, rgba(15, 20, 18, 0.92));
  box-shadow: inset 0 0 24px rgba(11, 15, 14, 0.48);
}

.music-player__art span {
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(11, 15, 14, 0.72);
  color: var(--demo-text);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 800;
}

.music-player__identity {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.music-player__identity h2,
.music-player__identity p {
  margin: 0;
}

.music-player__identity h2 {
  color: var(--demo-text);
  font-size: clamp(24px, 3vw, 38px);
  line-height: 1.08;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.music-player__kicker {
  color: var(--demo-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.music-player__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--demo-muted);
  font-size: 13px;
}

.music-player__meta span + span::before {
  content: "·";
  margin-right: 8px;
  color: rgba(168, 159, 139, 0.72);
}

.music-player__samples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

.music-player__samples button {
  min-height: 28px !important;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
}

.music-player__sample--active {
  border-color: rgba(217, 154, 66, 0.72) !important;
  background: rgba(217, 154, 66, 0.18) !important;
  color: var(--demo-amber-strong) !important;
}

.music-player__playback {
  display: grid;
  grid-template-columns: auto auto minmax(180px, 1fr) auto;
  gap: 14px;
  align-items: center;
  border-bottom: 1px solid var(--demo-line);
  padding-bottom: 14px;
}

.music-player__transport {
  display: inline-flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 8px;
  align-items: center;
  border: 1px solid rgba(202, 183, 143, 0.12);
  border-radius: 999px;
  padding: 5px;
  background: var(--demo-transport-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.music-player button,
.music-player select,
.music-player input {
  font: inherit;
}

.music-player button,
.music-player select {
  min-height: 38px;
  border: 1px solid var(--demo-line);
  border-radius: 6px;
  background: var(--demo-control);
  color: var(--demo-text);
}

.music-player button {
  padding: 0 13px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.music-player button:hover:not(:disabled) {
  border-color: rgba(245, 189, 100, 0.38);
  background: rgba(245, 189, 100, 0.1);
  transform: translateY(-1px);
}

.music-player button:active:not(:disabled) {
  transform: translateY(0);
}

.music-player button:disabled,
.music-player select:disabled {
  cursor: wait;
  opacity: 0.6;
}

.music-player__icon-button,
.music-player__play-button {
  display: inline-grid;
  place-items: center;
  border-radius: 999px !important;
  padding: 0 !important;
  font-weight: 800;
}

.music-player__icon-button {
  width: 34px;
  height: 34px;
}

.music-player__play-button {
  width: 46px;
  height: 46px;
  border-color: rgba(217, 154, 66, 0.68) !important;
  background:
    linear-gradient(180deg, rgba(245, 189, 100, 0.34), rgba(224, 162, 74, 0.18)),
    rgba(217, 154, 66, 0.18) !important;
  color: var(--demo-amber-strong) !important;
  font-weight: 800;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 10px 28px rgba(0, 0, 0, 0.2);
}

.music-player__play-icon {
  width: 0;
  height: 0;
  margin-left: 3px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 11px solid currentColor;
}

.music-player__pause-icon {
  width: 10px;
  height: 14px;
  border-right: 3px solid currentColor;
  border-left: 3px solid currentColor;
}

.music-player__stop-icon {
  width: 10px;
  height: 10px;
  background: currentColor;
}

.music-player__secondary {
  min-height: 34px !important;
  margin-left: auto;
  padding: 0 14px !important;
  font-size: 13px;
  font-weight: 700;
}

.music-player__time {
  color: var(--demo-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.music-player__scrubber {
  position: relative;
  display: grid;
  align-items: center;
  min-width: 0;
  min-height: 26px;
}

.music-player__progress {
  position: absolute;
  right: 0;
  left: 0;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
    rgba(166, 156, 132, 0.18);
}

.music-player__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--demo-amber), var(--demo-amber-strong));
}

.music-player__seek {
  position: relative;
  width: 100%;
  height: 26px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.music-player__seek::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 999px;
  background: transparent;
}

.music-player__seek::-webkit-slider-thumb {
  width: 18px;
  height: 18px;
  margin-top: -5px;
  appearance: none;
  border: 2px solid var(--demo-thumb-border);
  border-radius: 999px;
  background: var(--demo-amber-strong);
  box-shadow:
    0 0 0 4px rgba(224, 162, 74, 0.15),
    0 4px 14px rgba(0, 0, 0, 0.34);
}

.music-player__seek::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: transparent;
}

.music-player__seek::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid var(--demo-thumb-border);
  border-radius: 999px;
  background: var(--demo-amber-strong);
  box-shadow:
    0 0 0 4px rgba(224, 162, 74, 0.15),
    0 4px 14px rgba(0, 0, 0, 0.34);
}

.music-player__settings {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--demo-line);
  padding-bottom: 14px;
}

.music-player__settings label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  color: var(--demo-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.music-player__settings label > span {
  white-space: nowrap;
}

.music-player__settings input[type="range"] {
  width: 100%;
  min-width: 0;
  appearance: none;
  height: 22px;
  background: transparent;
  cursor: pointer;
}

.music-player__settings input[type="range"]::-webkit-slider-runnable-track {
  height: 7px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
    rgba(166, 156, 132, 0.22);
}

.music-player__settings input[type="range"]::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -4.5px;
  appearance: none;
  border: 2px solid var(--demo-thumb-border);
  border-radius: 999px;
  background: var(--demo-amber-strong);
  box-shadow: 0 0 0 3px rgba(224, 162, 74, 0.13);
}

.music-player__settings input[type="range"]::-moz-range-track {
  height: 7px;
  border-radius: 999px;
  background: rgba(166, 156, 132, 0.22);
}

.music-player__settings input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid var(--demo-thumb-border);
  border-radius: 999px;
  background: var(--demo-amber-strong);
  box-shadow: 0 0 0 3px rgba(224, 162, 74, 0.13);
}

.music-player__mute {
  position: relative;
  display: flex !important;
  gap: 7px;
  align-items: center;
  text-transform: none !important;
  white-space: nowrap;
  cursor: pointer;
}

.music-player__mute input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.music-player__checkmark {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(202, 183, 143, 0.32);
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
    var(--demo-input-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.music-player__checkmark::after {
  width: 8px;
  height: 4px;
  border-bottom: 2px solid var(--demo-check-icon);
  border-left: 2px solid var(--demo-check-icon);
  content: "";
  opacity: 0;
  transform: translateY(-1px) rotate(-45deg);
}

.music-player__mute input:checked + .music-player__checkmark {
  border-color: rgba(245, 189, 100, 0.82);
  background: linear-gradient(180deg, var(--demo-amber-strong), var(--demo-amber));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 0 0 3px rgba(224, 162, 74, 0.14);
}

.music-player__mute input:checked + .music-player__checkmark::after {
  opacity: 1;
}

.music-player__mute input:focus-visible + .music-player__checkmark {
  outline: 2px solid var(--demo-focus);
  outline-offset: 2px;
}

@media (max-width: 860px) {
  .music-player__now-playing {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .music-player__playback {
    grid-template-columns: auto 1fr auto;
  }

  .music-player__transport {
    grid-column: 1 / -1;
    grid-row: 1;
    width: fit-content;
    margin-inline: auto;
  }

  .music-player__time:first-child {
    grid-column: 1;
    grid-row: 2;
  }

  .music-player__time:last-child {
    grid-column: 3;
    grid-row: 2;
  }

  .music-player__scrubber {
    grid-column: 2;
    grid-row: 2;
  }

  .music-player__settings {
    grid-template-columns: 1fr 1fr;
  }

  .music-player__secondary {
    width: fit-content;
    margin-left: 0;
  }
}

@media (max-width: 560px) {
  .music-player {
    padding: 14px;
  }

  .music-player__now-playing {
    grid-template-columns: 1fr;
  }

  .music-player__art {
    display: none;
  }

  .music-player__settings {
    grid-template-columns: 1fr;
  }

  /* AI modified: keep media controls readable instead of shrinking them into the narrow viewport. */
  .music-player__settings label {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .music-player__playback {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
  }

  .music-player__transport {
    gap: 6px;
  }

  .music-player__icon-button {
    width: 34px;
    height: 34px;
  }

  .music-player__play-button {
    width: 44px;
    height: 44px;
  }
}
</style>
