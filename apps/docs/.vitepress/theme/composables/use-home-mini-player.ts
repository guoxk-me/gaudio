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
    analyzer: { fftSize: 1024 },
  })

  const isReady = shallowRef(false)
  const isBusy = shallowRef(false)
  const isPaused = shallowRef(true)
  const playerState = shallowRef('idle')

  const coverThumbUrl = computed(() => demoCoverThumbUrl(defaultTrack.coverThumb))

  function syncPlaybackFlags(): void {
    isPaused.value = player.isPaused()
    playerState.value = player.getState()
  }

  async function togglePlayback(): Promise<void> {
    if (isBusy.value || !isReady.value) {
      return
    }

    isBusy.value = true

    try {
      if (player.isPaused()) {
        await player.play()
      }
      else {
        player.pause()
      }
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

    await player.load()
    syncPlaybackFlags()
    isReady.value = true
  })

  onUnmounted(() => {
    player.dispose()
  })

  return {
    defaultTrack,
    coverThumbUrl,
    isReady,
    isBusy,
    isPaused,
    playerState,
    togglePlayback,
  }
}

export type HomeMiniPlayerState = ReturnType<typeof useHomeMiniPlayer>
