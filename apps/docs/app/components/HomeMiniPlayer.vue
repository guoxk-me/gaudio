<script setup lang="ts">
import type { HomeMiniPlayerController, HomeSourceKind } from '../composables/use-home-mini-player'
import { ArrowUpRight, AudioWaveform, LoaderCircle, Pause, Play, SkipBack, SkipForward, Terminal, Volume2, VolumeX } from '@lucide/vue'
import { computed, shallowRef } from 'vue'
import { demoTracks } from '../../examples/demo-samples'

const props = defineProps<{
  controller: HomeMiniPlayerController
}>()

const { isChinese } = useDocumentationLocale()
const previousVolume = shallowRef(0.8)
const sourceOptions: { kind: HomeSourceKind, label: string }[] = [
  { kind: 'native', label: 'Native' },
  { kind: 'hls', label: 'HLS' },
  { kind: 'dash', label: 'DASH' },
]

const actionLabel = computed(() => {
  if (props.controller.isBusy.value) {
    return isChinese.value ? '正在加载' : 'Loading audio'
  }
  if (props.controller.playerErrorKind.value) {
    return isChinese.value ? '重试播放' : 'Retry playback'
  }
  return props.controller.isPaused.value ? (isChinese.value ? '播放' : 'Play') : (isChinese.value ? '暂停' : 'Pause')
})
const playerStatus = computed(() => {
  if (props.controller.playerErrorKind.value === 'load') {
    return isChinese.value ? '此来源加载失败。请重试，或切换另一种来源。' : 'This source could not load. Retry or choose another source.'
  }
  if (props.controller.playerErrorKind.value === 'playback') {
    return isChinese.value ? '播放未能完成。请再次按播放重试。' : 'Playback was interrupted. Press play to try again.'
  }
  return ''
})
const progressRatio = computed(() => props.controller.duration.value > 0
  ? Math.min(1, props.controller.currentTime.value / props.controller.duration.value)
  : 0)
const seekText = computed(() => `${displayTime(props.controller.currentTime.value)} / ${displayTime(props.controller.duration.value)}`)
const recentEvents = computed(() => props.controller.events.value.slice(-3))
const trackPosition = computed(() => demoTracks.findIndex(track => track.id === props.controller.selectedTrack.value.id) + 1)
const sampleFilename = computed(() => {
  const extension = { native: 'mp3', hls: 'm3u8', dash: 'mpd' }[props.controller.sourceKind.value]
  return `${props.controller.selectedTrack.value.id}.${extension}`
})

function displayTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = Math.floor(safeSeconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
}

function changeProgress(event: Event): void {
  void props.controller.seekToRatio(Number((event.target as HTMLInputElement).value))
}

function changeVolume(event: Event): void {
  props.controller.setVolume(Number((event.target as HTMLInputElement).value))
}

function toggleVolume(): void {
  if (props.controller.volume.value > 0) {
    previousVolume.value = props.controller.volume.value
    props.controller.setVolume(0)
    return
  }
  props.controller.setVolume(previousVolume.value || 0.8)
}
</script>

