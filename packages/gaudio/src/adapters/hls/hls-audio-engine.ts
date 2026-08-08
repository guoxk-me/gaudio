// @env browser

import type Hls from 'hls.js'
import type {
  ErrorData,
  ErrorDetails,
  FragLoadedData,
  FragLoadingData,
  HlsConfig,
  LevelSwitchedData,
  ManifestParsedData,
} from 'hls.js'
import type { GAudioErrorCode } from '../../errors/errors'
import type {
  AdaptivePlaybackInfo,
  AdaptiveQualitySelection,
  AdaptiveStreamError,
  AdaptiveVariant,
} from '../adaptive-audio-types'
import { MediaElementAudioEngine } from '../../engine/media-element-audio-engine'
import { GAudioError } from '../../errors/errors'

type HlsEvents = typeof import('hls.js').Events
type HlsErrorTypes = typeof import('hls.js').ErrorTypes

export type HlsPlaybackImplementation = 'native' | 'hls.js'

export interface HlsEngineRuntime {
  createHls: (config: Partial<HlsConfig>) => Hls
  events: HlsEvents
  errorTypes: HlsErrorTypes
}

interface HlsAudioEngineOptions {
  implementation: HlsPlaybackImplementation
  config: Partial<HlsConfig>
  audioElement: HTMLAudioElement
  hlsRuntime?: HlsEngineRuntime
  onHlsInstanceChange: (instance: Hls | undefined) => void
  onDispose: () => void
}

export interface HlsReloadOptions {
  restorePosition: boolean
  resumePlayback?: boolean
}

function isHlsManifestFailure(details: string): boolean {
  // AI modified: media-playlist failures are manifest failures even when hls.js names them as levels or tracks.
  return details.startsWith('manifest')
    || details === 'levelEmptyError'
    || details.startsWith('levelLoad')
    || details === 'levelParsingError'
    || details.startsWith('audioTrackLoad')
    || details.startsWith('subtitleTrackLoad')
}

function isHlsSegmentFailure(details: string): boolean {
  // AI modified: encryption-key requests belong to the segment lifecycle alongside fragment requests.
  return details.startsWith('frag') || details.startsWith('keyLoad')
}

export class HlsAudioEngine extends MediaElementAudioEngine {
  private readonly implementation: HlsPlaybackImplementation
  private readonly hlsRuntime?: HlsEngineRuntime
  private readonly onHlsInstanceChange: (instance: Hls | undefined) => void
  private readonly onDispose: () => void
  private config: Partial<HlsConfig>
  private hls?: Hls
  private pendingHlsCleanup?: Hls
  private activeUrl?: string
  private previousVariantId?: string
  private adaptiveVariants: AdaptiveVariant[] = []
  private variantIdsByLevelIndex: string[] = []
  private readonly levelIndexesByVariantId = new Map<string, number>()
  private adaptiveQualitySelection: AdaptiveQualitySelection = 'auto'
  private pendingManualLevelIndex?: number
  private manualSelectionIntentId = 0
  private rejectMetadataWait?: (error: GAudioError) => void
  private publishedReloadError?: GAudioError
  private publishedReloadErrorGeneration?: number
  private pendingReloadResumePlayback?: boolean
  private reloadGeneration = 0
  private hasParsedCurrentManifest = false
  private hasStartedDisposal = false

  constructor(options: HlsAudioEngineOptions) {
    super(options.audioElement)
    this.implementation = options.implementation
    this.config = options.config
    this.hlsRuntime = options.hlsRuntime
    this.onHlsInstanceChange = options.onHlsInstanceChange
    this.onDispose = options.onDispose
  }

