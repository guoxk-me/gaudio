import type { AudioProtocol, PreloadMode, TimeRange } from 'gaudio'
import type { DemoFormatGroup, DemoTrack } from './demo-samples'
import { AudioPlayer } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import {
  defaultDemoFormatFolder,
  defaultDemoSampleUrl,
  defaultDemoTrackId,
  demoFormatGroups,
  demoSampleUrl,
  demoTracks,
  findDemoFormatGroup,
  findDemoTrack,
} from './demo-samples'

const seekRangeMax = 1000

type ProtocolOverride = 'auto' | AudioProtocol

function secondsForDisplay(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = Math.floor(safeSeconds % 60)

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function rangesForDisplay(ranges: readonly TimeRange[]): string {
  if (ranges.length === 0) {
    return 'none'
  }

  return ranges
    .map(range => `${range.start.toFixed(1)}-${range.end.toFixed(1)}s`)
    .join(', ')
}

export function useGaudioDemo() {
  const activeFormatFolder = shallowRef(defaultDemoFormatFolder)
  const activeTrackId = shallowRef(defaultDemoTrackId)
  const sourceUrl = shallowRef(defaultDemoSampleUrl)
  const protocolOverride = shallowRef<ProtocolOverride>('auto')
  const playerState = shallowRef('idle')
  const adaptiveImplementationLabel = shallowRef('media element')
  const adaptiveVariantLabel = shallowRef('automatic')
  const adaptiveBitrateLabel = shallowRef('unknown')
  const manifestVariantLabel = shallowRef('none')
  const segmentLabel = shallowRef('none')
  const bufferedLabel = shallowRef('none')
  const seekableLabel = shallowRef('none')
  const playedLabel = shallowRef('none')
  const playbackRateLabel = shallowRef('1.00x')
  const currentTimeLabel = shallowRef('0:00')
  const durationLabel = shallowRef('0:00')
  const seekValue = shallowRef(0)
  const volume = shallowRef(0.8)
  const playbackRate = shallowRef(1)
  const preload = shallowRef<PreloadMode>('metadata')
  const isMuted = shallowRef(false)
  const isLooping = shallowRef(false)
  const shouldAutoplay = shallowRef(false)
  const shouldPreservePitch = shallowRef(true)
  const isPaused = shallowRef(true)
  const isEnded = shallowRef(false)
  const isSeeking = shallowRef(false)
  const eventLog = shallowRef<string[]>([])
  const isBusy = shallowRef(false)

  const activeTrack = computed(() => findDemoTrack(activeTrackId.value))
  const activeFormatGroup = computed(() => findDemoFormatGroup(activeFormatFolder.value))
  const activeSampleLabel = computed(() => `${activeFormatGroup.value.label} · ${activeTrack.value.title}`)
  const activeSamplePath = computed(() => demoSampleUrl(
    activeFormatGroup.value.folder,
    activeTrack.value.id,
    activeFormatGroup.value.extension,
  ))

  let player: AudioPlayer

  function addEvent(message: string): void {
    eventLog.value = [`${new Date().toLocaleTimeString()} ${message}`, ...eventLog.value].slice(0, 16)
  }

  function updatePlaybackPosition(currentTime: number, duration: number): void {
    currentTimeLabel.value = secondsForDisplay(currentTime)
    durationLabel.value = secondsForDisplay(duration)
    seekValue.value = duration > 0 ? (currentTime / duration) * seekRangeMax : 0
  }

  function updateMediaStatus(): void {
    isPaused.value = player.isPaused()
    isEnded.value = player.isEnded()
    isSeeking.value = player.isSeeking()
    bufferedLabel.value = rangesForDisplay(player.getBufferedRanges())
    seekableLabel.value = rangesForDisplay(player.getSeekableRanges())
    playedLabel.value = rangesForDisplay(player.getPlayedRanges())
  }

  async function withBusyControls(action: () => Promise<void>): Promise<void> {
    isBusy.value = true

    try {
      await action()
    }
    catch (error) {
      addEvent(error instanceof Error ? error.message : 'unknown error')
    }
    finally {
      isBusy.value = false
    }
  }

  function observePlayer(activePlayer: AudioPlayer): void {
    // AI modified: reflect native media lifecycle events through the stable AudioPlayer API.
    activePlayer.on('statechange', (state) => {
      playerState.value = state
      addEvent(`statechange: ${state}`)
    })

    activePlayer.on('loadstart', () => addEvent('loadstart'))
    activePlayer.on('loadedmetadata', ({ duration }) => {
      durationLabel.value = secondsForDisplay(duration)
      seekableLabel.value = rangesForDisplay(activePlayer.getSeekableRanges())
      addEvent(`loadedmetadata: ${duration.toFixed(1)}s`)
    })
    activePlayer.on('canplay', () => addEvent('canplay'))
    activePlayer.on('play', () => addEvent('play'))
    activePlayer.on('playing', () => {
      updateMediaStatus()
      addEvent('playing')
    })
    activePlayer.on('pause', () => {
      updateMediaStatus()
      addEvent('pause')
    })
    activePlayer.on('waiting', () => addEvent('waiting'))
    activePlayer.on('seeking', ({ currentTime, duration }) => {
      isSeeking.value = true
      updatePlaybackPosition(currentTime, duration)
      addEvent(`seeking: ${currentTime.toFixed(1)}s`)
    })
    activePlayer.on('seeked', ({ currentTime, duration }) => {
      isSeeking.value = false
      updatePlaybackPosition(currentTime, duration)
      playedLabel.value = rangesForDisplay(activePlayer.getPlayedRanges())
      addEvent(`seeked: ${currentTime.toFixed(1)}s`)
    })
    activePlayer.on('timeupdate', ({ currentTime, duration }) => {
      updatePlaybackPosition(currentTime, duration)
      playedLabel.value = rangesForDisplay(activePlayer.getPlayedRanges())
    })
    activePlayer.on('durationchange', ({ duration }) => {
      durationLabel.value = secondsForDisplay(duration)
    })
    activePlayer.on('bufferupdate', ({ ranges }) => {
      bufferedLabel.value = rangesForDisplay(ranges)
      seekableLabel.value = rangesForDisplay(activePlayer.getSeekableRanges())
    })
    activePlayer.on('volumechange', ({ volume: activeVolume, isMuted: activeMuted }) => {
      volume.value = activeVolume
      isMuted.value = activeMuted
      addEvent(`volumechange: ${activeVolume.toFixed(2)} / muted ${activeMuted}`)
    })
    activePlayer.on('ratechange', ({ playbackRate: activePlaybackRate }) => {
      playbackRate.value = activePlaybackRate
      playbackRateLabel.value = `${activePlaybackRate.toFixed(2)}x`
      addEvent(`ratechange: ${activePlaybackRate.toFixed(2)}x`)
    })
    activePlayer.on('adaptivechange', ({ protocol, implementation }) => {
      adaptiveImplementationLabel.value = `${protocol} / ${implementation}`
      adaptiveVariantLabel.value = 'automatic'
      adaptiveBitrateLabel.value = 'unknown'
      manifestVariantLabel.value = implementation === 'native' ? 'native metadata unavailable' : 'loading'
      segmentLabel.value = 'waiting'
      addEvent(`adaptivechange: ${protocol} / ${implementation}`)
    })
    activePlayer.on('manifestloaded', ({ variants }) => {
      manifestVariantLabel.value = `${variants.length} variants`
      addEvent(`manifestloaded: ${variants.length} variants`)
    })
    activePlayer.on('variantchange', ({ variantId, bitrate }) => {
      adaptiveVariantLabel.value = variantId ?? 'automatic'
      adaptiveBitrateLabel.value = bitrate === undefined ? 'unknown' : `${Math.round(bitrate / 1000)} kbps`
      addEvent(`variantchange: ${adaptiveVariantLabel.value}`)
    })
    activePlayer.on('segmentloadstart', ({ url }) => {
      segmentLabel.value = `loading ${url ?? 'segment'}`
    })
    activePlayer.on('segmentloaded', ({ url }) => {
      segmentLabel.value = `loaded ${url ?? 'segment'}`
      addEvent(`segmentloaded: ${url ?? 'segment'}`)
    })
    activePlayer.on('streamerror', ({ category, isFatal }) => {
      segmentLabel.value = `${isFatal ? 'fatal' : 'recoverable'} ${category} error`
      addEvent(`streamerror: ${category} / fatal ${isFatal}`)
    })
    activePlayer.on('ended', () => {
      updateMediaStatus()
      addEvent('ended')
    })
    activePlayer.on('error', error => addEvent(`error: ${error.code}`))
  }

  async function applyActiveSample(): Promise<void> {
    const formatGroup = activeFormatGroup.value
    const track = activeTrack.value
    sourceUrl.value = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)
    protocolOverride.value = 'auto'
    adaptiveImplementationLabel.value = 'media element'
    adaptiveVariantLabel.value = 'automatic'
    adaptiveBitrateLabel.value = 'unknown'
    manifestVariantLabel.value = 'none'
    segmentLabel.value = 'none'

    await withBusyControls(async () => {
      player.setSource(sourceUrl.value)
      await player.load()
      updateMediaStatus()
      addEvent(`loaded: ${formatGroup.label} / ${track.title}`)
    })
  }

  async function selectTrack(track: DemoTrack): Promise<void> {
    if (activeTrackId.value === track.id) {
      return
    }

    activeTrackId.value = track.id
    await applyActiveSample()
  }

  async function selectFormat(formatGroup: DemoFormatGroup): Promise<void> {
    if (activeFormatFolder.value === formatGroup.folder) {
      return
    }

    activeFormatFolder.value = formatGroup.folder
    await applyActiveSample()
  }

  async function nextTrack(): Promise<void> {
    const currentIndex = demoTracks.findIndex(track => track.id === activeTrackId.value)
    const nextIndex = (currentIndex + 1) % demoTracks.length
    activeTrackId.value = demoTracks[nextIndex].id
    await applyActiveSample()
  }

  async function prevTrack(): Promise<void> {
    const currentIndex = demoTracks.findIndex(track => track.id === activeTrackId.value)
    const previousIndex = (currentIndex - 1 + demoTracks.length) % demoTracks.length
    activeTrackId.value = demoTracks[previousIndex].id
    await applyActiveSample()
  }

  async function loadSource(): Promise<void> {
    await withBusyControls(async () => {
      // AI modified: explicit protocol metadata handles signed URLs without .m3u8 or .mpd suffixes.
      player.setSource(protocolOverride.value === 'auto'
        ? sourceUrl.value
        : { url: sourceUrl.value, protocol: protocolOverride.value })
      await player.load()
      updateMediaStatus()
      addEvent('loaded custom source')
    })
  }

  function isActiveTrack(trackId: string): boolean {
    return activeTrackId.value === trackId
  }

  function isActiveFormat(formatFolder: string): boolean {
    return activeFormatFolder.value === formatFolder
  }

  async function play(): Promise<void> {
    await withBusyControls(async () => {
      await player.play()
    })
  }

  function pause(): void {
    player.pause()
  }

  function stop(): void {
    player.stop()
    updatePlaybackPosition(0, player.getDuration())
    updateMediaStatus()
  }

  async function seek(): Promise<void> {
    const duration = player.getDuration()

    if (duration <= 0) {
      return
    }

    await player.seek((seekValue.value / seekRangeMax) * duration)
  }

  async function fastSeek(): Promise<void> {
    const duration = player.getDuration()

    if (duration <= 0) {
      return
    }

    // AI modified: demo fast seek targets the same position selected by the existing timeline.
    await withBusyControls(async () => {
      await player.fastSeek((seekValue.value / seekRangeMax) * duration)
    })
  }

  function setVolume(): void {
    player.setVolume(volume.value)
  }

  function setMuted(): void {
    player.setMuted(isMuted.value)
  }

  function setLoop(): void {
    player.setLoop(isLooping.value)
  }

  function setAutoplay(): void {
    player.setAutoplay(shouldAutoplay.value)
    addEvent(`autoplay: ${player.getAutoplay()}`)
  }

  function setPreservesPitch(): void {
    player.setPreservesPitch(shouldPreservePitch.value)
    addEvent(`preservesPitch: ${player.getPreservesPitch()}`)
  }

  function setPreload(): void {
    player.setPreload(preload.value)
    addEvent(`preload: ${player.getPreload()}`)
  }

  function setPlaybackRate(): void {
    player.setPlaybackRate(playbackRate.value)
  }

  onMounted(async () => {
    // AI modified: create the player after mount because VitePress renders examples during SSR.
    player = new AudioPlayer({
      source: defaultDemoSampleUrl,
      adapters: [
        createHlsAdapter({ playbackStrategy: 'native-first' }),
        createDashAdapter(),
      ],
      preload: preload.value,
      autoplay: shouldAutoplay.value,
      muted: isMuted.value,
      loop: isLooping.value,
      volume: volume.value,
      playbackRate: playbackRate.value,
      preservesPitch: shouldPreservePitch.value,
    })
    observePlayer(player)
    await applyActiveSample()
  })

  onUnmounted(() => {
    player.dispose()
  })

  return {
    sourceUrl,
    protocolOverride,
    demoTracks,
    demoFormatGroups,
    activeTrack,
    activeFormatGroup,
    activeSampleLabel,
    activeSamplePath,
    playerState,
    adaptiveImplementationLabel,
    adaptiveVariantLabel,
    adaptiveBitrateLabel,
    manifestVariantLabel,
    segmentLabel,
    bufferedLabel,
    seekableLabel,
    playedLabel,
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
    shouldAutoplay,
    shouldPreservePitch,
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
    fastSeek,
    setVolume,
    setMuted,
    setLoop,
    setAutoplay,
    setPreservesPitch,
    setPreload,
    setPlaybackRate,
  }
}

export type GaudioDemo = ReturnType<typeof useGaudioDemo>