<template>
  <!-- AI modified: the homepage demonstrates one real player lifecycle across all three source kinds. -->
  <section class="sonic-player" :aria-label="isChinese ? 'GAudio 交互播放器' : 'GAudio interactive player'">
    <div class="sonic-player__header">
      <span class="sonic-player__eyebrow">
        <AudioWaveform :size="15" aria-hidden="true" />
        {{ isChinese ? '真实播放器' : 'LIVE PLAYER' }}
      </span>
      <span class="sonic-player__state" :class="{ 'is-playing': !controller.isPaused.value, 'has-error': !!controller.playerErrorKind.value }">
        <i aria-hidden="true" />
        {{ controller.isBusy.value ? 'loading' : controller.playerState.value }}
      </span>
    </div>

    <div class="sonic-player__visual">
      <HomeAudioReactor
        :is-playing="!controller.isPaused.value"
        :read-spectrum="controller.readSpectrum"
        :source-kind="controller.sourceKind.value"
      />
      <div class="sonic-player__sources" role="group" :aria-label="isChinese ? '媒体来源类型' : 'Media source type'">
        <button
          v-for="source in sourceOptions"
          :key="source.kind"
          type="button"
          class="sonic-player__source"
          :aria-pressed="controller.sourceKind.value === source.kind"
          @click="controller.selectSource(source.kind)"
        >
          {{ source.label }}
        </button>
      </div>
      <span class="sonic-player__visual-label">SONIC CORE <span>/ 001</span></span>
      <span class="sonic-player__signal-label">
        <AudioWaveform :size="12" aria-hidden="true" />
        {{ isChinese ? '实时音频响应' : 'AUDIO REACTIVE' }}
      </span>
    </div>

    <div class="sonic-player__body">
      <div class="sonic-player__track">
        <img class="sonic-player__cover" :src="controller.coverThumbUrl.value" alt="" width="44" height="44">
        <div class="sonic-player__track-copy">
          <h2 class="sonic-player__title">
            {{ controller.selectedTrack.value.title }}
          </h2>
          <p class="sonic-player__artist">
            {{ controller.selectedTrack.value.artist }} <span>· {{ sampleFilename }}</span>
          </p>
        </div>
        <code class="sonic-player__track-index">0{{ trackPosition }}<span> / 0{{ demoTracks.length }}</span></code>
      </div>

      <div class="sonic-player__timeline">
        <code class="sonic-player__time">{{ displayTime(controller.currentTime.value) }}</code>
        <input
          class="sonic-player__seek"
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="progressRatio"
          :style="{ '--played': `${progressRatio * 100}%`, '--buffered': `${controller.bufferedRatio.value * 100}%` }"
          :disabled="!controller.isReady.value"
          :aria-label="isChinese ? '播放进度' : 'Playback progress'"
          :aria-valuetext="seekText"
          @input="changeProgress"
        >
        <code class="sonic-player__time">{{ displayTime(controller.duration.value) }}</code>
      </div>

      <div class="sonic-player__controls">
        <NuxtLink class="sonic-player__studio" :to="isChinese ? '/zh/player-studio' : '/player-studio'">
          {{ isChinese ? '打开 Studio' : 'Open studio' }}
          <ArrowUpRight :size="13" aria-hidden="true" />
        </NuxtLink>

        <div class="sonic-player__transport">
          <button class="sonic-player__icon-button" type="button" :aria-label="isChinese ? '上一首' : 'Previous track'" @click="controller.previousTrack">
            <SkipBack :size="16" fill="currentColor" aria-hidden="true" />
          </button>
          <button
            class="sonic-player__play"
            type="button"
            :disabled="controller.isBusy.value"
            :aria-label="actionLabel"
            :title="actionLabel"
            @click="controller.togglePlayback"
          >
            <LoaderCircle v-if="controller.isBusy.value" class="sonic-player__spinner" :size="20" aria-hidden="true" />
            <Play v-else-if="controller.isPaused.value" :size="18" fill="currentColor" aria-hidden="true" />
            <Pause v-else :size="18" fill="currentColor" aria-hidden="true" />
          </button>
          <button class="sonic-player__icon-button" type="button" :aria-label="isChinese ? '下一首' : 'Next track'" @click="controller.nextTrack">
            <SkipForward :size="16" fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <div class="sonic-player__volume">
          <button
            class="sonic-player__icon-button"
            type="button"
            :aria-label="isChinese ? (controller.volume.value > 0 ? '静音' : '恢复音量') : (controller.volume.value > 0 ? 'Mute' : 'Restore volume')"
            @click="toggleVolume"
          >
            <Volume2 v-if="controller.volume.value > 0" :size="16" aria-hidden="true" />
            <VolumeX v-else :size="16" aria-hidden="true" />
          </button>
          <input
            class="sonic-player__volume-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="controller.volume.value"
            :aria-label="isChinese ? '音量' : 'Volume'"
            :aria-valuetext="`${Math.round(controller.volume.value * 100)}%`"
            @input="changeVolume"
          >
        </div>
      </div>

      <p v-if="playerStatus" class="sonic-player__error" role="status">
        {{ playerStatus }}
      </p>
    </div>

    <div class="sonic-player__events">
      <div class="sonic-player__event-header">
        <span><Terminal :size="12" aria-hidden="true" />{{ isChinese ? '播放器事件' : 'PLAYER EVENTS' }}</span>
        <span class="sonic-player__event-caption">{{ isChinese ? '实时 · 类型安全' : 'live · type-safe' }}</span>
      </div>
      <ol v-if="recentEvents.length" class="sonic-player__event-list" :aria-label="isChinese ? '最近播放器事件' : 'Recent player events'">
        <li v-for="event in recentEvents" :key="event.id" class="sonic-player__event">
          <code class="sonic-player__event-time">+{{ event.elapsed }}s</code>
          <code class="sonic-player__event-name">{{ event.name }}</code>
          <code class="sonic-player__event-detail" :title="event.detail">{{ event.detail || '→' }}</code>
        </li>
      </ol>
      <p v-else class="sonic-player__event-empty">
        <span class="sonic-player__prompt" aria-hidden="true">›</span>
        {{ isChinese ? '按下播放，观察真实的状态与事件。' : 'Press play. Watch the lifecycle unfold.' }}
        <span class="sonic-player__cursor" aria-hidden="true" />
      </p>
    </div>
  </section>
