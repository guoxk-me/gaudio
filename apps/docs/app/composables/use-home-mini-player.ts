import type { AudioEngineAdapter, AudioPlayer } from 'gaudio'
import type { ComputedRef, ShallowRef } from 'vue'
import type { DemoTrack } from '../../examples/demo-samples'
import { computed, onUnmounted, shallowRef } from 'vue'
import {
  defaultDemoTrackId,
  demoCoverArtUrl,
  demoCoverThumbUrl,
  demoSampleUrl,
  demoTracks,
  findDemoFormatGroup,
  findDemoTrack,
} from '../../examples/demo-samples'

export type HomeSourceKind = 'native' | 'hls' | 'dash'

export interface HomePlayerEvent {
  id: number
  name: string
  detail: string
  elapsed: string
}

export interface HomeMiniPlayerController {
  bufferedRatio: ComputedRef<number>
  coverThumbUrl: ComputedRef<string>
  currentTime: ShallowRef<number>
  defaultTrack: DemoTrack
  duration: ShallowRef<number>
  events: ShallowRef<HomePlayerEvent[]>
  isBusy: ShallowRef<boolean>
  isPaused: ShallowRef<boolean>
  isReady: ShallowRef<boolean>
  nextTrack: () => Promise<void>
  playerErrorKind: ShallowRef<'load' | 'playback' | undefined>
  playerState: ShallowRef<string>
  previousTrack: () => Promise<void>
  readSpectrum: () => Uint8Array
  restartTrack: () => Promise<void>
  seekToRatio: (ratio: number) => Promise<void>
  selectedTrack: ComputedRef<DemoTrack>
  selectSource: (kind: HomeSourceKind) => Promise<void>
  selectTrack: (trackId: string) => Promise<void>
  setVolume: (nextVolume: number) => void
  sourceKind: ShallowRef<HomeSourceKind>
  togglePlayback: () => Promise<void>
  volume: ShallowRef<number>
}

