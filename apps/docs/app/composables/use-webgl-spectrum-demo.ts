import type { PlaybackState } from 'gaudio'
import { AudioPlayer } from 'gaudio'
import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue'

const spectrumBandCount = 64
const spectrumReadIntervalMs = 1000 / 30

function secondsForDisplay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function useWebglSpectrumDemo() {
  const publicAssetBase = useRuntimeConfig().app.baseURL
  const playerState = shallowRef<PlaybackState>('idle')
  const currentTime = shallowRef(0)
  const duration = shallowRef(0)
  const volume = shallowRef(0.78)
  const isBusy = shallowRef(true)
  const errorMessage = shallowRef<string | undefined>()
  const isPlaying = computed(() => playerState.value === 'playing')
  const progress = computed(() => duration.value > 0 ? currentTime.value / duration.value : 0)
  const currentTimeLabel = computed(() => secondsForDisplay(currentTime.value))
  const durationLabel = computed(() => secondsForDisplay(duration.value))

  let player: AudioPlayer | undefined
  let removePlayerListeners: Array<() => void> = []
  let lastSpectrumRead = 0
  let spectrumCache: Uint8Array | undefined

  function releasePlayer(): void {
    removePlayerListeners.forEach(removeListener => removeListener())
    removePlayerListeners = []
    // AI modified: component teardown intentionally contains asynchronous player cleanup failures.
    void player?.dispose().catch((error: unknown) => {
      console.warn('GAudio spectrum cleanup failed', error)
    })
    player = undefined
  }

  async function preparePlayer(): Promise<void> {
    errorMessage.value = undefined
    isBusy.value = true

    // AI modified: the comparison demo consumes only the public analyzer contract used by documentation readers.
    player = new AudioPlayer({
      source: `${publicAssetBase}audio/mp3/aurora-loop.mp3`,
      analyzer: { fftSize: 2048 },
      preload: 'metadata',
      autoplay: false,
      loop: true,
      volume: volume.value,
    })

    removePlayerListeners = [
      player.on('statechange', (state) => {
        playerState.value = state
      }),
      player.on('timeupdate', (position) => {
        currentTime.value = position.currentTime
        duration.value = position.duration
      }),
      player.on('durationchange', (durationUpdate) => {
        duration.value = durationUpdate.duration
      }),
      player.on('volumechange', (volumeUpdate) => {
        volume.value = volumeUpdate.volume
      }),
      player.on('error', (error) => {
        errorMessage.value = error.message
      }),
    ]

    try {
      await player.load()
      duration.value = player.getDuration()
      currentTime.value = player.getCurrentTime()
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Audio could not be loaded.'
    }
    finally {
      isBusy.value = false
    }
  }

  async function togglePlayback(): Promise<void> {
    if (!player || isBusy.value) {
      return
    }

    errorMessage.value = undefined

    try {
      if (player.isPaused()) {
        // AI modified: playback remains user-initiated so the browser can resume its Web Audio graph legally.
        await player.play()
        return
      }

      player.pause()
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Playback could not start.'
    }
  }

  async function seekToProgress(nextProgress: number): Promise<void> {
    if (!player || duration.value <= 0) {
      return
    }

    const boundedProgress = Math.min(1, Math.max(0, nextProgress))

    try {
      await player.seek(boundedProgress * duration.value)
      currentTime.value = player.getCurrentTime()
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'The demo could not seek.'
    }
  }

  function setVolume(nextVolume: number): void {
    if (!player) {
      return
    }

    const boundedVolume = Math.min(1, Math.max(0, nextVolume))
    player.setVolume(boundedVolume)
    volume.value = boundedVolume
  }

  function readSpectrum(): Uint8Array | undefined {
    if (!player || !isPlaying.value) {
      return undefined
    }

    const timestamp = performance.now()

    if (spectrumCache && timestamp - lastSpectrumRead < spectrumReadIntervalMs) {
      return spectrumCache
    }

    const frequencySamples = player.getAnalyzer()?.getFrequencyData()

    if (!frequencySamples) {
      return undefined
    }

    spectrumCache ??= new Uint8Array(spectrumBandCount)

    // AI modified: logarithmic grouping keeps bass detail without discarding the upper FFT range.
    for (let bandIndex = 0; bandIndex < spectrumBandCount; bandIndex += 1) {
      const lowerRatio = bandIndex / spectrumBandCount
      const upperRatio = (bandIndex + 1) / spectrumBandCount
      const startIndex = Math.floor(lowerRatio * lowerRatio * frequencySamples.length)
      const endIndex = Math.max(startIndex + 1, Math.floor(upperRatio * upperRatio * frequencySamples.length))
      let peakMagnitude = 0

      for (let sampleIndex = startIndex; sampleIndex < Math.min(endIndex, frequencySamples.length); sampleIndex += 1) {
        peakMagnitude = Math.max(peakMagnitude, frequencySamples[sampleIndex] ?? 0)
      }

      spectrumCache[bandIndex] = peakMagnitude
    }

    lastSpectrumRead = timestamp

    return spectrumCache
  }

  onMounted(preparePlayer)
  onUnmounted(releasePlayer)

  return {
    currentTime: readonly(currentTime),
    currentTimeLabel,
    duration: readonly(duration),
    durationLabel,
    errorMessage: readonly(errorMessage),
    isBusy: readonly(isBusy),
    isPlaying,
    playerState: readonly(playerState),
    progress,
    readSpectrum,
    seekToProgress,
    setVolume,
    togglePlayback,
    volume: readonly(volume),
  }
}

export type WebglSpectrumDemo = ReturnType<typeof useWebglSpectrumDemo>
