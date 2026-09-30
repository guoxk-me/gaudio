import type { AudioEngineAdapter, AudioPlayer, AudioPlaylistTrack, AudioTrack } from 'gaudio'
import { computed, onUnmounted, shallowRef } from 'vue'

export type StudioRuntime = 'auto' | 'media' | 'hls' | 'dash'

export interface PrototypeSource {
  url: string
  runtime: StudioRuntime
  title?: string
  analyzer?: boolean
  mediaSession?: boolean
  playlist?: readonly AudioPlaylistTrack[]
}

interface PlaybackEvent {
  id: number
  name: string
  detail: string
}

// AI modified: recipes and diagnostics share a lazy, disposable real player without loading media during SSR.
export function usePrototypePlayer() {
  const state = shallowRef('idle')
  const currentTime = shallowRef(0)
  const duration = shallowRef(0)
  const volume = shallowRef(0.7)
  const isBusy = shallowRef(false)
  const hasLoaded = shallowRef(false)
  const error = shallowRef('')
  const implementation = shallowRef('—')
  const audioTracks = shallowRef<readonly AudioTrack[]>([])
  const playlistIndex = shallowRef(0)
  const events = shallowRef<PlaybackEvent[]>([])
  const isPlaying = computed(() => state.value === 'playing')
  const isMediaSessionSupported = shallowRef(false)
  const spectrum = shallowRef<number[]>(Array.from({ length: 32 }, () => 0))
  const silence = new Uint8Array(64)
  let player: AudioPlayer | undefined
  let generation = 0
  let eventSequence = 0
  let spectrumTimer: ReturnType<typeof setInterval> | undefined

  function recordEvent(name: string, detail = ''): void {
    events.value = [{ id: ++eventSequence, name, detail }, ...events.value].slice(0, 12)
  }

  function refreshPlayback(): void {
    if (!player)
      return
    state.value = player.getState()
    currentTime.value = player.getCurrentTime()
    duration.value = player.getDuration()
    audioTracks.value = player.getAudioTracks()
    playlistIndex.value = Math.max(0, player.getPlaylistIndex())
  }

  function readSpectrum(): Uint8Array {
    return player?.getAnalyzer()?.getFrequencyData({ binCount: 64 }) ?? silence
  }

  function releasePlayer(): void {
    generation += 1
    if (spectrumTimer)
      clearInterval(spectrumTimer)
    spectrumTimer = undefined
    player?.dispose()
    player = undefined
    state.value = 'idle'
    hasLoaded.value = false
    isBusy.value = false
    currentTime.value = 0
    duration.value = 0
    audioTracks.value = []
    spectrum.value = Array.from({ length: 32 }, () => 0)
  }

  async function openSource(source: PrototypeSource): Promise<void> {
    if (isBusy.value)
      return
    releasePlayer()
    const requestGeneration = generation
    isBusy.value = true
    error.value = ''
    events.value = []
    implementation.value = source.runtime === 'hls' || source.runtime === 'dash' ? 'loading adapter' : 'native'
    try {
      const { AudioPlayer: BrowserAudioPlayer } = await import('gaudio')
      const adapters: AudioEngineAdapter[] = []
      if (source.runtime === 'auto' || source.runtime === 'hls') {
        const { createHlsAdapter } = await import('gaudio/hls')
        adapters.push(createHlsAdapter())
      }
      if (source.runtime === 'auto' || source.runtime === 'dash') {
        const { createDashAdapter } = await import('gaudio/dash')
        adapters.push(createDashAdapter())
      }
      // AI modified: a route change during lazy imports cannot leave an orphan audio instance playing.
      if (generation !== requestGeneration)
        return
      const activePlayer = new BrowserAudioPlayer({
        source: source.runtime === 'auto' ? source.url : { url: source.url, protocol: source.runtime },
        adapters,
        analyzer: source.analyzer ? { fftSize: 2048 } : false,
        mediaSession: source.mediaSession ?? false,
        preload: 'none',
        volume: volume.value,
      })
      player = activePlayer
      isMediaSessionSupported.value = 'mediaSession' in navigator
      if (source.playlist)
        activePlayer.setPlaylist(source.playlist)
      if (source.mediaSession)
        activePlayer.setMediaSessionMetadata({ title: source.title ?? 'GAudio sample', artist: 'GAudio original' })
      activePlayer.on('statechange', (nextState) => {
        state.value = nextState
        recordEvent('statechange', nextState)
      })
      activePlayer.on('loadstart', () => recordEvent('loadstart'))
      activePlayer.on('loadedmetadata', ({ duration: seconds }) => {
        hasLoaded.value = true
        refreshPlayback()
        recordEvent('loadedmetadata', `${seconds.toFixed(1)}s`)
      })
      activePlayer.on('timeupdate', refreshPlayback)
      activePlayer.on('durationchange', refreshPlayback)
      activePlayer.on('play', () => recordEvent('play'))
      activePlayer.on('pause', () => recordEvent('pause'))
      activePlayer.on('ended', () => recordEvent('ended'))
      activePlayer.on('seeked', ({ currentTime: seconds }) => recordEvent('seeked', `${seconds.toFixed(1)}s`))
      activePlayer.on('adaptivechange', ({ protocol, implementation: runtime }) => {
        implementation.value = runtime
        recordEvent('adaptivechange', `${protocol} / ${runtime}`)
      })
      activePlayer.on('manifestloaded', ({ variants }) => recordEvent('manifestloaded', `${variants.length} variants`))
      activePlayer.on('error', (failure) => {
        error.value = `${failure.code}: ${failure.message}`
        recordEvent('error', failure.code)
      })
      await activePlayer.play()
      if (generation !== requestGeneration)
        return
      hasLoaded.value = true
      refreshPlayback()
      if (source.analyzer) {
        spectrumTimer = setInterval(() => {
          // AI modified: sampling pauses with playback and background tabs; displayed bins remain real FFT magnitudes.
          if (document.hidden || !isPlaying.value)
            return
          const frequencies = readSpectrum()
          spectrum.value = Array.from({ length: 32 }, (_, index) => (frequencies[index * 2] ?? 0) / 255)
        }, 80)
      }
    }
    catch (failure) {
      if (generation === requestGeneration) {
        error.value = failure instanceof Error ? failure.message : 'Unable to play this source.'
        recordEvent('error', error.value)
        refreshPlayback()
      }
    }
    finally {
      if (generation === requestGeneration)
        isBusy.value = false
    }
  }

  async function togglePlayback(): Promise<void> {
    if (!player || isBusy.value)
      return
    error.value = ''
    try {
      if (isPlaying.value)
        player.pause()
      else
        await player.play()
      refreshPlayback()
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'Playback could not start.'
    }
  }

  async function seekTo(seconds: number): Promise<void> {
    if (!player || duration.value <= 0)
      return
    try {
      await player.seek(Math.min(duration.value, Math.max(0, seconds)))
      refreshPlayback()
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'Seeking failed.'
    }
  }

  function setVolume(nextVolume: number): void {
    volume.value = nextVolume
    player?.setVolume(nextVolume)
  }

  async function nextTrack(): Promise<void> {
    if (!player || isBusy.value)
      return
    isBusy.value = true
    try {
      const nextIndex = (player.getPlaylistIndex() + 1) % player.getPlaylist().length
      await player.selectPlaylistTrack(nextIndex, { autoplay: true })
      refreshPlayback()
      recordEvent('playlist', `track ${nextIndex + 1}`)
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'Could not select the next track.'
    }
    finally {
      isBusy.value = false
    }
  }

  onUnmounted(releasePlayer)
  return { state, currentTime, duration, volume, isBusy, hasLoaded, error, implementation, audioTracks, playlistIndex, events, isPlaying, isMediaSessionSupported, spectrum, readSpectrum, releasePlayer, openSource, togglePlayback, seekTo, setVolume, nextTrack }
}
