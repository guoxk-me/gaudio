import type { AdaptiveVariant, AudioAnalyzer, AudioProtocol, AudioSource, AudioSourceDescription, PreloadMode, TimeRange } from 'gaudio'
import type { DashAudioAdapter } from 'gaudio/dash'
import type { HlsAudioAdapter } from 'gaudio/hls'
import type { DemoFormatGroup, DemoTrack } from './demo-samples'
import { AdaptivePlaybackPreset, AudioPlayer, BlobAudioSource, EventEmitter, GAudioError, HttpAudioSource } from 'gaudio'
import { createDashAdapter } from 'gaudio/dash'
import { createHlsAdapter } from 'gaudio/hls'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import {
  defaultDemoFormatFolder,
  defaultDemoSampleUrl,
  defaultDemoTrackId,
  demoCoverArtUrl,
  demoCoverThumbUrl,
  demoFormatGroups,
  demoSampleUrl,
  demoTracks,
} from './demo-samples'

// AI modified: one keyboard slider step now advances one percent of the active timeline.
const seekRangeMax = 100
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

export interface DemoEventEntry {
  id: number
  message: string
  timestamp: number
}

interface DemoSourceRequest {
  sourceMode: DemoSourceMode
  sourceUrl: string
  protocolOverride: ProtocolOverride
}

