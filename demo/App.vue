<script setup lang="ts">
import { useGaudioDemo } from './composables/use-gaudio-demo'

const {
  sourceUrl,
  demoTracks,
  demoFormatGroups,
  activeTrack,
  activeFormatGroup,
  activeSampleLabel,
  activeSamplePath,
  playerState,
  bufferedLabel,
  seekableLabel,
  playbackRateLabel,
  currentTimeLabel,
  durationLabel,
  seekValue,
  seekRangeMax,
  volume,
  playbackRate,
  preload,
  isMuted,
  isLooping,
  isPaused,
  isEnded,
  isSeeking,
  eventLog,
  isBusy,
  selectTrack,
  selectFormat,
  nextTrack,
  prevTrack,
  loadSource,
  isActiveTrack,
  isActiveFormat,
  play,
  pause,
  stop,
  seek,
  setVolume,
  setMuted,
  setLoop,
  setPreload,
  setPlaybackRate,
} = useGaudioDemo()
</script>

<template>
  <main>
    <h1>gaudio demo</h1>
    <p class="subtitle">
      Switch tracks and formats from <code>demo/public/</code>, then exercise load, play, seek, volume,
      playback rate, preload, mute, and loop against real browser audio files.
    </p>

    <section class="panel catalog" aria-label="Local sample catalog">
      <div class="catalog-header">
        <div>
          <p class="eyebrow">
            Now playing sample
          </p>
          <h2>{{ activeTrack.title }}</h2>
          <p class="catalog-meta">
            {{ activeTrack.artist }} · {{ activeFormatGroup.label }} · {{ activeFormatGroup.mimeType }}
          </p>
        </div>
        <div class="track-nav">
          <button class="secondary" type="button" :disabled="isBusy" @click="prevTrack">
            Previous
          </button>
          <button class="secondary" type="button" :disabled="isBusy" @click="nextTrack">
            Next
          </button>
        </div>
      </div>

      <div class="selector-block">
        <p class="selector-label">
          Format
        </p>
        <div class="format-tabs" role="tablist" aria-label="Audio format">
          <button
            v-for="formatGroup in demoFormatGroups"
            :key="formatGroup.folder"
            type="button"
            class="format-tab"
            role="tab"
            :aria-selected="isActiveFormat(formatGroup.folder)"
            :class="{ active: isActiveFormat(formatGroup.folder) }"
            :disabled="isBusy"
            @click="selectFormat(formatGroup)"
          >
            <span>{{ formatGroup.label }}</span>
            <span class="format-extension">{{ formatGroup.extension }}</span>
          </button>
        </div>
      </div>

      <div class="selector-block">
        <p class="selector-label">
          Track
        </p>
        <div class="track-grid">
          <button
            v-for="track in demoTracks"
            :key="track.id"
            type="button"
            class="track-card"
            :class="{ active: isActiveTrack(track.id) }"
            :disabled="isBusy"
            @click="selectTrack(track)"
          >
            <span class="track-title">{{ track.title }}</span>
            <span class="track-artist">{{ track.artist }}</span>
            <span class="track-path">{{ activeFormatGroup.folder }}/{{ track.id }}{{ activeFormatGroup.extension }}</span>
          </button>
        </div>
      </div>

      <div class="sample-path">
        <span>Current file</span>
        <code>{{ activeSamplePath }}</code>
      </div>
    </section>

    <div class="workspace">
      <section class="panel player" aria-label="Audio player controls">
        <div class="player-summary">
          <strong>{{ activeSampleLabel }}</strong>
          <span>{{ playerState }}</span>
        </div>

        <label for="sourceUrl">Source URL</label>
        <input
          id="sourceUrl"
          v-model="sourceUrl"
          type="url"
          autocomplete="off"
        >

        <div class="actions">
          <button type="button" :disabled="isBusy" @click="loadSource">
            Load URL
          </button>
          <button type="button" :disabled="isBusy" @click="play">
            Play
          </button>
          <button class="secondary" type="button" @click="pause">
            Pause
          </button>
          <button class="warning" type="button" @click="stop">
            Stop
          </button>
        </div>

        <div class="meter">
          <div class="meter-top">
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
        </div>

        <div class="ranges">
          <div>
            <label for="volumeRange">Volume</label>
            <input
              id="volumeRange"
              v-model.number="volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              @input="setVolume"
            >
          </div>
          <div>
            <label for="rateRange">Playback rate</label>
            <input
              id="rateRange"
              v-model.number="playbackRate"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              @input="setPlaybackRate"
            >
          </div>
        </div>

        <div class="media-options">
          <label class="toggle-control">
            <input v-model="isMuted" type="checkbox" @change="setMuted">
            <span>Muted</span>
          </label>
          <label class="toggle-control">
            <input v-model="isLooping" type="checkbox" @change="setLoop">
            <span>Loop</span>
          </label>
          <label class="preload-control" for="preloadSelect">
            <span>Preload</span>
            <select id="preloadSelect" v-model="preload" @change="setPreload">
              <option value="none">none</option>
              <option value="metadata">metadata</option>
              <option value="auto">auto</option>
            </select>
          </label>
        </div>

        <div class="status-grid">
          <div class="stat">
            <span>State</span>
            <strong>{{ playerState }}</strong>
          </div>
          <div class="stat">
            <span>Format</span>
            <strong>{{ activeFormatGroup.label }}</strong>
          </div>
          <div class="stat">
            <span>Buffered</span>
            <strong>{{ bufferedLabel }}</strong>
          </div>
          <div class="stat">
            <span>Seekable</span>
            <strong>{{ seekableLabel }}</strong>
          </div>
          <div class="stat">
            <span>Rate</span>
            <strong>{{ playbackRateLabel }}</strong>
          </div>
          <div class="stat">
            <span>Paused</span>
            <strong>{{ isPaused }}</strong>
          </div>
          <div class="stat">
            <span>Ended</span>
            <strong>{{ isEnded }}</strong>
          </div>
          <div class="stat">
            <span>Seeking</span>
            <strong>{{ isSeeking }}</strong>
          </div>
        </div>
      </section>

      <aside class="panel log" aria-label="Player event log">
        <h2>Events</h2>
        <ol class="events">
          <li v-for="event in eventLog" :key="event">
            {{ event }}
          </li>
        </ol>
      </aside>
    </div>
  </main>