</template>

<style scoped>
.sonic-player {
  --player-line: color-mix(in srgb, var(--brand-primary) 13%, var(--border-default));
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--player-line);
  border-radius: 20px;
  color: var(--text-primary);
  background: var(--surface-panel);
  box-shadow: 0 24px 80px -32px color-mix(in srgb, var(--brand-primary) 24%, transparent), 0 0 0 5px color-mix(in srgb, var(--brand-primary) 3%, transparent);
  scroll-margin-top: 100px;
}

.sonic-player__header {
  display: flex;
  min-height: 49px;
  align-items: center;
  justify-content: space-between;
  padding: 0 21px;
  border-bottom: 1px solid var(--player-line);
}

.sonic-player__eyebrow,
.sonic-player__state,
.sonic-player__visual-label,
.sonic-player__signal-label,
.sonic-player__event-header,
.sonic-player__track-index {
  font-family: var(--font-mono, 'Geist Mono Variable', monospace);
}

.sonic-player__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
}

.sonic-player__eyebrow svg {
  color: var(--brand-primary);
}

.sonic-player__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 7px;
  border: 1px solid var(--border-default);
  border-radius: 5px;
  color: var(--text-secondary);
  background: var(--surface-raised);
  font-size: 9px;
}

.sonic-player__state i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.sonic-player__state.is-playing {
  color: var(--brand-primary);
  border-color: var(--player-line);
  background: var(--brand-soft);
}

.sonic-player__state.has-error {
  color: #dc526f;
}

.sonic-player__visual {
  position: relative;
  height: 224px;
  overflow: hidden;
  border-bottom: 1px solid var(--player-line);
  background: color-mix(in srgb, var(--brand-soft) 55%, var(--surface-bg));
}

.sonic-player__visual :deep(.home-reactor) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
}

.sonic-player__sources {
  position: absolute;
  z-index: 1;
  top: 14px;
  left: 50%;
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--player-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-panel) 82%, transparent);
  backdrop-filter: blur(16px);
  transform: translateX(-50%);
}

.sonic-player__source {
  min-width: 61px;
  min-height: 28px;
  padding: 4px 12px;
  border: 0;
  border-radius: 5px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: color 150ms, background 150ms;
}

.sonic-player__source:hover {
  color: var(--text-primary);
}

.sonic-player__source[aria-pressed='true'] {
  color: var(--brand-primary);
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1px var(--player-line);
}

.sonic-player__visual-label,
.sonic-player__signal-label {
  position: absolute;
  bottom: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 8px;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.sonic-player__visual-label {
  left: 20px;
}

.sonic-player__visual-label span {
  color: var(--brand-primary);
}

.sonic-player__signal-label {
  right: 20px;
}

.sonic-player__body {
  padding: 18px 21px 13px;
}

.sonic-player__track {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
  margin-bottom: 15px;
}

.sonic-player__cover {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border: 1px solid var(--player-line);
  border-radius: 9px;
  object-fit: cover;
}

.sonic-player__track-copy {
  flex: 1;
  min-width: 0;
}

.sonic-player__title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.sonic-player__artist {
  margin: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sonic-player__artist span {
  opacity: 0.75;
}

.sonic-player__track-index {
  flex-shrink: 0;
  font-size: 9px;
}

.sonic-player__track-index span {
  color: var(--text-secondary);
}

.sonic-player__timeline {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 7px;
}

.sonic-player__time {
  min-width: 28px;
  color: var(--text-secondary);
  font-size: 9px;
}

.sonic-player__seek {
  flex: 1;
  width: 100%;
  height: 18px;
  margin: 0;
  appearance: none;
  cursor: pointer;
  background: transparent;
}

.sonic-player__seek::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--brand-primary) var(--played), color-mix(in srgb, var(--brand-primary) 25%, var(--border-default)) var(--played), color-mix(in srgb, var(--brand-primary) 25%, var(--border-default)) var(--buffered), var(--border-default) var(--buffered));
}