export function useHomeMiniPlayer(): HomeMiniPlayerController {
  const publicAssetBase = useRuntimeConfig().app.baseURL
  const defaultTrack = findDemoTrack(defaultDemoTrackId)
  const selectedTrackId = shallowRef(defaultDemoTrackId)
  const selectedTrack = computed(() => findDemoTrack(selectedTrackId.value))
  const sourceKind = shallowRef<HomeSourceKind>('native')
  const isReady = shallowRef(false)
  const isBusy = shallowRef(false)
  const isPaused = shallowRef(true)
  const playerState = shallowRef('idle')
  const playerErrorKind = shallowRef<'load' | 'playback'>()
  const currentTime = shallowRef(0)
  const duration = shallowRef(0)
  const volume = shallowRef(0.8)
  const bufferedEnd = shallowRef(0)
  const events = shallowRef<HomePlayerEvent[]>([])
  const coverThumbUrl = computed(() => demoCoverThumbUrl(publicAssetBase, selectedTrack.value.coverThumb))
  const bufferedRatio = computed(() => duration.value > 0
    ? Math.min(1, bufferedEnd.value / duration.value)
    : 0)
  const silentSpectrum = new Uint8Array(64)
  let player: AudioPlayer | undefined
  let playerDisposal = Promise.resolve()
  let requestId = 0
  let nextEventId = 0
  let eventStartedAt = 0
  let hasInteracted = false
  let isUnmounted = false
  let shouldContinuePlaying = false

  function syncPlaybackFlags(activePlayer: AudioPlayer): void {
    if (isUnmounted || player !== activePlayer) {
      return
    }
    isPaused.value = activePlayer.isPaused()
    playerState.value = activePlayer.getState()
    currentTime.value = activePlayer.getCurrentTime()
    duration.value = activePlayer.getDuration()
    volume.value = activePlayer.getVolume()
    bufferedEnd.value = activePlayer.getBufferedRanges().at(-1)?.end ?? 0
  }

  function recordEvent(name: string, detail = ''): void {
    // AI modified: keep a bounded history of actual library events, never simulated playback activity.
    events.value = [...events.value.slice(-11), {
      id: nextEventId++,
      name,
      detail,
      elapsed: ((performance.now() - eventStartedAt) / 1000).toFixed(2),
    }]
  }

  function observePlayer(activePlayer: AudioPlayer): void {
    function publish(name: string, detail = ''): void {
      if (isUnmounted || player !== activePlayer) {
        return
      }
      syncPlaybackFlags(activePlayer)
      recordEvent(name, detail)
    }

    activePlayer.on('statechange', state => publish('statechange', state))
    activePlayer.on('loadstart', () => publish('loadstart', sourceKind.value))
    activePlayer.on('loadedmetadata', ({ duration: trackDuration }) => publish('loadedmetadata', `${trackDuration.toFixed(1)}s`))
    activePlayer.on('canplay', () => publish('canplay'))
    activePlayer.on('play', () => {
      if (player === activePlayer && !isBusy.value) {
        shouldContinuePlaying = true
      }
      publish('play')
    })
    activePlayer.on('playing', () => publish('playing'))
    activePlayer.on('pause', () => {
      // AI modified: preserve pauses issued by system media controls when switching samples.
      if (player === activePlayer && !isBusy.value) {
        shouldContinuePlaying = false
      }
      publish('pause')
    })
    activePlayer.on('waiting', () => publish('waiting'))
    activePlayer.on('seeked', ({ currentTime: position }) => publish('seeked', `${position.toFixed(1)}s`))
    activePlayer.on('ended', () => {
      if (player === activePlayer) {
        shouldContinuePlaying = false
      }
      publish('ended')
    })
    activePlayer.on('adaptivechange', ({ protocol, implementation }) => publish('adaptivechange', `${protocol} / ${implementation}`))
    activePlayer.on('error', (error) => {
      if (player === activePlayer && !isUnmounted) {
        playerErrorKind.value = isReady.value ? 'playback' : 'load'
      }
      publish('error', error.code)
    })
    for (const eventName of ['timeupdate', 'durationchange', 'volumechange', 'bufferupdate'] as const) {
      activePlayer.on(eventName, () => syncPlaybackFlags(activePlayer))
    }
  }

  async function loadPlayer(activeRequestId: number): Promise<AudioPlayer | undefined> {
    const track = selectedTrack.value
    const kind = sourceKind.value
    const format = findDemoFormatGroup(kind === 'native' ? 'mp3' : kind)
    let activePlayer: AudioPlayer | undefined

    try {
      // AI modified: load core and adaptive adapters only after a visitor starts the player.
      const { AudioPlayer: BrowserAudioPlayer } = await import('gaudio')
      const adapters: AudioEngineAdapter[] = []
      if (kind === 'hls') {
        const { createHlsAdapter } = await import('gaudio/hls')
        adapters.push(createHlsAdapter())
      }
      else if (kind === 'dash') {
        const { createDashAdapter } = await import('gaudio/dash')
        adapters.push(createDashAdapter())
      }
      if (isUnmounted || activeRequestId !== requestId) {
        return undefined
      }

      activePlayer = new BrowserAudioPlayer({
        source: demoSampleUrl(publicAssetBase, format.folder, track.id, format.extension),
        adapters,
        preload: 'none',
        mediaSession: true,
        volume: volume.value,
        analyzer: { fftSize: 2048 },
      })
      player = activePlayer
      activePlayer.setMediaSessionMetadata({
        title: track.title,
        artist: track.artist,
        album: 'GAudio demo',
        artwork: [{
          src: demoCoverArtUrl(publicAssetBase, track.coverFile),
          sizes: '512x512',
          type: 'image/png',
        }],
      })
      observePlayer(activePlayer)
      await activePlayer.load()
      if (isUnmounted || activeRequestId !== requestId) {
        return undefined
      }
      syncPlaybackFlags(activePlayer)
      isReady.value = true
      playerErrorKind.value = undefined
      return activePlayer
    }
    catch (error: unknown) {
      if (isUnmounted || activeRequestId !== requestId) {
        return undefined
      }
      playerErrorKind.value = 'load'
      playerState.value = 'error'
      recordEvent('error', error instanceof Error ? error.message : 'Source could not load')
      player = undefined
      await activePlayer?.dispose().catch(() => undefined)
      return undefined
    }
  }

  async function startPlaybackRequest(activeRequestId: number): Promise<void> {
    isBusy.value = true
    try {
      const activePlayer = isReady.value && player ? player : await loadPlayer(activeRequestId)
      if (!activePlayer || isUnmounted || activeRequestId !== requestId) {
        return
      }
      if (shouldContinuePlaying) {
        await activePlayer.play()
      }
      else {
        activePlayer.pause()
      }
      if (player === activePlayer && !isUnmounted) {
        syncPlaybackFlags(activePlayer)
        playerErrorKind.value = undefined
      }
    }
    catch {
      if (activeRequestId === requestId && !isUnmounted) {
        playerErrorKind.value = isReady.value ? 'playback' : 'load'
        shouldContinuePlaying = false
      }
    }
    finally {
      if (activeRequestId === requestId && !isUnmounted) {
        isBusy.value = false
      }
    }
  }

  async function togglePlayback(): Promise<void> {
    if (isBusy.value || isUnmounted) {
      return
    }
    if (!hasInteracted) {
      eventStartedAt = performance.now()
    }
    hasInteracted = true
    shouldContinuePlaying = isPaused.value
    await startPlaybackRequest(requestId)
  }

  async function changeSample(): Promise<void> {
    // AI modified: invalidate pending work before disposal so rapid selections cannot revive an old source.
    const activeRequestId = ++requestId
    const previousPlayer = player
    player = undefined
    isReady.value = false
    isPaused.value = true
    isBusy.value = hasInteracted
    playerErrorKind.value = undefined
    playerState.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    bufferedEnd.value = 0
    events.value = []
    // AI modified: later source choices also await an earlier disposal before claiming browser media resources.
    if (previousPlayer) {
      playerDisposal = playerDisposal.then(() => previousPlayer.dispose()).catch(() => undefined)
    }
    await playerDisposal
    if (isUnmounted || activeRequestId !== requestId || !hasInteracted) {
      return
    }
    await startPlaybackRequest(activeRequestId)
  }

  async function selectSource(kind: HomeSourceKind): Promise<void> {
    if (sourceKind.value === kind || isUnmounted) {
      return
    }
    sourceKind.value = kind
    await changeSample()
  }

  async function selectTrack(trackId: string): Promise<void> {
    if (selectedTrackId.value === trackId || !demoTracks.some(track => track.id === trackId) || isUnmounted) {
      return
    }
    selectedTrackId.value = trackId
    await changeSample()
  }

  async function nextTrack(): Promise<void> {
    const index = demoTracks.findIndex(track => track.id === selectedTrackId.value)
    await selectTrack(demoTracks[(index + 1) % demoTracks.length].id)
  }

  async function previousTrack(): Promise<void> {
    const index = demoTracks.findIndex(track => track.id === selectedTrackId.value)
    await selectTrack(demoTracks[(index + demoTracks.length - 1) % demoTracks.length].id)
  }

  async function seekToRatio(ratio: number): Promise<void> {
    const activePlayer = player
    if (!activePlayer || !isReady.value || duration.value <= 0 || !Number.isFinite(ratio)) {
      return
    }
    try {
      await activePlayer.seek(duration.value * Math.min(1, Math.max(0, ratio)))
      syncPlaybackFlags(activePlayer)
    }
    catch {
      if (player === activePlayer && !isUnmounted) {
        playerErrorKind.value = 'playback'
      }
    }
  }

  async function restartTrack(): Promise<void> {
    await seekToRatio(0)
  }

  function setVolume(nextVolume: number): void {
    if (!Number.isFinite(nextVolume)) {
      return
    }
    // AI modified: honor volume adjustments made before the first playback interaction.
    volume.value = Math.min(1, Math.max(0, nextVolume))
    player?.setVolume(volume.value)
  }

  function readSpectrum(): Uint8Array {
    return player?.getAnalyzer()?.getFrequencyData({ binCount: 64 }) ?? silentSpectrum
  }

  onUnmounted(() => {
    isUnmounted = true
    requestId++
    const previousPlayer = player
    player = undefined
    void previousPlayer?.dispose().catch((error: unknown) => {
      console.warn('GAudio homepage player cleanup failed', error)
    })
  })

  return {
    bufferedRatio,
    coverThumbUrl,
    currentTime,
    defaultTrack,
    duration,
    events,
    isBusy,
    isPaused,
    isReady,
    nextTrack,
    playerErrorKind,
    playerState,
    previousTrack,
    readSpectrum,
    restartTrack,
    seekToRatio,
    selectedTrack,
    selectSource,
    selectTrack,
    setVolume,
    sourceKind,
    togglePlayback,
    volume,
  }
}