  async reload(config: Partial<HlsConfig>, options: HlsReloadOptions): Promise<void> {
    this.config = config
    if (this.implementation !== 'hls.js' || !this.activeUrl) {
      return
    }

    const currentTime = this.getCurrentTime()
    const shouldResume = options.resumePlayback ?? this.pendingReloadResumePlayback ?? !this.isPaused()
    const reloadGeneration = ++this.reloadGeneration
    const metadataEventStartTime = new Event('gaudio-hls-reload').timeStamp
    this.pendingReloadResumePlayback = shouldResume
    this.rejectMetadataWait?.(this.reloadAbortedError())
    this.cancelActiveSeek()
    if (shouldResume) {
      // AI modified: resumable replacement stays a silent internal pause until playback is restored.
      this.pauseWithoutEvent()
    }
    else {
      // AI modified: a reload that intentionally remains paused must update the public player lifecycle.
      this.pause()
    }
    this.publishedReloadError = undefined
    this.publishedReloadErrorGeneration = undefined
    // AI modified: one observer owns the canonical public error throughout metadata and state restoration.
    const removeReloadErrorListener = this.events.on('error', (error) => {
      if (reloadGeneration !== this.reloadGeneration) {
        return
      }
      this.publishedReloadError = error
      this.publishedReloadErrorGeneration = reloadGeneration
      this.rejectMetadataWait?.(error)
    })

    let hasReplacementMetadata = false
    try {
      const metadataReady = this.waitForMetadata(reloadGeneration, metadataEventStartTime)
      // AI modified: vendor setup can fail synchronously before the metadata promise is awaited.
      void metadataReady.catch(() => {})
      // AI modified: a reloaded hls.js instance starts a fresh manifest and variant lifecycle.
      this.previousVariantId = undefined
      this.adaptiveVariants = []
      this.variantIdsByLevelIndex = []
      this.levelIndexesByVariantId.clear()
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualLevelIndex = undefined
      this.destroyHlsInstance()
      this.createHlsInstance(this.activeUrl)
      await metadataReady
      hasReplacementMetadata = true
      this.assertCurrentReload(reloadGeneration)

      if (options.restorePosition && Number.isFinite(currentTime)) {
        await this.seek(currentTime)
        this.assertCurrentReload(reloadGeneration)
      }
      if (shouldResume) {
        await this.play()
        this.assertCurrentReload(reloadGeneration)
      }
    }
    catch (error) {
      if (!hasReplacementMetadata && reloadGeneration === this.reloadGeneration) {
        try {
          // AI modified: a replacement that fails during setup or metadata never remains adapter-visible.
          this.destroyHlsInstance(false)
        }
        catch {
          // Preserve the reload error while retaining failed vendor cleanup for a later retry.
        }
      }
      let playerError: GAudioError
      if (reloadGeneration !== this.reloadGeneration) {
        playerError = this.reloadAbortedError()
      }
      else if (
        this.publishedReloadError !== undefined
        && this.publishedReloadErrorGeneration === reloadGeneration
      ) {
        // AI modified: promise rejection reuses the error already delivered by the engine event channel.
        playerError = this.publishedReloadError
      }
      else if (error instanceof GAudioError) {
        playerError = error
      }
      else {
        playerError = new GAudioError('ADAPTIVE_STREAM_ERROR', 'HLS configuration reload failed', error)
      }
      if (reloadGeneration === this.reloadGeneration) {
        this.rejectMetadataWait?.(playerError)
      }
      if (
        playerError.code !== 'LOAD_ABORTED'
        && (
          playerError !== this.publishedReloadError
          || this.publishedReloadErrorGeneration !== reloadGeneration
        )
      ) {
        this.events.emit('error', playerError)
      }
      throw playerError
    }
    finally {
      removeReloadErrorListener()
      if (reloadGeneration === this.reloadGeneration) {
        this.rejectMetadataWait?.(this.reloadAbortedError())
        this.rejectMetadataWait = undefined
        this.publishedReloadError = undefined
        this.publishedReloadErrorGeneration = undefined
        this.pendingReloadResumePlayback = undefined
      }
    }
  }

  updateConfig(config: Partial<HlsConfig>): void {
    // AI modified: next-load updates must reach a reused engine without recreating active playback.
    this.config = config
  }

