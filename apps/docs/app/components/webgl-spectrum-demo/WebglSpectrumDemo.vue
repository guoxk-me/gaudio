<script setup lang="ts">
import type { Component } from 'vue'
import type { SpectrumSceneMode } from './webgl-spectrum-renderer'
import { AudioLines, Boxes, Mountain, Pause, Play, Volume2 } from '@lucide/vue'
import { computed, shallowRef } from 'vue'
import { useWebglSpectrumDemo } from '../../composables/use-webgl-spectrum-demo'
import SpectrumCanvas from './SpectrumCanvas.client.vue'

interface SceneChoice {
  description: string
  icon: Component
  id: SpectrumSceneMode
  label: string
  spectrumHint: string
}

const sceneChoices: readonly SceneChoice[] = [
  {
    id: 'tunnel',
    label: 'Spectral tunnel',
    description: 'Frequency bands travel through rings, filaments, and particles in perspective.',
    spectrumHint: 'Bass expands the tunnel · mids bend the ribbons · highs accelerate particles',
    icon: AudioLines,
  },
  {
    id: 'terrain',
    label: 'Audio terrain',
    description: 'A rolling frequency history becomes a luminous three-dimensional landscape.',
    spectrumHint: 'Frequency runs left to right · energy becomes height · history moves into depth',
    icon: Mountain,
  },
  {
    id: 'voxels',
    label: 'Voxel spectrum',
    description: 'Instanced glass columns turn the active spectrum into a responsive spatial object.',
    spectrumHint: 'Each column owns a band · amplitude controls height, light, and color',
    icon: Boxes,
  },
]

const demo = useWebglSpectrumDemo()
const activeMode = shallowRef<SpectrumSceneMode>('tunnel')
const isStageReady = shallowRef(false)
const activeScene = computed(() => sceneChoices.find(scene => scene.id === activeMode.value) ?? sceneChoices[0])
const stageClasses = computed(() => ({
  'spectrum-stage': true,
  'spectrum-stage--light': activeMode.value === 'voxels',
  [`spectrum-stage--${activeMode.value}`]: true,
}))
const statusLabel = computed(() => {
  if (!isStageReady.value) {
    return 'Preparing WebGL'
  }

  if (demo.isBusy.value) {
    return 'Loading audio'
  }

  if (demo.errorMessage.value) {
    return 'Playback error'
  }

  return demo.isPlaying.value ? 'Live spectrum' : 'Ready'
})

function onSeekInput(event: Event): void {
  const input = event.currentTarget

  if (input instanceof HTMLInputElement) {
    void demo.seekToProgress(Number(input.value) / 1000)
  }
}

function onVolumeInput(event: Event): void {
  const input = event.currentTarget

  if (input instanceof HTMLInputElement) {
    demo.setVolume(Number(input.value))
  }
}
</script>

