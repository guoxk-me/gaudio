import type { AdaptiveVariant, AudioAnalyzer, AudioProtocol, AudioSource, AudioSourceDescription, PreloadMode, TimeRange } from 'gaudio'
import type { DashAudioAdapter } from 'gaudio/dash'
import type { HlsAudioAdapter } from 'gaudio/hls'
import type { DemoFormatGroup, DemoTrack } from './demo-samples'
import { AdaptivePlaybackPreset, AudioPlayer, BlobAudioSource, EventEmitter, GAudioError, HttpAudioSource } from 'gaudio'
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
const automaticQualitySelection = 'auto'

type ProtocolOverride = 'auto' | AudioProtocol
type DemoSourceMode = 'url-string' | 'source-description' | 'http-source' | 'blob-source' | 'custom-source'

interface BrowserSupportRow {
  label: string
  mimeType: string
  support: string
}

interface AdapterDiagnosticRow {
  label: string
  value: string
}

interface AdaptiveQualityChoice {
  id: string
  label: string
}

interface DemoEmitterEvents {
  preview: string
}

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

function samplesForDisplay(samples: Uint8Array): string {
  return Array.from(samples)
    .slice(0, 8)
    .join(', ')
}

function bitrateForDisplay(bitrate: number | undefined): string {
  return bitrate === undefined ? 'unknown' : `${Math.round(bitrate / 1000)} kbps`
}

function variantChoiceLabel(variant: AdaptiveVariant): string {
  const codecLabel = variant.codecs ? ` · ${variant.codecs}` : ''

  return `${variant.id} · ${bitrateForDisplay(variant.bitrate)}${codecLabel}`
}

function sourceProtocol(protocolOverride: ProtocolOverride): AudioProtocol | undefined {
  return protocolOverride === 'auto' ? undefined : protocolOverride
}

function browserSupportForDisplay(support: string, hasAdapterSupport: boolean): string {
  if (support !== '') {
    return support
  }

  return hasAdapterSupport ? 'adapter' : 'unsupported'
}

