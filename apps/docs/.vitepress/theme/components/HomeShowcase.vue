<script setup lang="ts">
const waveformBars = Array.from({ length: 28 }, (_, barIndex) => ({
  id: `home-bar-${barIndex}`,
  height: `${16 + ((barIndex * 19) % 56)}px`,
}))

const corePlaybackCode = `import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: '/audio/pineapple-slice.mp3',
  analyzer: true,
})

player.on('statechange', state => console.log(state))
await player.load()
await player.play()`

const adaptiveQualityCode = `await player.setAdaptiveQuality('auto')
await player.setAdaptiveQuality('audio-high')

const variants = player.getAdaptiveVariants()`
</script>

<template>
  <section class="gaudio-home-showcase">
    <div class="gaudio-home-player">
      <div class="gaudio-home-player__top">
        <div class="gaudio-home-player__art" />
        <div>
          <h3>Pineapple Slice</h3>
          <p>MP3 / HLS / DASH / adaptive quality</p>
        </div>
      </div>
      <div
        class="gaudio-home-wave"
        aria-hidden="true"
      >
        <span
          v-for="bar in waveformBars"
          :key="bar.id"
          :style="{ height: bar.height }"
        />
      </div>
      <p>Use the interactive example as a real player: switch source protocols, force variants, inspect buffering, and capture analyzer samples.</p>
    </div>

    <div class="gaudio-home-code-grid">
      <div class="gaudio-home-panel">
        <h2>Core playback in one object</h2>
        <p>Load media, listen to typed events, and keep UI state synchronized without reaching into a raw media element.</p>

        <pre><code>{{ corePlaybackCode }}</code></pre>

        <div class="gaudio-home-output">
          <span>statechange: ready</span>
          <span>bufferupdate: 0.0-30.2s</span>
        </div>
      </div>

      <div class="gaudio-home-panel">
        <h2>Adaptive quality without vendor lock-in</h2>
        <p>Register HLS/DASH adapters only when your app needs them, then use the player-level quality API.</p>

        <pre><code>{{ adaptiveQualityCode }}</code></pre>

        <div class="gaudio-home-output">
          <span>implementation: hls / hls.js</span>
          <span>variant: audio-high / manual</span>
        </div>
      </div>
    </div>
  </section>
</template>