<template>
  <main class="spectrum-demo-page">
    <div class="spectrum-demo-shell">
      <header class="spectrum-demo-header">
        <div>
          <p class="spectrum-demo-kicker">
            GAudio · WebGL spectrum lab
          </p>
          <h1 class="spectrum-demo-title">
            Three scenes. One live audio signal.
          </h1>
          <p class="spectrum-demo-intro">
            Play Aurora Loop, then switch scenes. Every view receives the same 64-band spectrum from the public
            <code>AudioAnalyzer</code> API.
          </p>
        </div>
        <div class="spectrum-demo-badge">
          <span class="spectrum-demo-badge-dot" aria-hidden="true" />
          No autoplay
        </div>
      </header>

      <nav class="scene-switcher" aria-label="Choose a WebGL spectrum scene">
        <button
          v-for="scene in sceneChoices"
          :key="scene.id"
          type="button"
          class="scene-switcher-button"
          :class="{ 'scene-switcher-button--active': activeMode === scene.id }"
          :aria-pressed="activeMode === scene.id"
          @click="activeMode = scene.id"
        >
          <component :is="scene.icon" class="scene-switcher-icon" aria-hidden="true" />
          <span>{{ scene.label }}</span>
        </button>
      </nav>

      <section :class="stageClasses" :aria-label="activeScene?.label">
        <SpectrumCanvas
          :mode="activeMode"
          :is-playing="demo.isPlaying.value"
          :progress="demo.progress.value"
          :read-spectrum="demo.readSpectrum"
          @ready="isStageReady = true"
        />

        <div class="spectrum-stage-header">
          <div class="track-identity">
            <div class="track-mark" aria-hidden="true">
              <AudioLines />
            </div>
            <div>
              <h2 class="track-title">
                Aurora Loop
              </h2>
              <p class="track-meta">
                Native MP3 · local demo asset
              </p>
            </div>
          </div>

          <div class="api-proof">
            <span>public</span>
            AudioPlayer API
          </div>
        </div>

        <div class="spectrum-stage-status" role="status">
          <span class="status-dot" aria-hidden="true" />
          {{ statusLabel }}
        </div>

        <div class="spectrum-stage-controls">
          <div class="timeline-row">
            <span>{{ demo.currentTimeLabel.value }}</span>
            <input
              class="timeline-slider"
              type="range"
              min="0"
              max="1000"
              step="1"
              :value="Math.round(demo.progress.value * 1000)"
              :disabled="demo.duration.value <= 0"
              aria-label="Seek through Aurora Loop"
              @input="onSeekInput"
            >
            <span>{{ demo.durationLabel.value }}</span>
          </div>

          <div class="transport-row">
            <button
              type="button"
              class="play-button"
              :disabled="demo.isBusy.value"
              :aria-label="demo.isPlaying.value ? 'Pause Aurora Loop' : 'Play Aurora Loop'"
              @click="demo.togglePlayback"
            >
              <Pause v-if="demo.isPlaying.value" aria-hidden="true" />
              <Play v-else aria-hidden="true" />
            </button>

            <label class="volume-control">
              <Volume2 aria-hidden="true" />
              <span class="sr-only">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="demo.volume.value"
                @input="onVolumeInput"
              >
            </label>

            <div class="spectrum-stage-summary">
              <span>Autoplay off</span>
              <span class="summary-divider" aria-hidden="true" />
              <strong>{{ activeScene?.label }}</strong>
            </div>
          </div>
        </div>
      </section>

      <div v-if="demo.errorMessage.value" class="spectrum-demo-error" role="alert">
        {{ demo.errorMessage.value }}
      </div>

      <div class="scene-explanation">
        <div>
          <p class="scene-explanation-label">
            Current mapping
          </p>
          <p class="scene-explanation-copy">
            {{ activeScene?.spectrumHint }}
          </p>
        </div>
        <p class="scene-explanation-technical">
          GAudio AudioAnalyzer · 64 bands · 30 Hz sampling · WebGL render loop
        </p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.spectrum-demo-page {
  min-height: 100vh;
  padding: 48px 24px 72px;
  color: #18161d;
  background: #fafafc;
}

.spectrum-demo-shell {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.spectrum-demo-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 28px;
}