.sonic-player__seek::-moz-range-track {
  height: 3px;
  border-radius: 3px;
  background: var(--border-default);
}

.sonic-player__seek::-moz-range-progress {
  height: 3px;
  background: var(--brand-primary);
}

.sonic-player__seek::-webkit-slider-thumb {
  width: 9px;
  height: 9px;
  margin-top: -3px;
  appearance: none;
  border: 1px solid var(--surface-panel);
  border-radius: 50%;
  background: var(--brand-primary);
}

.sonic-player__seek::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 1px solid var(--surface-panel);
  border-radius: 50%;
  background: var(--brand-primary);
}

.sonic-player__seek:disabled {
  cursor: default;
  opacity: 0.5;
}

.sonic-player__controls {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}

.sonic-player__studio {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 3px;
  color: var(--text-secondary);
  font-size: 10px;
  text-decoration: none;
}

.sonic-player__studio:hover {
  color: var(--brand-primary);
}

.sonic-player__transport,
.sonic-player__volume {
  display: flex;
  align-items: center;
  gap: 9px;
}

.sonic-player__volume {
  justify-content: flex-end;
  gap: 4px;
}

.sonic-player__icon-button {
  display: grid;
  width: 28px;
  height: 32px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
}

.sonic-player__icon-button:hover {
  color: var(--text-primary);
  background: var(--surface-raised);
}

.sonic-player__play {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, white 18%, var(--brand-primary));
  border-radius: 50%;
  color: white;
  background: var(--brand-primary);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--brand-primary) 22%, transparent);
  cursor: pointer;
  transition: filter 150ms, transform 150ms;
}

.sonic-player__play:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.sonic-player__play:disabled {
  cursor: wait;
  opacity: 0.75;
}

.sonic-player__volume-range {
  width: 51px;
  height: 16px;
  margin: 0;
  accent-color: var(--brand-primary);
  cursor: pointer;
}

.sonic-player__error {
  margin: 10px 0 0;
  color: #dc526f;
  font-size: 11px;
  line-height: 1.5;
}

.sonic-player__events {
  min-height: 103px;
  padding: 12px 21px 13px;
  border-top: 1px solid var(--player-line);
  background: color-mix(in srgb, var(--surface-bg) 65%, var(--surface-panel));
}

.sonic-player__event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--text-secondary);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.sonic-player__event-header > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sonic-player__event-caption {
  letter-spacing: 0;
}

.sonic-player__event-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sonic-player__event {
  display: flex;
  min-width: 0;
  gap: 12px;
  font-size: 9px;
  line-height: 1.25;
}

.sonic-player__event-time {
  min-width: 44px;
  color: var(--text-secondary);
}

.sonic-player__event-name {
  color: var(--brand-primary);
}

.sonic-player__event-detail {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sonic-player__event-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 17px 0 0;
  color: var(--text-secondary);
  font-family: var(--font-mono, 'Geist Mono Variable', monospace);
  font-size: 10px;
}

.sonic-player__prompt {
  color: var(--brand-primary);
  font-size: 16px;
}

.sonic-player__cursor {
  width: 5px;
  height: 10px;
  margin-left: -3px;
  background: var(--brand-primary);
  opacity: 0.6;
}

.sonic-player :is(button, a, input):focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 4px;
}

.sonic-player__spinner {
  animation: sonic-player-spin 1s linear infinite;
}

@keyframes sonic-player-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 540px) {
  .sonic-player__header { padding-inline: 16px; }
  .sonic-player__visual { height: 202px; }
  .sonic-player__body { padding-inline: 16px; }
  .sonic-player__events { padding-inline: 16px; }
  .sonic-player__artist span { display: none; }
  .sonic-player__volume-range { width: 40px; }
  .sonic-player__controls { gap: 5px; }
  .sonic-player__transport { gap: 5px; }
  .sonic-player__studio { font-size: 9px; }
}

@media (prefers-reduced-motion: reduce) {
  .sonic-player__spinner { animation: none; }
  .sonic-player__play,
  .sonic-player__source { transition: none; }
}
</style>
