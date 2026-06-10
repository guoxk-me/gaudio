import type { DemoFormatGroup, DemoTrack } from '../data/demo-samples'
import { AudioPlayer } from 'gaudio'
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

export function useGaudioDemo() {
  const activeFormatFolder = ref(defaultDemoFormatFolder)
  const activeTrackId = ref(defaultDemoTrackId)
  const sourceUrl = ref(defaultDemoSampleUrl)
  const playerState = ref('idle')
  const bufferedLabel = ref('0s')
  const playbackRateLabel = ref('1.00x')
  const currentTimeLabel = ref('0:00')
  const durationLabel = ref('0:00')
  const seekValue = ref(0)
  const volume = ref(0.8)
  const playbackRate = ref(1)
  const eventLog = ref<string[]>([])
  const isBusy = ref(false)

  const activeTrack = computed(() => findDemoTrack(activeTrackId.value))
  const activeFormatGroup = computed(() => findDemoFormatGroup(activeFormatFolder.value))
  const activeSampleLabel = computed(() => `${activeFormatGroup.value.label} · ${activeTrack.value.title}`)
  const activeSamplePath = computed(() => demoSampleUrl(
    activeFormatGroup.value.folder,
    activeTrack.value.id,
    activeFormatGroup.value.extension,
  ))

  const player = new AudioPlayer({ source: defaultDemoSampleUrl, preload: 'metadata' })
  player.setVolume(volume.value)

  function addEvent(message: string): void {
    eventLog.value = [`${new Date().toLocaleTimeString()} ${message}`, ...eventLog.value].slice(0, 12)
  }

  function updatePlaybackPosition(currentTime: number, duration: number): void {
    currentTimeLabel.value = secondsForDisplay(currentTime)
    durationLabel.value = secondsForDisplay(duration)
    seekValue.value = duration > 0 ? (currentTime / duration) * seekRangeMax : 0
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

  // AI modified: keep demo UI driven by real AudioPlayer events instead of duplicated playback state.
  player.on('statechange', (state) => {
    playerState.value = state
    addEvent(`statechange: ${state}`)
  })

  player.on('timeupdate', ({ currentTime, duration }) => {
    updatePlaybackPosition(currentTime, duration)
  })

  player.on('bufferupdate', ({ bufferedStart, bufferedEnd }) => {
    bufferedLabel.value = `${Math.max(0, bufferedEnd - bufferedStart).toFixed(1)}s`
  })

  player.on('ended', () => {
    addEvent('ended')
  })

  player.on('error', (error) => {
    addEvent(`error: ${error.code}`)
  })

  async function applyActiveSample(): Promise<void> {
    const formatGroup = activeFormatGroup.value
    const track = activeTrack.value
    sourceUrl.value = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)

    await withBusyControls(async () => {
      player.setSource(sourceUrl.value)
      await player.load()
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
      addEvent(`loaded custom source`)
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
  }

  async function seek(): Promise<void> {
    const duration = player.getDuration()

    if (duration <= 0) {
      return
    }

    await player.seek((seekValue.value / seekRangeMax) * duration)
  }

  function setVolume(): void {
    player.setVolume(volume.value)
  }

  function setPlaybackRate(): void {
    player.setPlaybackRate(playbackRate.value)
    playbackRateLabel.value = `${playbackRate.value.toFixed(2)}x`
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
    playbackRateLabel,
    currentTimeLabel,
    durationLabel,
    seekValue,
    seekRangeMax,
    volume,
    playbackRate,
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
    setVolume,
    setPlaybackRate,
  }
}