.spectrum-demo-kicker,
.scene-explanation-label {
  margin: 0 0 10px;
  color: #6541e8;
  font-family: "Geist Mono Variable", monospace;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.spectrum-demo-title {
  max-width: 760px;
  margin: 0;
  font-size: clamp(34px, 5vw, 58px);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.02;
}

.spectrum-demo-intro {
  max-width: 720px;
  margin: 18px 0 0;
  color: #6f6b75;
  font-size: 16px;
  line-height: 1.65;
}

.spectrum-demo-intro code {
  color: #4c1d95;
  font-family: "Geist Mono Variable", monospace;
  font-size: 0.92em;
}

.spectrum-demo-badge,
.spectrum-stage-status,
.api-proof {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.spectrum-demo-badge {
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid #ddd9e6;
  border-radius: 999px;
  color: #6f6b75;
  background: #ffffff;
  font-size: 13px;
}

.spectrum-demo-badge-dot,
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c98b;
  box-shadow: 0 0 16px rgb(34 201 139 / 72%);
}

.scene-switcher {
  display: inline-flex;
  margin-bottom: 14px;
  padding: 4px;
  gap: 4px;
  border: 1px solid #ddd9e6;
  border-radius: 10px;
  background: #ffffff;
}

.scene-switcher-button {
  display: inline-flex;
  min-height: 42px;
  padding: 0 15px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 7px;
  color: #6f6b75;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 560;
}

.scene-switcher-button:hover {
  color: #4c1d95;
  background: #f8f7ff;
}

.scene-switcher-button--active {
  color: #ffffff;
  background: #6541e8;
}

.scene-switcher-button--active:hover {
  color: #ffffff;
  background: #6541e8;
}

.scene-switcher-icon {
  width: 17px;
  height: 17px;
}

.spectrum-stage {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 480px;
  border: 1px solid rgb(167 139 250 / 42%);
  border-radius: 22px;
  color: #ffffff;
  background: #070611;
  box-shadow: 0 32px 90px rgb(35 19 81 / 20%);
  isolation: isolate;
}

.spectrum-stage--light {
  color: #18161d;
  background: #f6f3ff;
  box-shadow: 0 28px 74px rgb(76 29 149 / 14%);
}

.spectrum-stage-header {
  display: flex;
  position: absolute;
  z-index: 2;
  top: 34px;
  right: 34px;
  left: 34px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  pointer-events: none;
}

.track-identity {
  display: flex;
  align-items: center;
  gap: 14px;
}

.track-mark {
  display: grid;
  width: 58px;
  height: 58px;
  flex: none;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 14px;
  color: #c4b5fd;
  background: rgb(14 11 30 / 72%);
  backdrop-filter: blur(16px);
}

.spectrum-stage--light .track-mark {
  border-color: rgb(101 65 232 / 14%);
  color: #6541e8;
  background: rgb(255 255 255 / 78%);
}

.track-mark svg {
  width: 25px;
  height: 25px;
}

.track-title {
  margin: 0 0 3px;
  font-size: 26px;
  font-weight: 620;
  letter-spacing: -0.025em;
}

.track-meta {
  margin: 0;
  color: rgb(235 231 246 / 70%);
  font-size: 14px;
}

.spectrum-stage--light .track-meta {
  color: #6f6b75;
}

.api-proof {
  gap: 7px;
  padding: 8px 12px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 999px;
  color: rgb(245 242 255 / 78%);
  background: rgb(16 12 34 / 64%);
  font-family: "Geist Mono Variable", monospace;
  font-size: 12px;
  backdrop-filter: blur(14px);
}

.api-proof span {
  color: #a78bfa;
}

.spectrum-stage--light .api-proof {
  border-color: rgb(101 65 232 / 15%);
  color: #4f4660;
  background: rgb(255 255 255 / 72%);
}

.spectrum-stage-status {
  position: absolute;
  z-index: 2;
  top: 112px;
  left: 106px;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid rgb(85 214 154 / 16%);
  border-radius: 999px;
  color: #73e6ad;
  background: rgb(10 35 27 / 66%);
  font-size: 13px;
  backdrop-filter: blur(12px);
  pointer-events: none;
}

.spectrum-stage--tunnel .spectrum-stage-header,
.spectrum-stage--voxels .spectrum-stage-header {
  top: auto;
  bottom: 176px;
  align-items: flex-end;
}

.spectrum-stage--tunnel .spectrum-stage-status,
.spectrum-stage--voxels .spectrum-stage-status {
  top: auto;
  bottom: 143px;
}

.spectrum-stage--tunnel .api-proof,
.spectrum-stage--voxels .api-proof {
  margin-bottom: -33px;
}

.spectrum-stage--light .spectrum-stage-status {
  color: #177a4e;
  background: rgb(232 246 239 / 82%);
}

.spectrum-stage-controls {
  position: absolute;
  z-index: 3;
  right: 34px;
  bottom: 30px;
  left: 34px;
  padding: 18px 20px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  background: rgb(7 6 17 / 74%);
  backdrop-filter: blur(18px);
}

.spectrum-stage--light .spectrum-stage-controls {
  border-color: rgb(101 65 232 / 13%);
  background: rgb(255 255 255 / 76%);
}

.timeline-row,
.transport-row,
.volume-control,
.spectrum-stage-summary {
  display: flex;
  align-items: center;
}

.timeline-row {
  gap: 14px;
  font-family: "Geist Mono Variable", monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.timeline-slider,
.volume-control input {
  accent-color: #8b5cf6;
}

.timeline-slider {
  width: 100%;
  min-width: 0;
}

.transport-row {
  margin-top: 12px;
  justify-content: space-between;
  gap: 18px;
}

.play-button {
  display: grid;
  width: 52px;
  height: 52px;
  flex: none;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 28%);
  border-radius: 50%;
  color: #ffffff;
  background: #7c3aed;
  box-shadow: 0 10px 30px rgb(124 58 237 / 42%);
  cursor: pointer;
}

.play-button:hover {
  background: #8b5cf6;
}

.play-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.play-button svg {
  width: 23px;
  height: 23px;
}

.volume-control {
  width: 190px;
  gap: 10px;
}

.volume-control svg {
  width: 19px;
  height: 19px;
  flex: none;
}

.volume-control input {
  width: 100%;
}

.spectrum-stage-summary {
  margin-left: auto;
  gap: 14px;
  color: rgb(235 231 246 / 70%);
  font-size: 13px;
}

.spectrum-stage-summary strong {
  color: #c4b5fd;
  font-weight: 560;
}

.spectrum-stage--light .spectrum-stage-summary {
  color: #6f6b75;
}

.spectrum-stage--light .spectrum-stage-summary strong {
  color: #6541e8;
}

.summary-divider {
  width: 1px;
  height: 20px;
  background: currentColor;
  opacity: 0.24;
}

.spectrum-demo-error {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #f3b7c2;
  border-radius: 9px;
  color: #9f2440;
  background: #fdecef;
  font-size: 14px;
}

.scene-explanation {
  display: flex;
  margin-top: 18px;
  padding: 20px 22px;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  border: 1px solid #e6e2ed;
  border-radius: 14px;
  background: #ffffff;
}

.scene-explanation-label {
  margin-bottom: 4px;
  font-size: 10px;
}

.scene-explanation-copy,
.scene-explanation-technical {
  margin: 0;
}

.scene-explanation-copy {
  color: #3e3944;
  font-size: 14px;
}

.scene-explanation-technical {
  color: #7f7986;
  font-family: "Geist Mono Variable", monospace;
  font-size: 11px;
  text-align: right;
}

.sr-only {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  border: 0;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 760px) {
  .spectrum-demo-page {
    padding: 28px 14px 48px;
  }

  .spectrum-demo-header,
  .scene-explanation {
    align-items: flex-start;
    flex-direction: column;
  }

  .spectrum-demo-title {
    font-size: 38px;
  }

  .scene-switcher {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, 1fr);
  }

  .scene-switcher-button {
    min-width: 0;
    padding: 0 9px;
    justify-content: center;
    font-size: 12px;
  }

  .spectrum-stage {
    aspect-ratio: 4 / 5;
    min-height: 620px;
    border-radius: 16px;
  }

  .spectrum-stage-header {
    top: 22px;
    right: 20px;
    left: 20px;
  }

  .track-mark {
    width: 48px;
    height: 48px;
  }

  .track-title {
    font-size: 20px;
  }

  .track-meta {
    font-size: 12px;
  }

  .api-proof {
    display: none;
  }

  .spectrum-stage-status {
    top: 88px;
    left: 82px;
  }

  .spectrum-stage-controls {
    right: 16px;
    bottom: 16px;
    left: 16px;
    padding: 14px;
  }

  .transport-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .volume-control {
    width: calc(100% - 78px);
    min-height: 52px;
  }

  .spectrum-stage-summary {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }

  .scene-explanation-technical {
    text-align: left;
  }
}
</style>