  override dispose(): void {
    const isRepeatedDisposal = this.hasStartedDisposal
    this.hasStartedDisposal = true
    let firstCleanupError: unknown
    let hasCleanupError = false

    if (isRepeatedDisposal || this.pendingHlsCleanup) {
      try {
        // AI modified: vendor and base retries are independent so one failure cannot starve the other.
        this.destroyHlsInstance()
      }
      catch (error) {
        hasCleanupError = true
        firstCleanupError = error
      }
    }

    try {
      super.dispose()
    }
    catch (error) {
      if (!hasCleanupError) {
        hasCleanupError = true
        firstCleanupError = error
      }
    }
    try {
      this.onDispose()
    }
    catch (error) {
      if (!hasCleanupError) {
        hasCleanupError = true
        firstCleanupError = error
      }
    }
    if (hasCleanupError) {
      throw firstCleanupError
    }
  }

  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    return this.activeUrl && (this.implementation === 'native' || this.hls)
      ? { protocol: 'hls', implementation: this.implementation }
      : undefined
  }

  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    // AI modified: public snapshots cannot mutate the level metadata used for vendor selection.
    return this.adaptiveVariants.map(variant => ({
      id: variant.id,
      bitrate: variant.bitrate,
      codecs: variant.codecs,
    }))
  }

  getAdaptiveQualitySelection(): AdaptiveQualitySelection {
    return this.adaptiveQualitySelection
  }

  async setAdaptiveQuality(variantId: AdaptiveQualitySelection): Promise<void> {
    if (this.implementation === 'native' && variantId === 'auto' && this.activeUrl) {
      // AI modified: automatic quality is already the only valid mode for active native HLS playback.
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualLevelIndex = undefined
      return
    }

    if (this.implementation !== 'hls.js' || !this.hls) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Manual HLS quality selection requires hls.js playback')
    }

    if (variantId === 'auto') {
      this.hls.loadLevel = -1
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualLevelIndex = undefined
      this.manualSelectionIntentId += 1
      return
    }

    const levelIndex = this.levelIndexesByVariantId.get(variantId)
    if (levelIndex === undefined) {
      throw new GAudioError('ADAPTIVE_STREAM_ERROR', `HLS variant ${variantId} is unavailable`)
    }

    // AI modified: use the next segment switch path so manual selection does not interrupt current audio.
    this.hls.nextLevel = levelIndex
    this.adaptiveQualitySelection = variantId
    // AI modified: report the manual change only when hls.js confirms the runtime level actually switched.
    this.pendingManualLevelIndex = levelIndex
    this.manualSelectionIntentId += 1
  }

  protected override isSourceMetadataCurrent(
    event: Event,
    expectedUrl: string,
    eventStartTime: number | undefined,
  ): boolean {
    if (this.implementation === 'native') {
      return super.isSourceMetadataCurrent(event, expectedUrl, eventStartTime)
    }
    // AI modified: hls.js ownership requires both its current manifest and replacement-media readiness.
    return this.isMediaEventCurrent(event, eventStartTime)
      && this.hasMediaMetadata()
      && this.activeUrl === expectedUrl
      && this.hls !== undefined
      && this.hasParsedCurrentManifest
  }

  protected override attachSourceUrl(url: string): void {
    if (this.implementation === 'hls.js') {
      // AI modified: a failed teardown must finish before another vendor instance can be created.
      this.destroyHlsInstance()
    }
    this.activeUrl = url
    this.previousVariantId = undefined
    this.adaptiveVariants = []
    this.variantIdsByLevelIndex = []
    this.levelIndexesByVariantId.clear()
    this.adaptiveQualitySelection = 'auto'
    this.pendingManualLevelIndex = undefined
    this.pendingReloadResumePlayback = undefined
    this.hasParsedCurrentManifest = false

    if (this.implementation === 'native') {
      super.attachSourceUrl(url)
    }
    else {
      this.createHlsInstance(url)
    }

    // AI modified: a synchronous fatal vendor error can detach this source before attachment returns.
    if (this.activeUrl === url && (this.implementation === 'native' || this.hls !== undefined)) {
      this.events.emit('adaptivechange', {
        protocol: 'hls',
        implementation: this.implementation,
      })
    }
  }

  protected override detachSourceUrl(): void {
    // AI modified: removing a source invalidates every in-flight reload restoration step.
    this.reloadGeneration += 1
    this.rejectMetadataWait?.(new GAudioError('LOAD_ABORTED', 'HLS reload was interrupted by source removal'))
    this.activeUrl = undefined
    this.previousVariantId = undefined
    this.adaptiveVariants = []
    this.variantIdsByLevelIndex = []
    this.levelIndexesByVariantId.clear()
    this.adaptiveQualitySelection = 'auto'
    this.pendingManualLevelIndex = undefined
    this.pendingReloadResumePlayback = undefined
    this.hasParsedCurrentManifest = false
    let firstDetachError: unknown
    let hasDetachError = false
    try {
      // AI modified: detachment attempts only the active instance; pending cleanup is retried by the next load or dispose.
      this.destroyHlsInstance(false)
    }
    catch (error) {
      hasDetachError = true
      firstDetachError = error
    }
    try {
      super.detachSourceUrl()
    }
    catch (error) {
      if (!hasDetachError) {
        hasDetachError = true
        firstDetachError = error
      }
    }
    if (hasDetachError) {
      // AI modified: vendor failure remains first while native detachment is still attempted and retryable.
      throw firstDetachError
    }
  }

  private createHlsInstance(url: string): void {
    if (!this.hlsRuntime) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'hls.js runtime is unavailable')
    }

    const hls = this.hlsRuntime.createHls(this.config)
    const events = this.hlsRuntime.events
    this.hls = hls
    this.hasParsedCurrentManifest = false
    this.onHlsInstanceChange(hls)
    // AI modified: instance-bound listeners ignore queued events from a destroyed source after replacement.
    hls.on(events.MANIFEST_PARSED, (event, payload) => {
      if (this.hls === hls) {
        this.handleManifestParsed(event, payload)
      }
    })
    hls.on(events.LEVEL_SWITCHED, (event, payload) => {
      if (this.hls === hls) {
        this.handleLevelSwitched(event, payload)
      }
    })
    hls.on(events.FRAG_LOADING, (event, payload) => {
      if (this.hls === hls) {
        this.handleFragmentLoading(event, payload)
      }
    })
    hls.on(events.FRAG_LOADED, (event, payload) => {
      if (this.hls === hls) {
        this.handleFragmentLoaded(event, payload)
      }
    })
    hls.on(events.ERROR, (event, payload) => {
      if (this.hls === hls) {
        this.handleHlsError(event, payload)
      }
    })
    hls.attachMedia(this.audioElement)
    hls.loadSource(url)
  }

  private destroyHlsInstance(shouldRetryPendingCleanup = true): void {
    const hls = this.hls ?? (shouldRetryPendingCleanup ? this.pendingHlsCleanup : undefined)
    if (!hls) {
      return
    }
    if (this.hls === hls) {
      this.hls = undefined
      // AI modified: failed teardown remains internal cleanup state, never an adapter-visible active instance.
      this.onHlsInstanceChange(undefined)
    }
    if (this.pendingHlsCleanup === hls) {
      this.pendingHlsCleanup = undefined
    }
    try {
      hls?.destroy()
    }
    catch (error) {
      // AI modified: failed teardown remains owned so a later reload or disposal can retry before replacing it.
      this.pendingHlsCleanup = hls
      throw error
    }
  }

  private waitForMetadata(reloadGeneration: number, eventStartTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortController = new AbortController()
      const rejectMetadataWait = (error: GAudioError): void => {
        abortController.abort()
        if (this.rejectMetadataWait === rejectMetadataWait) {
          this.rejectMetadataWait = undefined
        }
        reject(error)
      }
      const finish = (event: Event): void => {
        // AI modified: a late old-media task cannot restore reload state while the replacement is HAVE_NOTHING.
        if (
          reloadGeneration !== this.reloadGeneration
          || !this.hasParsedCurrentManifest
          || !this.isMediaEventCurrent(event, eventStartTime)
          || !this.hasMediaMetadata()
        ) {
          return
        }
        abortController.abort()
        if (this.rejectMetadataWait === rejectMetadataWait) {
          this.rejectMetadataWait = undefined
        }
        resolve()
      }
      this.rejectMetadataWait = rejectMetadataWait
      this.audioElement.addEventListener('loadedmetadata', finish, {
        signal: abortController.signal,
      })
    })
  }

  private readonly handleManifestParsed = (_event: HlsEvents['MANIFEST_PARSED'], _payload: ManifestParsedData): void => {
    // AI modified: metadata is accepted only after the active hls.js instance parses its own manifest.
    this.hasParsedCurrentManifest = true
    // AI modified: hls.js runtime levels are the playable, filtered order used by every level index event.
    this.setPlayableVariants(this.hls?.levels ?? [])

    this.events.emit('manifestloaded', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: this.activeUrl ?? '',
      // AI modified: event consumers receive a snapshot isolated from the engine's selection metadata.
      variants: this.adaptiveVariants.map(variant => ({
        id: variant.id,
        bitrate: variant.bitrate,
        codecs: variant.codecs,
      })),
    })
  }

  private readonly handleLevelSwitched = (_event: HlsEvents['LEVEL_SWITCHED'], payload: LevelSwitchedData): void => {
    const hls = this.hls
    const reloadGeneration = this.reloadGeneration
    const variantId = this.variantIdsByLevelIndex[payload.level]
    if (variantId === undefined) {
      return
    }
    const variant = this.adaptiveVariants[payload.level]
    const isManualChange = this.pendingManualLevelIndex === payload.level
    const manualSelectionIntentId = this.manualSelectionIntentId
    this.events.emit('variantchange', {
      protocol: 'hls',
      implementation: 'hls.js',
      previousVariantId: this.previousVariantId,
      variantId,
      bitrate: variant?.bitrate,
      // AI modified: an explicitly requested first switch remains manual even without a previous variant.
      reason: isManualChange ? 'manual' : this.previousVariantId === undefined ? 'initial' : 'automatic',
    })
    if (hls !== this.hls || reloadGeneration !== this.reloadGeneration) {
      // AI modified: a listener-started reload owns the fresh variant history and manual selection state.
      return
    }
    this.previousVariantId = variantId
    if (isManualChange && manualSelectionIntentId === this.manualSelectionIntentId) {
      // AI modified: a listener's reentrant quality request owns its pending manual marker.
      this.pendingManualLevelIndex = undefined
    }
  }

  private readonly handleFragmentLoading = (_event: HlsEvents['FRAG_LOADING'], payload: FragLoadingData): void => {
    this.events.emit('segmentloadstart', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: payload.frag.url,
      variantId: this.variantIdsByLevelIndex[payload.frag.level],
      duration: payload.frag.duration,
    })
  }

  private readonly handleFragmentLoaded = (_event: HlsEvents['FRAG_LOADED'], payload: FragLoadedData): void => {
    this.events.emit('segmentloaded', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: payload.frag.url,
      variantId: this.variantIdsByLevelIndex[payload.frag.level],
      duration: payload.frag.duration,
    })
  }

  private readonly handleHlsError = (_event: HlsEvents['ERROR'], payload: ErrorData): void => {
    // AI modified: capture terminal fields before listeners can mutate the diagnostic vendor payload.
    const hls = this.hls
    const reloadGeneration = this.reloadGeneration
    const isFatal = payload.fatal
    const details = payload.details
    const streamError: AdaptiveStreamError = {
      protocol: 'hls',
      implementation: 'hls.js',
      category: this.errorCategory(payload),
      isFatal,
      code: details,
      cause: payload,
    }
    this.events.emit('streamerror', streamError)

    if (
      isFatal
      && hls === this.hls
      && reloadGeneration === this.reloadGeneration
    ) {
      // AI modified: an old fatal event cannot reject or label a reload started by its listener.
      const errorCode = this.fatalErrorCode(details)
      const error = new GAudioError(errorCode, `HLS playback failed: ${details}`, payload)
      this.events.emit('error', error)
      if (hls !== this.hls || reloadGeneration !== this.reloadGeneration) {
        // AI modified: an error listener's replacement owns its metadata wait and reload diagnostics.
        return
      }
      this.publishedReloadError = error
      this.publishedReloadErrorGeneration = this.reloadGeneration
      this.rejectMetadataWait?.(error)
      this.rejectActiveLoad(error)
    }
  }

  private errorCategory(payload: ErrorData): AdaptiveStreamError['category'] {
    if (isHlsManifestFailure(payload.details)) {
      return 'manifest'
    }
    if (isHlsSegmentFailure(payload.details)) {
      return 'segment'
    }
    if (this.hlsRuntime && payload.type === this.hlsRuntime.errorTypes.NETWORK_ERROR) {
      return 'network'
    }
    if (this.hlsRuntime && payload.type === this.hlsRuntime.errorTypes.MEDIA_ERROR) {
      return 'media'
    }
    return 'other'
  }

  private fatalErrorCode(details: ErrorDetails): GAudioErrorCode {
    if (isHlsManifestFailure(details)) {
      return 'MANIFEST_ERROR'
    }
    if (isHlsSegmentFailure(details)) {
      return 'SEGMENT_ERROR'
    }
    return 'ADAPTIVE_STREAM_ERROR'
  }

  private setPlayableVariants(levels: ManifestParsedData['levels']): void {
    const assignedVariantIds = new Set<string>()
    this.levelIndexesByVariantId.clear()
    this.variantIdsByLevelIndex = levels.map((level, levelIndex) => {
      const vendorVariantId = String(level.id)
      const variantId = assignedVariantIds.has(vendorVariantId)
        ? assignedVariantIds.has(String(levelIndex))
          ? `${vendorVariantId}:${levelIndex}`
          : String(levelIndex)
        : vendorVariantId
      assignedVariantIds.add(variantId)
      this.levelIndexesByVariantId.set(variantId, levelIndex)
      return variantId
    })
    this.adaptiveVariants = levels.map((level, levelIndex) => ({
      id: this.variantIdsByLevelIndex[levelIndex],
      bitrate: level.bitrate,
      codecs: level.audioCodec ?? level.codecSet,
    }))
  }

  private assertCurrentReload(reloadGeneration: number): void {
    if (reloadGeneration !== this.reloadGeneration) {
      throw this.reloadAbortedError()
    }
  }

  private reloadAbortedError(): GAudioError {
    return new GAudioError('LOAD_ABORTED', 'HLS configuration reload was superseded by a newer reload')
  }
}
