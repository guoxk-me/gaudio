import type { PreloadMode, TimeRange } from 'gaudio'
import type { DemoFormatGroup, DemoTrack } from '../data/demo-samples'
import { AudioPlayer } from 'gaudio'
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
} from '../data/demo-samples'

const seekRangeMax = 1000

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
  const playerState = shallowRef('idle')
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

  const player = new AudioPlayer({
    source: defaultDemoSampleUrl,
    preload: preload.value,
    autoplay: shouldAutoplay.value,
    muted: isMuted.value,
    loop: isLooping.value,
    volume: volume.value,
    playbackRate: playbackRate.value,
    preservesPitch: shouldPreservePitch.value,
  })

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

  // AI modified: reflect native media lifecycle events through the stable AudioPlayer API.
  player.on('statechange', (state) => {
    playerState.value = state
    addEvent(`statechange: ${state}`)
  })

  player.on('loadstart', () => addEvent('loadstart'))
  player.on('loadedmetadata', ({ duration }) => {
    durationLabel.value = secondsForDisplay(duration)
    seekableLabel.value = rangesForDisplay(player.getSeekableRanges())
    addEvent(`loadedmetadata: ${duration.toFixed(1)}s`)
  })
  player.on('canplay', () => addEvent('canplay'))
  player.on('play', () => addEvent('play'))
  player.on('playing', () => {
    updateMediaStatus()
    addEvent('playing')
  })
  player.on('pause', () => {
    updateMediaStatus()
    addEvent('pause')
  })
  player.on('waiting', () => addEvent('waiting'))
  player.on('seeking', ({ currentTime, duration }) => {
    isSeeking.value = true
    updatePlaybackPosition(currentTime, duration)
    addEvent(`seeking: ${currentTime.toFixed(1)}s`)
  })
  player.on('seeked', ({ currentTime, duration }) => {
    isSeeking.value = false
    updatePlaybackPosition(currentTime, duration)
    playedLabel.value = rangesForDisplay(player.getPlayedRanges())
    addEvent(`seeked: ${currentTime.toFixed(1)}s`)
  })
  player.on('timeupdate', ({ currentTime, duration }) => {
    updatePlaybackPosition(currentTime, duration)
    playedLabel.value = rangesForDisplay(player.getPlayedRanges())
  })
  player.on('durationchange', ({ duration }) => {
    durationLabel.value = secondsForDisplay(duration)
  })
  player.on('bufferupdate', ({ ranges }) => {
    bufferedLabel.value = rangesForDisplay(ranges)
    seekableLabel.value = rangesForDisplay(player.getSeekableRanges())
  })
  player.on('volumechange', ({ volume: activeVolume, isMuted: activeMuted }) => {
    volume.value = activeVolume
    isMuted.value = activeMuted
    addEvent(`volumechange: ${activeVolume.toFixed(2)} / muted ${activeMuted}`)
  })
  player.on('ratechange', ({ playbackRate: activePlaybackRate }) => {
    playbackRate.value = activePlaybackRate
    playbackRateLabel.value = `${activePlaybackRate.toFixed(2)}x`
    addEvent(`ratechange: ${activePlaybackRate.toFixed(2)}x`)
  })
  player.on('ended', () => {
    updateMediaStatus()
    addEvent('ended')
  })
  player.on('error', error => addEvent(`error: ${error.code}`))

  async function applyActiveSample(): Promise<void> {
    const formatGroup = activeFormatGroup.value
    const track = activeTrack.value
    sourceUrl.value = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)

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
      player.setSource(sourceUrl.value)
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
    await applyActiveSample()
  })

  onUnmounted(() => {
    player.dispose()
  })

  return {
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
