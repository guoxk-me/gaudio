<script setup lang="ts">
import { computed } from 'vue'
import { demoCoverThumbUrl, demoSampleUrl, demoTracks } from '../../../examples/demo-samples'
import { usePrototypePlayer } from '../../composables/use-prototype-player'

const props = withDefaults(defineProps<{ recipe: string, isChinese?: boolean, showCode?: boolean }>(), { isChinese: false, showCode: true })
const publicAssetBase = useRuntimeConfig().app.baseURL
const { state, currentTime, duration, volume, isBusy, hasLoaded, error, events, isPlaying, isMediaSessionSupported, playlistIndex, spectrum, openSource, togglePlayback, seekTo, setVolume, nextTrack } = usePrototypePlayer()
const track = computed(() => demoTracks[props.recipe === 'playlist' ? playlistIndex.value : 0] ?? demoTracks[0])
const cover = computed(() => demoCoverThumbUrl(publicAssetBase, track.value.coverThumb))
const runtime = computed(() => props.recipe === 'hls' || props.recipe === 'dash' ? props.recipe : 'media')
const sampleUrl = computed(() => demoSampleUrl(publicAssetBase, runtime.value === 'media' ? 'mp3' : runtime.value, demoTracks[0].id, runtime.value === 'hls' ? '.m3u8' : runtime.value === 'dash' ? '.mpd' : '.mp3'))
const code = computed(() => {
  const source = JSON.stringify(sampleUrl.value)
  const setup = props.recipe === 'hls'
    ? `import { createHlsAdapter } from 'gaudio/hls'\n\nconst player = new AudioPlayer({\n  source: ${source},\n  adapters: [createHlsAdapter()],\n})`
    : props.recipe === 'dash'
      ? `import { createDashAdapter } from 'gaudio/dash'\n\nconst player = new AudioPlayer({\n  source: ${source},\n  adapters: [createDashAdapter()],\n})`
      : props.recipe === 'playlist'
        ? `\nconst player = new AudioPlayer()\n\nplayer.setPlaylist([\n  { source: ${source} },\n  { source: ${JSON.stringify(demoSampleUrl(publicAssetBase, 'mp3', demoTracks[1].id, '.mp3'))} },\n])`
        : `\nconst player = new AudioPlayer({\n  source: ${source},${props.recipe === 'analyzer' ? '\n  analyzer: { fftSize: 2048 },' : props.recipe === 'media-session' ? "\n  mediaSession: {\n    metadata: { title: 'Aurora Loop', artist: 'GAudio' },\n  }," : ''}\n})`
  const extra = props.recipe === 'playlist' ? "\n// Bind this to your Next button.\nconst next = () => player.next({ autoplay: true })"
    : props.recipe === 'analyzer' ? "\n// Read these samples in your animation loop.\nconst readSpectrum = () => player.getAnalyzer()\n  ?.getFrequencyData({ binCount: 64 })"
      : props.recipe === 'media-session' ? '\n// OS media controls now share this lifecycle.' : ''
  return `import { AudioPlayer } from 'gaudio'\n${setup}\n\n// Call from a user interaction.\nconst play = async () => {\n  await player.play()\n}${extra}\n\n// Call when your view is removed.\nconst cleanup = () => player.dispose()`
})

async function playRecipe(): Promise<void> {
  if (hasLoaded.value) {
    await togglePlayback()
    return
  }
  // AI modified: recipe controls exercise only the feature shown in their adjacent public-API example.
  await openSource({
    url: sampleUrl.value,
    runtime: runtime.value,
    title: track.value.title,
    analyzer: props.recipe === 'analyzer',
    mediaSession: props.recipe === 'media-session',
    playlist: props.recipe === 'playlist' ? demoTracks.slice(0, 2).map(sample => ({ source: demoSampleUrl(publicAssetBase, 'mp3', sample.id, '.mp3'), metadata: { title: sample.title, artist: sample.artist } })) : undefined,
  })
}
</script>