export function useGaudioDemo() {
  const activeFormatFolder = shallowRef(defaultDemoFormatFolder)
  const activeTrackId = shallowRef(defaultDemoTrackId)
  const sourceUrl = shallowRef(defaultDemoSampleUrl)
  const protocolOverride = shallowRef<ProtocolOverride>('auto')
  const sourceMode = shallowRef<DemoSourceMode>('url-string')
  const playerState = shallowRef('idle')
  const adaptiveImplementationLabel = shallowRef('media element')
  const adaptiveVariantLabel = shallowRef('automatic')
  const adaptiveBitrateLabel = shallowRef('unknown')
  const adaptiveVariants = shallowRef<readonly AdaptiveVariant[]>([])
  const adaptiveQualitySelection = shallowRef<string>(automaticQualitySelection)
  const adaptiveQualityControlLabel = shallowRef('automatic ABR')
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
  const browserSupportRows = shallowRef<BrowserSupportRow[]>([])
  const adapterDiagnosticRows = shallowRef<AdapterDiagnosticRow[]>([])
  const sourceLifecycleLabel = shallowRef('open 0 / close 0')
  const customSourceOpenCount = shallowRef(0)
  const customSourceCloseCount = shallowRef(0)
  const analyzerStatus = shallowRef('not captured')
  const frequencyPreview = shallowRef('none')
  const waveformPreview = shallowRef('none')
  const eventEmitterStatus = shallowRef('not run')
  const playlistStatus = shallowRef('not run')
  const mediaSessionStatus = shallowRef('metadata pending')
  const errorPreviewStatus = shallowRef('not run')

  const activeTrack = computed(() => findDemoTrack(activeTrackId.value))
  const activeFormatGroup = computed(() => findDemoFormatGroup(activeFormatFolder.value))
  const activeSampleLabel = computed(() => `${activeFormatGroup.value.label} · ${activeTrack.value.title}`)
  const activeSamplePath = computed(() => demoSampleUrl(
    activeFormatGroup.value.folder,
    activeTrack.value.id,
    activeFormatGroup.value.extension,
  ))
  const adaptiveQualityChoices = computed<AdaptiveQualityChoice[]>(() => [
    { id: automaticQualitySelection, label: 'Automatic ABR' },
    ...adaptiveVariants.value.map(variant => ({
      id: variant.id,
      label: variantChoiceLabel(variant),
    })),
  ])

  let player: AudioPlayer
  let hlsAdapter: HlsAudioAdapter
  let dashAdapter: DashAudioAdapter

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

  function updateBrowserSupport(): void {
    browserSupportRows.value = demoFormatGroups.map((formatGroup) => {
      const mediaSupport = player.canPlayType(formatGroup.mimeType)
      const hasAdapterSupport = formatGroup.folder === 'hls'
        ? hlsAdapter.isSupported()
        : formatGroup.folder === 'dash'
          ? dashAdapter.isSupported()
          : false

      return {
        label: formatGroup.label,
        mimeType: formatGroup.mimeType,
        support: browserSupportForDisplay(mediaSupport, hasAdapterSupport),
      }
    })
  }

  function updateAdapterDiagnostics(): void {
    const hlsConfig = hlsAdapter.getConfig()
    const dashSettings = dashAdapter.getSettings()

    adapterDiagnosticRows.value = [
      { label: 'AdaptivePlaybackPreset', value: AdaptivePlaybackPreset.Balanced },
      { label: 'HLS supported', value: String(hlsAdapter.isSupported()) },
      { label: 'HLS implementation', value: hlsAdapter.implementation ?? 'inactive' },
      { label: 'HLS maxBufferLength', value: String(hlsConfig.maxBufferLength ?? 'preset') },
      { label: 'HLS instance', value: hlsAdapter.hlsInstance ? 'active' : 'none' },
      { label: 'DASH supported', value: String(dashAdapter.isSupported()) },
      { label: 'DASH instance', value: dashAdapter.dashInstance ? 'active' : 'none' },
      { label: 'DASH bufferTimeDefault', value: String(dashSettings.streaming?.buffer?.bufferTimeDefault ?? 'preset') },
    ]
  }

  function updateSourceLifecycle(): void {
    sourceLifecycleLabel.value = `open ${customSourceOpenCount.value} / close ${customSourceCloseCount.value}`
  }

  function updatePlaylistStatus(): void {
    const playlistLength = player.getPlaylist().length
    const playlistIndex = player.getPlaylistIndex()
    const selectedTrack = player.getSelectedAudioTrack()
    const audioTrackCount = player.getAudioTracks().length

    playlistStatus.value = playlistLength === 0
      ? 'direct source'
      : `${playlistLength} tracks / index ${playlistIndex} / audio tracks ${audioTrackCount} / selected ${selectedTrack?.id ?? 'default'}`
  }

  function updateMediaSessionStatus(): void {
    const metadata = player.getMediaSessionMetadata()

    mediaSessionStatus.value = metadata
      ? `${metadata.title ?? 'untitled'} · ${metadata.artist ?? 'unknown artist'}`
      : 'none'
  }

  function resetAdaptiveQualityControls(controlLabel = 'automatic ABR'): void {
    adaptiveVariants.value = []
    adaptiveQualitySelection.value = automaticQualitySelection
    adaptiveQualityControlLabel.value = controlLabel
  }

  // AI modified: expose every public source input shape through one demo selector.
  async function audioSourceForLoad(): Promise<string | AudioSourceDescription | AudioSource> {
    const protocol = sourceProtocol(protocolOverride.value)
    const sourceDescription: AudioSourceDescription = {
      url: sourceUrl.value,
      protocol,
      mimeType: activeFormatGroup.value.mimeType,
    }

    switch (sourceMode.value) {
      case 'source-description':
        return sourceDescription
      case 'http-source':
        return new HttpAudioSource(sourceDescription)
      case 'blob-source': {
        const response = await fetch(sourceUrl.value)
        const sourceBlob = await response.blob()

        return new BlobAudioSource(sourceBlob, {
          protocol,
          mimeType: sourceBlob.type || activeFormatGroup.value.mimeType,
        })
      }
      case 'custom-source':
        return {
          kind: 'url',
          url: sourceUrl.value,
          protocol,
          mimeType: activeFormatGroup.value.mimeType,
          open: async () => {
            customSourceOpenCount.value += 1
            updateSourceLifecycle()
            return { url: sourceUrl.value }
          },
          close: async () => {
            customSourceCloseCount.value += 1
            updateSourceLifecycle()
          },
        }
      case 'url-string':
        return sourceUrl.value
    }
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
      updatePlaylistStatus()
      updateMediaSessionStatus()
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
      resetAdaptiveQualityControls(implementation === 'native' ? 'native HLS uses browser ABR' : 'automatic ABR')
      updateAdapterDiagnostics()
      addEvent(`adaptivechange: ${protocol} / ${implementation}`)
    })
    activePlayer.on('manifestloaded', ({ variants }) => {
      adaptiveVariants.value = variants
      manifestVariantLabel.value = variants.length === 0
        ? 'no variants'
        : variants.map(variant => bitrateForDisplay(variant.bitrate)).join(', ')
      adaptiveQualityControlLabel.value = variants.length === 0
        ? 'no selectable variants'
        : 'automatic ABR; manual variants available'
      updateAdapterDiagnostics()
      addEvent(`manifestloaded: ${variants.length} variants`)
    })
    activePlayer.on('variantchange', ({ variantId, bitrate }) => {
      adaptiveVariantLabel.value = variantId ?? 'automatic'
      adaptiveBitrateLabel.value = bitrateForDisplay(bitrate)
      updateAdapterDiagnostics()
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
      updateAdapterDiagnostics()
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
    sourceMode.value = 'url-string'
    adaptiveImplementationLabel.value = 'media element'
    adaptiveVariantLabel.value = 'automatic'
    adaptiveBitrateLabel.value = 'unknown'
    manifestVariantLabel.value = 'none'
    segmentLabel.value = 'none'
    resetAdaptiveQualityControls()

    await withBusyControls(async () => {
      player.setMediaSessionMetadata({
        title: track.title,
        artist: track.artist,
        album: 'GAudio demo',
      })
      player.setSource(sourceUrl.value)
      await player.load()
      updateMediaStatus()
      updateBrowserSupport()
      updateAdapterDiagnostics()
      updatePlaylistStatus()
      updateMediaSessionStatus()
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
      player.setSource(await audioSourceForLoad())
      await player.load()
      updateMediaStatus()
      updateBrowserSupport()
      updateAdapterDiagnostics()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent(`loaded source via ${sourceMode.value}`)
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

  function playerAnalyzer(): AudioAnalyzer | undefined {
    return player?.getAnalyzer()
  }

  // AI modified: expose utility APIs and runtime adapter controls without changing library internals.
  async function applyHlsConfigUpdate(): Promise<void> {
    await withBusyControls(async () => {
      await hlsAdapter.updateConfig({ maxBufferLength: 48 }, { apply: 'next-load' })
      updateAdapterDiagnostics()
      addEvent('HLS config update: maxBufferLength 48')
    })
  }

  async function applyDashSettingsUpdate(): Promise<void> {
    await withBusyControls(async () => {
      dashAdapter.updateSettings({
        streaming: {
          buffer: {
            bufferTimeDefault: 24,
          },
        },
      })
      updateAdapterDiagnostics()
      addEvent('DASH settings update: bufferTimeDefault 24')
    })
  }

  async function restoreAutomaticAdaptiveQuality(): Promise<void> {
    await player.setAdaptiveQuality('auto')
    adaptiveQualityControlLabel.value = adaptiveImplementationLabel.value.includes('/ native')
      ? 'native HLS uses browser ABR'
      : 'automatic ABR'
    updateAdapterDiagnostics()
    addEvent(`quality: ${adaptiveQualityControlLabel.value}`)
  }

  async function applyAdaptiveQualitySelection(): Promise<void> {
    await withBusyControls(async () => {
      if (adaptiveQualitySelection.value === automaticQualitySelection) {
        await restoreAutomaticAdaptiveQuality()
        return
      }

      const selectedVariant = adaptiveVariants.value.find(variant => variant.id === adaptiveQualitySelection.value)

      if (!selectedVariant) {
        adaptiveQualityControlLabel.value = 'selected variant unavailable'
        addEvent(`quality: ${adaptiveQualityControlLabel.value}`)
        return
      }

      // AI modified: manual quality now goes through the protocol-neutral AudioPlayer API.
      await player.setAdaptiveQuality(selectedVariant.id)
      adaptiveQualityControlLabel.value = `manual ${variantChoiceLabel(selectedVariant)}`
      updateAdapterDiagnostics()
      addEvent(`quality: ${adaptiveQualityControlLabel.value}`)
    })
  }

  async function runAnalyzerPreview(): Promise<void> {
    await withBusyControls(async () => {
      const analyzer = playerAnalyzer()

      if (!analyzer) {
        analyzerStatus.value = 'player analyzer unavailable'
        addEvent('AudioPlayer analyzer unavailable')
        return
      }

      frequencyPreview.value = samplesForDisplay(analyzer.getFrequencyData({ binCount: 8 }))
      waveformPreview.value = samplesForDisplay(analyzer.getWaveformData({ sampleCount: 8 }))
      analyzerStatus.value = 'captured 8 player samples'
      addEvent('AudioPlayer analyzer preview captured')
    })
  }

  function runEventEmitterPreview(): void {
    const previewEmitter = new EventEmitter<DemoEmitterEvents>()
    const receivedMessages: string[] = []
    const removePreviewListener = previewEmitter.on('preview', message => receivedMessages.push(message))

    previewEmitter.emit('preview', 'listener received payload')
    removePreviewListener()
    previewEmitter.emit('preview', 'ignored after off')
    previewEmitter.clear()
    eventEmitterStatus.value = receivedMessages.join(', ')
    addEvent(`EventEmitter preview: ${eventEmitterStatus.value}`)
  }

  async function runPlaylistPreview(): Promise<void> {
    const formatGroup = activeFormatGroup.value
    const track = activeTrack.value
    const primarySource = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)
    const fallbackSource = demoSampleUrl('mp3', track.id, '.mp3')

    await withBusyControls(async () => {
      // AI modified: exercise playlist, fallback, alternate audio track, and media session APIs in one visible preview.
      player.setPlaylist([
        {
          source: primarySource,
          fallbackSources: [fallbackSource],
          metadata: {
            title: track.title,
            artist: track.artist,
            album: 'GAudio playlist demo',
          },
          defaultAudioTrackId: 'main',
          audioTracks: [
            {
              id: 'main',
              label: `${formatGroup.label} main`,
              language: 'und',
              source: primarySource,
              fallbackSources: [fallbackSource],
            },
          ],
        },
      ])
      await player.load()
      updateMediaStatus()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent('playlist preview loaded with fallback source')
    })
  }

  function runErrorPreview(): void {
    const previewError = new GAudioError('SOURCE_UNAVAILABLE', 'Preview error for API coverage')

    errorPreviewStatus.value = `${previewError.name}: ${previewError.code}`
    addEvent(`GAudioError preview: ${previewError.code}`)
  }

  onMounted(async () => {
    hlsAdapter = createHlsAdapter({
      playbackStrategy: 'native-first',
      preset: AdaptivePlaybackPreset.Balanced,
    })
    dashAdapter = createDashAdapter({ preset: AdaptivePlaybackPreset.Balanced })
    // AI modified: create the player after mount because VitePress renders examples during SSR.
    player = new AudioPlayer({
      source: defaultDemoSampleUrl,
      adapters: [
        hlsAdapter,
        dashAdapter,
      ],
      preload: preload.value,
      autoplay: shouldAutoplay.value,
      muted: isMuted.value,
      loop: isLooping.value,
      volume: volume.value,
      playbackRate: playbackRate.value,
      preservesPitch: shouldPreservePitch.value,
      mediaSession: {
        metadata: {
          title: activeTrack.value.title,
          artist: activeTrack.value.artist,
          album: 'GAudio demo',
        },
      },
      // AI modified: demo analyzer samples now come from the public AudioPlayer configuration path.
      analyzer: {
        fftSize: 1024,
      },
    })
    observePlayer(player)
    updateSourceLifecycle()
    updateAdapterDiagnostics()
    updatePlaylistStatus()
    updateMediaSessionStatus()
    await applyActiveSample()
  })

  onUnmounted(() => {
    player.dispose()
  })

  return {
    sourceUrl,
    protocolOverride,
    sourceMode,
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
    adaptiveVariants,
    adaptiveQualityChoices,
    adaptiveQualitySelection,
    adaptiveQualityControlLabel,
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
    browserSupportRows,
    adapterDiagnosticRows,
    sourceLifecycleLabel,
    analyzerStatus,
    frequencyPreview,
    waveformPreview,
    eventEmitterStatus,
    playlistStatus,
    mediaSessionStatus,
    errorPreviewStatus,
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
    applyHlsConfigUpdate,
    applyDashSettingsUpdate,
    applyAdaptiveQualitySelection,
    playerAnalyzer,
    runAnalyzerPreview,
    runEventEmitterPreview,
    runPlaylistPreview,
    runErrorPreview,
  }
}

export type GaudioDemo = ReturnType<typeof useGaudioDemo>
