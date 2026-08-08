import { AudioPlayer } from 'gaudio'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import {
  defaultDemoSampleUrl,
  defaultDemoTrackId,
  demoCoverArtUrl,
  demoCoverThumbUrl,
  findDemoTrack,
} from '../../../examples/demo-samples'

export function useHomeMiniPlayer() {
  const defaultTrack = findDemoTrack(defaultDemoTrackId)
  const player = new AudioPlayer({
    source: defaultDemoSampleUrl,
    preload: 'metadata',
    mediaSession: true,
  })

  const isReady = shallowRef(false)
  const isBusy = shallowRef(false)
  const isPaused = shallowRef(true)
  const playerState = shallowRef('idle')
  const playerErrorKind = shallowRef<'load' | 'playback'>()

  const coverThumbUrl = computed(() => demoCoverThumbUrl(defaultTrack.coverThumb))

  function syncPlaybackFlags(): void {
    isPaused.value = player.isPaused()
    playerState.value = player.getState()
  }

  async function togglePlayback(): Promise<void> {
    if (isBusy.value || (!isReady.value && playerErrorKind.value !== 'load')) {
      return
    }

    isBusy.value = true

    try {
      if (!isReady.value) {
        // AI modified: transient sample-load failures can retry without navigating away from the homepage.
        await player.load()
        isReady.value = true
        playerErrorKind.value = undefined
        return
      }

      if (player.isPaused()) {
        await player.play()
      }
      else {
        player.pause()
      }

      // AI modified: a successful retry clears only the recoverable playback failure.
      playerErrorKind.value = undefined
    }
    catch {
      playerErrorKind.value = isReady.value ? 'playback' : 'load'
    }
    finally {
      syncPlaybackFlags()
      isBusy.value = false
    }
  }

  onMounted(async () => {
    player.setMediaSessionMetadata({
      title: defaultTrack.title,
      artist: defaultTrack.artist,
      album: 'GAudio demo',
      artwork: [
        {
          src: demoCoverArtUrl(defaultTrack.coverFile),
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    })

    player.on('statechange', syncPlaybackFlags)
    player.on('pause', syncPlaybackFlags)
    player.on('play', syncPlaybackFlags)

    // AI modified: loading failures now render an explicit state instead of leaving the control disabled forever.
    try {
      await player.load()
      syncPlaybackFlags()
      isReady.value = true
      playerErrorKind.value = undefined
    }
    catch {
      playerErrorKind.value = 'load'
      playerState.value = 'error'
    }
  })

  onUnmounted(() => {
    try {
      player.dispose()
    }
    catch (error) {
      // AI modified: cleanup failures must not abort VitePress route navigation.
      console.warn('GAudio homepage player cleanup failed', error)
    }
  })

  return {
    defaultTrack,
    coverThumbUrl,
    isReady,
    isBusy,
    isPaused,
    playerState,
    playerErrorKind,
    togglePlayback,
  }
}

export type HomeMiniPlayerState = ReturnType<typeof useHomeMiniPlayer>