<template>
  <div class="recipe-player" :class="{ 'recipe-player--compact': !showCode }">
    <div class="recipe-player__live">
      <PrototypeTransport :is-playing="isPlaying" :is-busy="isBusy" :current-time="currentTime" :duration="duration" :volume="volume" :state="state" :title="track.title" :cover="cover" :can-skip="recipe === 'playlist' && hasLoaded" :is-chinese="isChinese" @toggle="playRecipe" @seek="seekTo" @volume="setVolume" @next="nextTrack" />
      <div v-if="recipe === 'analyzer'" class="recipe-player__spectrum" role="img" :aria-label="isChinese ? '音频实时频谱' : 'Live audio frequency spectrum'"><span v-for="(amplitude, index) in spectrum" :key="index" :style="{ height: `${Math.max(3, amplitude * 100)}%` }" /></div>
      <p v-if="recipe === 'media-session'" class="recipe-player__hint">{{ hasLoaded ? (isMediaSessionSupported ? (isChinese ? '已设置媒体信息。试试键盘的播放 / 暂停键。' : 'Metadata is connected. Try your keyboard’s play / pause key.') : (isChinese ? '当前浏览器不支持 Media Session；网页播放仍可正常工作。' : 'This browser does not expose Media Session. In-page playback still works.')) : (isChinese ? '播放后，试试系统媒体控件。' : 'Press play, then try your system media controls.') }}</p>
      <p v-if="error" class="recipe-player__error" role="alert">{{ error }}</p>
      <div v-if="showCode" class="recipe-player__events">
        <div class="recipe-player__event-heading"><span>PLAYER EVENTS</span><span>{{ isPlaying ? 'LIVE' : 'LISTENING' }}</span></div>
        <ol v-if="events.length" class="recipe-player__event-list"><li v-for="event in events.slice(0, 5)" :key="event.id"><span>{{ String(event.id).padStart(2, '0') }}</span><code>{{ event.name }}</code><span>{{ event.detail }}</span></li></ol>
        <p v-else class="recipe-player__hint">{{ isChinese ? '点击播放，观察真实事件。' : 'Press play to observe real player events.' }}</p>
      </div>
    </div>
    <PrototypeCode v-if="showCode" :code="code" :is-chinese="isChinese" :label="recipe === 'hls' ? 'TypeScript · pnpm add hls.js' : recipe === 'dash' ? 'TypeScript · pnpm add dashjs' : 'TypeScript'" />
  </div>
</template>

<style scoped>
.recipe-player { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 24px; align-items: start; }
.recipe-player--compact { display: block; }
.recipe-player__live { min-width: 0; }
.recipe-player__events { padding: 22px 4px; }
.recipe-player__event-heading { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; color: var(--text-secondary); }
.recipe-player__event-heading > :last-child { color: var(--brand-primary); }
.recipe-player__event-list { list-style: none; padding: 12px 0 0; margin: 0; }
.recipe-player__event-list li { display: flex; gap: 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--border-default); font-family: var(--font-mono); font-size: 10px; }
.recipe-player__event-list code { color: var(--text-primary); font-size: 11px; }
.recipe-player__event-list li > span { color: var(--text-secondary); }
.recipe-player__event-list li > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: auto; }
.recipe-player__hint { color: var(--text-secondary); font-size: 12px; line-height: 1.7; margin: 18px 0; }
.recipe-player__error { color: var(--text-primary); border-left: 2px solid var(--brand-primary); padding-left: 12px; font-size: 12px; overflow-wrap: anywhere; }
.recipe-player__spectrum { display: flex; align-items: flex-end; gap: 5px; height: 120px; padding: 20px; margin-top: 16px; background: var(--brand-soft); border: 1px solid var(--border-default); border-radius: 12px; }
.recipe-player__spectrum > span { flex: 1; background: var(--brand-primary); border-radius: 3px; transition: height .08s linear; }
@media (prefers-reduced-motion: reduce) { .recipe-player__spectrum > span { transition: none; } }
@media (max-width: 780px) { .recipe-player { grid-template-columns: 1fr; } }
</style>