interface DemoCatalogSelection {
  formatGroup: DemoFormatGroup
  track: DemoTrack
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

function mimeTypeForSource(sourceUrl: string, protocol: AudioProtocol | undefined): string | undefined {
  if (protocol === 'hls') {
    return 'application/vnd.apple.mpegurl'
  }

  if (protocol === 'dash') {
    return 'application/dash+xml'
  }

  const sourcePath = sourceUrl.split(/[?#]/)[0].toLowerCase()
  if (sourcePath.endsWith('.m3u')) {
    // AI modified: legacy HLS playlist URLs need the same HTTP-only handling as .m3u8 manifests.
    return 'application/vnd.apple.mpegurl'
  }

  return demoFormatGroups.find(formatGroup => sourcePath.endsWith(formatGroup.extension))?.mimeType
}

function isAdaptiveSource(protocol: AudioProtocol | undefined, mimeType: string | undefined): boolean {
  const mediaType = mimeType?.split(';', 1)[0].trim().toLowerCase()

  return protocol === 'hls'
    || protocol === 'dash'
    || mediaType === 'application/vnd.apple.mpegurl'
    || mediaType === 'application/x-mpegurl'
    || mediaType === 'application/mpegurl'
    || mediaType === 'audio/mpegurl'
    || mediaType === 'audio/x-mpegurl'
    || mediaType === 'application/dash+xml'
}

function sourceAddress(sourceUrl: string): URL | undefined {
  try {
    const baseUrl = globalThis.location?.href ?? 'https://gaudio.invalid'

    return new URL(sourceUrl, baseUrl)
  }
  catch {
    return undefined
  }
}

function catalogSelectionForSource(sourceUrl: string): DemoCatalogSelection | undefined {
  const requestedAddress = sourceAddress(sourceUrl)

  if (!requestedAddress) {
    return undefined
  }

  for (const formatGroup of demoFormatGroups) {
    for (const track of demoTracks) {
      const catalogAddress = sourceAddress(demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension))

      if (
        catalogAddress?.origin === requestedAddress.origin
        && catalogAddress.pathname === requestedAddress.pathname
      ) {
        return { formatGroup, track }
      }
    }
  }

  return undefined
}

function browserSupportForDisplay(support: string, hasAdapterSupport: boolean): string {
  if (support !== '') {
    return support
  }

  return hasAdapterSupport ? 'adapter' : 'unsupported'
}

export function useGaudioDemo() {
  const activeFormatFolder = shallowRef<string | undefined>(defaultDemoFormatFolder)
  const activeTrackId = shallowRef<string | undefined>(defaultDemoTrackId)
  const sourceUrl = shallowRef(defaultDemoSampleUrl)
  const activeSourceUrl = shallowRef(defaultDemoSampleUrl)
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
  const durationSeconds = shallowRef(0)
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
  const eventLog = shallowRef<DemoEventEntry[]>([])
  const isBusy = shallowRef(false)
  const operationError = shallowRef<string | undefined>()
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
  const canSelectAlternateAudioTrack = shallowRef(false)
  const canNavigateToPreviousPlaylistTrack = shallowRef(false)
  const canNavigateToNextPlaylistTrack = shallowRef(false)

  // AI modified: catalog selection now describes the source actually owned by the player.
  const activeTrack = computed(() => demoTracks.find(track => track.id === activeTrackId.value))
  const activeFormatGroup = computed(() => demoFormatGroups.find(formatGroup => (
    formatGroup.folder === activeFormatFolder.value
  )))
  const activeSampleLabel = computed(() => (
    activeFormatGroup.value && activeTrack.value
      ? `${activeFormatGroup.value.label} · ${activeTrack.value.title}`
      : undefined
  ))
  const activeSamplePath = computed(() => activeSourceUrl.value)
  const activeCoverThumbUrl = computed(() => (
    activeTrack.value ? demoCoverThumbUrl(activeTrack.value.coverThumb) : undefined
  ))
  const activeCoverArtUrl = computed(() => (
    activeTrack.value ? demoCoverArtUrl(activeTrack.value.coverFile) : undefined
  ))
  const adaptiveQualityChoices = computed<AdaptiveQualityChoice[]>(() => [
    { id: automaticQualitySelection, label: 'Automatic ABR' },
    ...adaptiveVariants.value.map(variant => ({
      id: variant.id,
      label: variantChoiceLabel(variant),
    })),
  ])
  const canUseBlobSource = computed(() => {
    const protocol = sourceProtocol(protocolOverride.value)

    return !isAdaptiveSource(protocol, mimeTypeForSource(sourceUrl.value, protocol))
  })

  watch(canUseBlobSource, (canUseBlob) => {
    if (!canUseBlob && sourceMode.value === 'blob-source') {
      // AI modified: manifest-relative segments require the original HTTP URL as their resolution base.
      sourceMode.value = 'http-source'
    }
  }, { flush: 'sync' })
  const canSeek = computed(() => (
    !isBusy.value
    && Number.isFinite(durationSeconds.value)
    && durationSeconds.value > 0
  ))

  let player: AudioPlayer
  let hlsAdapter: HlsAudioAdapter
  let dashAdapter: DashAudioAdapter
  let nextEventId = 0

  function addEvent(message: string): void {
    nextEventId += 1
    eventLog.value = [{
      id: nextEventId,
      message,
      // AI modified: retain the instant so each locale can render its own time convention.
      timestamp: Date.now(),
    }, ...eventLog.value].slice(0, 16)
  }

  function updatePlaybackPosition(currentTime: number, duration: number): void {
    currentTimeLabel.value = secondsForDisplay(currentTime)
    durationLabel.value = secondsForDisplay(duration)
    durationSeconds.value = Number.isFinite(duration) && duration > 0 ? duration : 0
    // AI modified: keep media telemetry aligned with the seek control's integer step across browsers.
    seekValue.value = durationSeconds.value > 0
      ? Math.min(seekRangeMax, Math.max(0, Math.round((currentTime / duration) * seekRangeMax)))
      : 0
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
    const audioTracks = player.getAudioTracks()
    const audioTrackCount = audioTracks.length

    playlistStatus.value = playlistLength === 0
      ? 'direct source'
      : `${playlistLength} tracks / index ${playlistIndex} / audio tracks ${audioTrackCount} / selected ${selectedTrack?.id ?? 'default'}`
    canSelectAlternateAudioTrack.value = audioTracks.some(audioTrack => audioTrack.id !== selectedTrack?.id)
    canNavigateToPreviousPlaylistTrack.value = playlistIndex > 0
    canNavigateToNextPlaylistTrack.value = playlistIndex >= 0 && playlistIndex < playlistLength - 1
  }

  function updateMediaSessionStatus(): void {
    const playlistTrack = player.getPlaylist()[player.getPlaylistIndex()]
    // AI modified: the inspector shows active playlist metadata before the direct-source fallback metadata.
    const metadata = playlistTrack?.metadata ?? player.getMediaSessionMetadata()

    mediaSessionStatus.value = metadata
      ? `${metadata.title ?? 'untitled'} · ${metadata.artist ?? 'unknown artist'}`
      : 'none'
  }

  function setCatalogMediaSession(track: DemoTrack): void {
    player.setMediaSessionMetadata({
      title: track.title,
      artist: track.artist,
      album: 'GAudio demo',
      artwork: [
        {
          src: demoCoverArtUrl(track.coverFile),
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    })
  }

  function reflectSourceOwnership(loadedSourceUrl: string): void {
    const catalogSelection = catalogSelectionForSource(loadedSourceUrl)

    activeSourceUrl.value = loadedSourceUrl
    activeTrackId.value = catalogSelection?.track.id
    activeFormatFolder.value = catalogSelection?.formatGroup.folder

    if (catalogSelection) {
      setCatalogMediaSession(catalogSelection.track)
      return
    }

    player.setMediaSessionMetadata(undefined)
  }

  function syncPlayerSnapshot(): void {
    playerState.value = player.getState()
    updatePlaybackPosition(player.getCurrentTime(), player.getDuration())
    updateMediaStatus()
    updatePlaylistStatus()
    updateMediaSessionStatus()
  }

  function resetAdaptiveQualityControls(controlLabel = 'automatic ABR'): void {
    adaptiveVariants.value = []
    adaptiveQualitySelection.value = automaticQualitySelection
    adaptiveQualityControlLabel.value = controlLabel
  }

  function resetAdaptivePlaybackStatus(): void {
    adaptiveImplementationLabel.value = 'media element'
    adaptiveVariantLabel.value = 'automatic'
    adaptiveBitrateLabel.value = 'unknown'
    manifestVariantLabel.value = 'none'
    segmentLabel.value = 'none'
    resetAdaptiveQualityControls()
  }

  // AI modified: explicit protocol choices and edited URLs now keep their routing metadata together.
  async function audioSourceForLoad(sourceRequest: DemoSourceRequest): Promise<string | AudioSourceDescription | AudioSource> {
    const protocol = sourceProtocol(sourceRequest.protocolOverride)
    const mimeType = mimeTypeForSource(sourceRequest.sourceUrl, protocol)
    const sourceDescription: AudioSourceDescription = {
      url: sourceRequest.sourceUrl,
      protocol,
      mimeType,
    }

    switch (sourceRequest.sourceMode) {
      case 'source-description':
        return sourceDescription
      case 'http-source':
        return new HttpAudioSource(sourceDescription)
      case 'blob-source': {
        const response = await fetch(sourceRequest.sourceUrl)

        if (!response.ok) {
          throw new Error(`Unable to load demo source: HTTP ${response.status} ${response.statusText}`)
        }

        const sourceBlob = await response.blob()
        const sourceMimeType = sourceBlob.type || mimeType

        if (isAdaptiveSource(protocol, sourceMimeType)) {
          // AI modified: response metadata catches edited manifest URLs whose extension did not reveal the protocol.
          return new HttpAudioSource({
            ...sourceDescription,
            mimeType: sourceMimeType,
          })
        }

        return new BlobAudioSource(sourceBlob, {
          protocol,
          mimeType: sourceMimeType,
        })
      }
      case 'custom-source':
        return {
          kind: 'url',
          url: sourceRequest.sourceUrl,
          protocol,
          mimeType,
          open: async () => {
            customSourceOpenCount.value += 1
            updateSourceLifecycle()
            return { url: sourceRequest.sourceUrl }
          },
          close: async () => {
            customSourceCloseCount.value += 1
            updateSourceLifecycle()
          },
        }
      case 'url-string':
        return protocol === undefined ? sourceRequest.sourceUrl : sourceDescription
    }
  }

  async function withBusyControls(action: () => Promise<void>): Promise<void> {
    isBusy.value = true
    operationError.value = undefined

    try {
      await action()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error'

      // AI modified: failed controls expose the error and resync every player-owned status before becoming interactive.
      operationError.value = errorMessage
      addEvent(errorMessage)
      syncPlayerSnapshot()
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
      updatePlaybackPosition(activePlayer.getCurrentTime(), duration)
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
      updatePlaybackPosition(activePlayer.getCurrentTime(), duration)
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
    const formatGroup = activeFormatGroup.value ?? demoFormatGroups[0]
    const track = activeTrack.value ?? demoTracks[0]

    activeFormatFolder.value = formatGroup.folder
    activeTrackId.value = track.id
    sourceUrl.value = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)
    activeSourceUrl.value = sourceUrl.value
    protocolOverride.value = 'auto'
    sourceMode.value = 'url-string'
    resetAdaptivePlaybackStatus()

    await withBusyControls(async () => {
      player.setSource(sourceUrl.value)
      setCatalogMediaSession(track)
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
    activeTrackId.value = track.id
    activeFormatFolder.value ??= defaultDemoFormatFolder
    await applyActiveSample()
  }

  async function selectFormat(formatGroup: DemoFormatGroup): Promise<void> {
    activeFormatFolder.value = formatGroup.folder
    activeTrackId.value ??= defaultDemoTrackId
    await applyActiveSample()
  }

  async function nextTrack(): Promise<void> {
    const currentIndex = demoTracks.findIndex(track => track.id === activeTrackId.value)
    const nextIndex = (currentIndex + 1) % demoTracks.length

    activeTrackId.value = demoTracks[nextIndex].id
    activeFormatFolder.value ??= defaultDemoFormatFolder
    await applyActiveSample()
  }

  async function prevTrack(): Promise<void> {
    const currentIndex = demoTracks.findIndex(track => track.id === activeTrackId.value)
    const previousIndex = currentIndex < 0
      ? demoTracks.length - 1
      : (currentIndex - 1 + demoTracks.length) % demoTracks.length

    activeTrackId.value = demoTracks[previousIndex].id
    activeFormatFolder.value ??= defaultDemoFormatFolder
    await applyActiveSample()
  }

  async function loadSource(): Promise<void> {
    if (!canUseBlobSource.value && sourceMode.value === 'blob-source') {
      // AI modified: programmatic same-tick loads follow the same adaptive-manifest constraint as the UI.
      sourceMode.value = 'http-source'
    }
    const sourceRequest: DemoSourceRequest = {
      sourceMode: sourceMode.value,
      sourceUrl: sourceUrl.value,
      protocolOverride: protocolOverride.value,
    }

    await withBusyControls(async () => {
      const requestedSource = await audioSourceForLoad(sourceRequest)
      const loadedSourceMode = sourceRequest.sourceMode === 'blob-source'
        && requestedSource instanceof HttpAudioSource
        ? 'http-source'
        : sourceRequest.sourceMode
      sourceMode.value = loadedSourceMode

      // AI modified: a committed source must not inherit catalog, Media Session, or adaptive state from the previous engine.
      resetAdaptivePlaybackStatus()
      player.setSource(requestedSource)
      reflectSourceOwnership(sourceRequest.sourceUrl)
      await player.load()
      updateMediaStatus()
      updateBrowserSupport()
      updateAdapterDiagnostics()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent(`loaded source via ${loadedSourceMode}`)
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

    if (!Number.isFinite(duration) || duration <= 0) {
      // AI modified: rejected timeline commits snap back to the actual non-seekable media position.
      updatePlaybackPosition(player.getCurrentTime(), duration)
      return
    }

    // AI modified: timeline seek failures use the same visible, retryable error path as other async controls.
    await withBusyControls(async () => {
      await player.seek((seekValue.value / seekRangeMax) * duration)
    })
  }

  async function fastSeek(): Promise<void> {
    const duration = player.getDuration()

    if (!Number.isFinite(duration) || duration <= 0) {
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

  async function selectAdaptiveQuality(adaptiveQualityId: string): Promise<void> {
    adaptiveQualitySelection.value = adaptiveQualityId
    await applyAdaptiveQualitySelection()
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
    const formatGroup = activeFormatGroup.value ?? demoFormatGroups[0]
    const track = activeTrack.value ?? demoTracks[0]
    const trackIndex = demoTracks.findIndex(demoTrack => demoTrack.id === track.id)
    const nextPlaylistTrack = demoTracks[(trackIndex + 2) % demoTracks.length]
    const fallbackFormatGroup = formatGroup.folder === 'mp3'
      ? (demoFormatGroups.find(group => group.folder === 'wav') ?? demoFormatGroups[1])
      : demoFormatGroups[0]
    const alternateFormatGroup = demoFormatGroups.find(group => (
      group.folder !== formatGroup.folder
      && group.folder !== fallbackFormatGroup.folder
      && group.folder !== 'hls'
      && group.folder !== 'dash'
    )) ?? fallbackFormatGroup
    const primarySource = demoSampleUrl(formatGroup.folder, track.id, formatGroup.extension)
    const fallbackSource = demoSampleUrl(
      fallbackFormatGroup.folder,
      track.id,
      fallbackFormatGroup.extension,
    )
    // AI modified: alternate audio uses the same program in another valid format, so playlist metadata stays truthful.
    const alternateSource = demoSampleUrl(
      alternateFormatGroup.folder,
      track.id,
      alternateFormatGroup.extension,
    )
    const nextPlaylistSource = demoSampleUrl(
      formatGroup.folder,
      nextPlaylistTrack.id,
      formatGroup.extension,
    )

    await withBusyControls(async () => {
      // AI modified: playlist loads start with telemetry and catalog state owned by the selected playlist source.
      resetAdaptivePlaybackStatus()
      // AI modified: preview controls use distinct valid resources for fallback, alternate audio, and navigation.
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
            {
              id: 'alternate',
              label: `${alternateFormatGroup.label} alternate`,
              language: 'und',
              source: alternateSource,
            },
          ],
        },
        {
          source: nextPlaylistSource,
          fallbackSources: [
            demoSampleUrl(
              fallbackFormatGroup.folder,
              nextPlaylistTrack.id,
              fallbackFormatGroup.extension,
            ),
          ],
          metadata: {
            title: nextPlaylistTrack.title,
            artist: nextPlaylistTrack.artist,
            album: 'GAudio playlist demo',
          },
        },
      ])
      activeFormatFolder.value = formatGroup.folder
      activeTrackId.value = track.id
      activeSourceUrl.value = primarySource
      sourceUrl.value = primarySource
      protocolOverride.value = 'auto'
      sourceMode.value = 'url-string'
      setCatalogMediaSession(track)
      await player.load()
      updateMediaStatus()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent('playlist preview loaded with distinct fallback and alternate sources')
    })
  }

  function reflectActivePlaylistSource(): void {
    const playlistTrack = player.getPlaylist()[player.getPlaylistIndex()]
    const selectedAudioTrack = player.getSelectedAudioTrack()
    const selectedSource = selectedAudioTrack?.source ?? playlistTrack?.source
    const selectedSourceUrl = typeof selectedSource === 'string'
      ? selectedSource
      : selectedSource?.url
    const metadata = playlistTrack?.metadata ?? player.getMediaSessionMetadata()
    const catalogTrack = demoTracks.find(track => (
      track.title === metadata?.title && track.artist === metadata.artist
    ))
    const catalogSelection = selectedSourceUrl ? catalogSelectionForSource(selectedSourceUrl) : undefined

    activeSourceUrl.value = selectedSourceUrl ?? activeSourceUrl.value
    sourceUrl.value = selectedSourceUrl ?? sourceUrl.value
    activeTrackId.value = catalogTrack?.id ?? activeTrackId.value
    activeFormatFolder.value = catalogSelection?.formatGroup.folder ?? activeFormatFolder.value
  }

  async function selectAlternateAudioTrackPreview(): Promise<void> {
    const selectedAudioTrack = player.getSelectedAudioTrack()
    const alternateAudioTrack = player.getAudioTracks().find(audioTrack => (
      audioTrack.id !== selectedAudioTrack?.id
    ))

    if (!alternateAudioTrack) {
      return
    }

    await withBusyControls(async () => {
      await player.selectAudioTrack(alternateAudioTrack.id, {
        autoplay: 'preserve',
        preserveTime: true,
      })
      reflectActivePlaylistSource()
      updateMediaStatus()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent(`selected alternate audio track: ${alternateAudioTrack.id}`)
    })
  }

  async function navigatePreviewPlaylist(direction: 'previous' | 'next'): Promise<void> {
    await withBusyControls(async () => {
      const didNavigate = direction === 'previous'
        ? await player.previous({ autoplay: false })
        : await player.next({ autoplay: false })

      if (!didNavigate) {
        return
      }

      reflectActivePlaylistSource()
      updateMediaStatus()
      updatePlaylistStatus()
      updateMediaSessionStatus()
      addEvent(`${direction} playlist track: ${player.getPlaylistIndex()}`)
    })
  }

  async function previousPreviewPlaylistTrack(): Promise<void> {
    await navigatePreviewPlaylist('previous')
  }

  async function nextPreviewPlaylistTrack(): Promise<void> {
    await navigatePreviewPlaylist('next')
  }

  function runErrorPreview(): void {
    const previewError = new GAudioError('SOURCE_UNAVAILABLE', 'Preview error for API coverage')

    errorPreviewStatus.value = `${previewError.name}: ${previewError.code}`
    addEvent(`GAudioError preview: ${previewError.code}`)
  }

  onMounted(async () => {
    const initialTrack = demoTracks[0]

    hlsAdapter = createHlsAdapter({
      // AI modified: prefer hls.js in the demo so HLS variants can be inspected and selected manually.
      playbackStrategy: 'hls-first',
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
          title: initialTrack.title,
          artist: initialTrack.artist,
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
    try {
      player.dispose()
    }
    catch (error) {
      // AI modified: cleanup failures must not abort VitePress route navigation.
      console.warn('GAudio demo cleanup failed', error)
    }
  })

  return {
    sourceUrl,
    protocolOverride,
    sourceMode,
    demoTracks,
    demoFormatGroups,
    activeTrack,
    activeFormatFolder,
    activeFormatGroup,
    activeSampleLabel,
    activeSamplePath,
    activeCoverThumbUrl,
    activeCoverArtUrl,
    playerState,
    adaptiveImplementationLabel,
    adaptiveVariantLabel,
    adaptiveBitrateLabel,
    adaptiveVariants,
    adaptiveQualityChoices,
    canUseBlobSource,
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
    canSeek,
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
    operationError,
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
    canSelectAlternateAudioTrack,
    canNavigateToPreviousPlaylistTrack,
    canNavigateToNextPlaylistTrack,
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
    selectAdaptiveQuality,
    playerAnalyzer,
    runAnalyzerPreview,
    runEventEmitterPreview,
    runPlaylistPreview,
    selectAlternateAudioTrackPreview,
    previousPreviewPlaylistTrack,
    nextPreviewPlaylistTrack,
    runErrorPreview,
  }
}

export type GaudioDemo = ReturnType<typeof useGaudioDemo>