</template>

<style>
:root {
  color-scheme: light;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  background: #f7f8f3;
  color: #202420;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 243, 0.96)),
    #f7f8f3;
}

main {
  width: min(1080px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 20px;
  align-items: start;
}

.panel {
  border: 1px solid #d9ded5;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(31, 36, 31, 0.08);
}

.catalog {
  margin-bottom: 20px;
  padding: 22px 24px;
}

.catalog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #667066;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.catalog h2 {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2rem);
}

.catalog-meta {
  margin: 8px 0 0;
  color: #5d665d;
}

.track-nav {
  display: flex;
  gap: 8px;
}

.selector-block + .selector-block {
  margin-top: 18px;
}

.selector-label {
  margin: 0 0 10px;
  color: #3f493f;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.format-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.format-tab {
  display: grid;
  gap: 4px;
  min-height: 72px;
  border: 1px solid #cbd3ca;
  border-radius: 8px;
  padding: 12px;
  background: #f8faf6;
  color: #202420;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.format-tab.active {
  border-color: #0f766e;
  background: #ecf7f4;
  box-shadow: inset 0 0 0 1px #0f766e;
}

.format-extension {
  color: #667066;
  font-size: 0.82rem;
  font-weight: 600;
}

.track-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.track-card {
  display: grid;
  gap: 4px;
  min-height: 96px;
  border: 1px solid #cbd3ca;
  border-radius: 8px;
  padding: 14px;
  background: #f8faf6;
  color: #202420;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.track-card.active {
  border-color: #0f766e;
  background: #ecf7f4;
  box-shadow: inset 0 0 0 1px #0f766e;
}

.track-title {
  font-weight: 800;
}

.track-artist {
  color: #667066;
  font-size: 0.88rem;
  font-weight: 600;
}

.track-path {
  color: #7a847a;
  font-size: 0.76rem;
  word-break: break-all;
}

.sample-path {
  display: grid;
  gap: 6px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #e6ebe4;
}

.sample-path span {
  color: #667066;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sample-path code {
  overflow-wrap: anywhere;
  border-radius: 6px;
  background: #f3f6f0;
  padding: 10px 12px;
  color: #1e2922;
  font-size: 0.86rem;
}

.player {
  padding: 24px;
}

.player-summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f3f6f0;
}

.player-summary strong {
  font-size: 1rem;
}

.player-summary span {
  color: #667066;
  font-size: 0.88rem;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 6px;
  font-size: clamp(1.8rem, 4vw, 3rem);
  line-height: 1;
}

.subtitle {
  margin: 0 0 24px;
  color: #5d665d;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #3f493f;
  font-size: 0.9rem;
  font-weight: 700;
}

input[type="url"] {
  width: 100%;
  min-height: 44px;
  border: 1px solid #cbd3ca;
  border-radius: 6px;
  padding: 0 12px;
  color: #202420;
  font: inherit;
}

input[type="range"] {
  width: 100%;
  accent-color: #0f766e;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0 22px;
}

button {
  min-height: 42px;
  border: 0;
  border-radius: 6px;
  padding: 0 16px;
  background: #1f332f;
  color: #ffffff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

button.secondary {
  border: 1px solid #cbd3ca;
  background: #ffffff;
  color: #26302b;
}

button.warning {
  background: #bd4d2f;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.meter {
  display: grid;
  gap: 10px;
  margin: 14px 0 20px;
}

.meter-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: #4e584f;
  font-size: 0.92rem;
}

.ranges {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.media-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.toggle-control,
.preload-control {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  margin: 0;
  border-radius: 8px;
  background: #f3f6f0;
  padding: 10px 12px;
}

.toggle-control input {
  width: 18px;
  height: 18px;
  accent-color: #0f766e;
}

.preload-control {
  justify-content: space-between;
}

.preload-control select {
  border: 1px solid #cbd3ca;
  border-radius: 6px;
  background: #ffffff;
  padding: 6px 8px;
  color: #202420;
  font: inherit;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.stat {
  min-height: 76px;
  border-radius: 8px;
  background: #f3f6f0;
  padding: 12px;
}

.stat span {
  display: block;
  margin-bottom: 8px;
  color: #667066;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.stat strong {
  color: #1e2922;
  font-size: 1.05rem;
}

.log {
  padding: 20px;
}

.log h2 {
  margin: 0 0 14px;
  font-size: 1rem;
}

.events {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.events li {
  border-left: 3px solid #c99b33;
  border-radius: 4px;
  background: #fbfaf1;
  padding: 10px 12px;
  color: #3d433c;
  font-size: 0.9rem;
}

@media (max-width: 860px) {
  .format-tabs,
  .track-grid,
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  main {
    width: min(100% - 20px, 1080px);
    padding: 18px 0;
  }

  .catalog-header {
    flex-direction: column;
  }

  .format-tabs,
  .track-grid,
  .workspace,
  .ranges,
  .media-options,
  .status-grid {
    grid-template-columns: 1fr;
  }

  .player {
    padding: 18px;
  }

  button {
    flex: 1 1 130px;
  }
}
</style>
