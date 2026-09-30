// @env browser

import type { GAudioErrorCode } from '../../errors/errors'
import type {
  AdaptivePlaybackInfo,
  AdaptiveQualitySelection,
  AdaptiveStreamError,
  AdaptiveVariant,
} from '../adaptive-audio-types'
import type {
  DashErrorEvent,
  DashSettingsChanges,
  FragmentLoadingCompletedEvent,
  MediaPlayerClass,
  MediaPlayerErrors,
  MediaPlayerEvents,
  MediaPlayerSettingClass,
  QualityChangeRenderedEvent,
} from './dashjs-types'
import { MediaElementAudioEngine } from '../../engine/media-element-audio-engine'
import { GAudioError } from '../../errors/errors'
import { settingsWithChanges } from '../settings-with-changes'

interface DashAudioEngineOptions {
  settings: MediaPlayerSettingClass
  audioElement: HTMLAudioElement
  createDashPlayer: () => MediaPlayerClass
  events: MediaPlayerEvents
  errorCodes: DashErrorCodes
  onDashInstanceChange: (instance: MediaPlayerClass | undefined) => void
  onDispose: () => void
}

interface FragmentLoadingStartedEvent {
  request: {
    url: string | null
    representationId: string
    duration: number
    mediaType: string
  }
}

export type DashErrorCodes = Pick<
  MediaPlayerErrors,
  | 'DOWNLOAD_ERROR_ID_CONTENT_CODE'
  | 'DOWNLOAD_ERROR_ID_INITIALIZATION_CODE'
  | 'DOWNLOAD_ERROR_ID_MANIFEST_CODE'
  | 'DOWNLOAD_ERROR_ID_SIDX_CODE'
  | 'DOWNLOAD_ERROR_ID_XLINK_CODE'
  | 'FRAGMENT_LOADER_LOADING_FAILURE_ERROR_CODE'
  | 'FRAGMENT_LOADER_NULL_REQUEST_ERROR_CODE'
  | 'MANIFEST_ERROR_ID_MULTIPLEXED_CODE'
  | 'MANIFEST_ERROR_ID_NOSTREAMS_CODE'
  | 'MANIFEST_ERROR_ID_PARSE_CODE'
  | 'MANIFEST_LOADER_LOADING_FAILURE_ERROR_CODE'
  | 'MANIFEST_LOADER_PARSING_FAILURE_ERROR_CODE'
  | 'SEGMENT_BASE_LOADER_ERROR_CODE'
  | 'TIME_SYNC_FAILED_ERROR_CODE'
  | 'XLINK_LOADER_LOADING_FAILURE_ERROR_CODE'
>

export class DashAudioEngine extends MediaElementAudioEngine {
  private readonly createDashPlayer: () => MediaPlayerClass
  private readonly dashEvents: MediaPlayerEvents
  private readonly dashErrorCodes: DashErrorCodes
  private readonly onDashInstanceChange: (instance: MediaPlayerClass | undefined) => void
  private readonly onDispose: () => void
  private settings: MediaPlayerSettingClass
  private dashPlayer?: MediaPlayerClass
  private pendingDashCleanup?: MediaPlayerClass
  private activeUrl?: string
  private adaptiveVariants: AdaptiveVariant[] = []
  private readonly publicVariantIdsByVendorVariantId = new Map<string, string>()
  private readonly vendorVariantIdsByPublicVariantId = new Map<string, string>()
  private adaptiveQualitySelection: AdaptiveQualitySelection = 'auto'
  private pendingManualVariantId?: string
  private hasStartedDisposal = false
  private hasFinishedDisposal = false
  private hasCompletedDisposeCallback = false
  private activeDisposal?: Promise<void>

  constructor(options: DashAudioEngineOptions) {
    super(options.audioElement)
    this.settings = options.settings
    this.createDashPlayer = options.createDashPlayer
    this.dashEvents = options.events
    this.dashErrorCodes = options.errorCodes
    this.onDashInstanceChange = options.onDashInstanceChange
    this.onDispose = options.onDispose
  }

  updateSettings(settings: MediaPlayerSettingClass, settingChanges: DashSettingsChanges): void {
    // AI modified: a reused engine must apply the latest adapter settings to every future dash.js instance.
    this.settings = settings
    if (this.dashPlayer) {
      // AI modified: runtime ABR choices survive unrelated adapter settings while future loads retain their defaults.
      this.dashPlayer.updateSettings(settingsWithChanges(this.dashPlayer.getSettings(), settingChanges))
      this.followDashQualityMode()
    }
  }

  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    return this.activeUrl
      ? { protocol: 'dash', implementation: 'dash.js' }
      : undefined
  }

  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    // AI modified: public snapshots cannot mutate the representation metadata used for vendor selection.
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
    if (!this.dashPlayer) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Manual DASH quality selection requires active dash.js playback')
    }

    if (variantId === 'auto') {
      this.dashPlayer.updateSettings({
        streaming: {
          abr: {
            autoSwitchBitrate: {
              audio: true,
            },
          },
        },
      })
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualVariantId = undefined
      return
    }

    const isVariantAvailable = this.adaptiveVariants.some(variant => variant.id === variantId)
    const vendorVariantId = this.vendorVariantIdsByPublicVariantId.get(variantId)
    if (!isVariantAvailable || vendorVariantId === undefined) {
      throw new GAudioError('ADAPTIVE_STREAM_ERROR', `DASH variant ${variantId} is unavailable`)
    }

    // AI modified: wait for dash.js to render a manual request before publishing the completed quality change.
    this.dashPlayer.updateSettings({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            audio: false,
          },
        },
      },
    })
    const previousQualitySelection = this.adaptiveQualitySelection
    const previousManualVariantId = this.pendingManualVariantId
    this.pendingManualVariantId = variantId
    this.adaptiveQualitySelection = variantId
    try {
      // AI modified: public collision-safe identifiers map back to the original dash.js representation identifier.
      this.dashPlayer.setRepresentationForTypeById('audio', vendorVariantId, true)
    }
    catch (error) {
      this.pendingManualVariantId = previousManualVariantId
      this.adaptiveQualitySelection = previousQualitySelection
      try {
        // AI modified: a rejected vendor selection restores ABR mode and the public selection atomically.
        this.dashPlayer.updateSettings({
          streaming: {
            abr: {
              autoSwitchBitrate: {
                audio: previousQualitySelection === 'auto',
              },
            },
          },
        })
      }
      catch {
        // Preserve the vendor selection error that caused the failed operation.
      }
      throw error
    }
  }

  override dispose(): Promise<void> {
    if (this.hasFinishedDisposal) {
      return Promise.resolve()
    }
    if (this.activeDisposal) {
      return this.activeDisposal
    }

    const isRepeatedDisposal = this.hasStartedDisposal
    this.hasStartedDisposal = true
    const cleanupErrors: unknown[] = []

    if (isRepeatedDisposal || this.pendingDashCleanup) {
      try {
        // AI modified: vendor and base retries are independent so one failure cannot starve the other.
        this.resetDashInstance()
      }
      catch (error) {
        cleanupErrors.push(error)
      }
    }

    let baseDisposal = Promise.resolve()
    try {
      baseDisposal = super.dispose()
    }
    catch (error) {
      cleanupErrors.push(error)
    }
    if (!this.hasCompletedDisposeCallback) {
      try {
        this.onDispose()
        this.hasCompletedDisposeCallback = true
      }
      catch (error) {
        cleanupErrors.push(error)
      }
    }

    const cleanup = baseDisposal.catch((error: unknown) => {
      cleanupErrors.push(error)
    }).then(() => {
      if (cleanupErrors.length > 0) {
        throw cleanupErrors[0]
      }
      this.hasFinishedDisposal = true
    })
    // AI modified: vendor, browser, and adapter cleanup share one observable disposal attempt.
    const activeDisposal = cleanup.finally(() => {
      if (this.activeDisposal === activeDisposal) {
        this.activeDisposal = undefined
      }
    })
    this.activeDisposal = activeDisposal
    return activeDisposal
  }

  protected override attachSourceUrl(url: string): void {
    // AI modified: a failed teardown must finish before another vendor instance can be created.
    this.resetDashInstance()
    // AI modified: dash.js CMCD code expects an absolute URL even when callers pass app-relative paths.
    const playbackUrl = globalThis.location === undefined
      ? url
      : new URL(url, globalThis.location.href).href
    this.activeUrl = playbackUrl
    this.adaptiveVariants = []
    this.publicVariantIdsByVendorVariantId.clear()
    this.vendorVariantIdsByPublicVariantId.clear()
    this.adaptiveQualitySelection = 'auto'
    this.pendingManualVariantId = undefined
    const dashPlayer = this.createDashPlayer()
    this.dashPlayer = dashPlayer
    this.onDashInstanceChange(dashPlayer)
    let hasInitializedStream = false
    // AI modified: instance-bound listeners ignore queued events from a reset player after source replacement.
    dashPlayer.on(this.dashEvents.STREAM_INITIALIZED, () => {
      if (this.dashPlayer === dashPlayer) {
        hasInitializedStream = true
        this.refreshAdaptiveVariants()
      }
    })
    dashPlayer.on(this.dashEvents.STREAM_UPDATED, (payload) => {
      // AI modified: live MPD refreshes update only the active Period's public representations.
      if (
        this.dashPlayer === dashPlayer
        && hasInitializedStream
        && 'streamInfo' in payload
        && typeof payload.streamInfo === 'object'
        && payload.streamInfo !== null
        && 'id' in payload.streamInfo
        && payload.streamInfo.id === dashPlayer.getActiveStream()?.getStreamId()
      ) {
        this.refreshAdaptiveVariants()
      }
    })
    dashPlayer.on(this.dashEvents.QUALITY_CHANGE_RENDERED, (payload: QualityChangeRenderedEvent) => {
      if (this.dashPlayer === dashPlayer) {
        this.handleQualityChangeRendered(payload)
      }
    })
    dashPlayer.on(this.dashEvents.FRAGMENT_LOADING_STARTED, (payload: FragmentLoadingStartedEvent) => {
      if (this.dashPlayer === dashPlayer) {
        this.handleFragmentLoadingStarted(payload)
      }
    })
    dashPlayer.on(this.dashEvents.FRAGMENT_LOADING_COMPLETED, (payload: FragmentLoadingCompletedEvent) => {
      if (this.dashPlayer === dashPlayer) {
        this.handleFragmentLoadingCompleted(payload)
      }
    })
    dashPlayer.on(this.dashEvents.ERROR, (payload: DashErrorEvent) => {
      if (this.dashPlayer === dashPlayer) {
        this.handleDashError(payload)
      }
    })
    dashPlayer.updateSettings(this.settings)
    dashPlayer.initialize(this.audioElement, playbackUrl, false)
    // AI modified: a synchronous fatal vendor error can detach this player before initialize returns.
    if (this.dashPlayer === dashPlayer && this.activeUrl === playbackUrl) {
      this.events.emit('adaptivechange', {
        protocol: 'dash',
        implementation: 'dash.js',
      })
    }
  }

  protected override detachSourceUrl(): void {
    this.activeUrl = undefined
    this.adaptiveVariants = []
    this.publicVariantIdsByVendorVariantId.clear()
    this.vendorVariantIdsByPublicVariantId.clear()
    this.adaptiveQualitySelection = 'auto'
    this.pendingManualVariantId = undefined
    let firstDetachError: unknown
    let hasDetachError = false
    try {
      // AI modified: detachment attempts only the active instance; pending cleanup is retried by the next load or dispose.
      this.resetDashInstance(false)
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

  protected override isSourceMetadataCurrent(
    event: Event,
    expectedUrl: string,
    eventStartTime: number | undefined,
  ): boolean {
    const expectedPlaybackUrl = globalThis.location === undefined
      ? expectedUrl
      : new URL(expectedUrl, globalThis.location.href).href
    // AI modified: dash.js uses an internal URL, so ownership requires its current instance and ready replacement media.
    return this.isMediaEventCurrent(event, eventStartTime)
      && this.hasMediaMetadata()
      && this.dashPlayer !== undefined
      && this.activeUrl === expectedPlaybackUrl
  }

  private resetDashInstance(shouldRetryPendingCleanup = true): void {
    const dashPlayer = this.dashPlayer ?? (shouldRetryPendingCleanup ? this.pendingDashCleanup : undefined)
    if (!dashPlayer) {
      return
    }
    if (this.dashPlayer === dashPlayer) {
      this.dashPlayer = undefined
      // AI modified: failed teardown remains internal cleanup state, never an adapter-visible active instance.
      this.onDashInstanceChange(undefined)
    }
    if (this.pendingDashCleanup === dashPlayer) {
      this.pendingDashCleanup = undefined
    }
    try {
      if (dashPlayer) {
        this.resetDashPlayer(dashPlayer)
      }
    }
    catch (error) {
      // AI modified: failed teardown remains owned so a later load or disposal retries it before replacement.
      this.pendingDashCleanup = dashPlayer
      throw error
    }
  }

  private resetDashPlayer(dashPlayer: MediaPlayerClass): void {
    const ownSetMediaKeysDescriptor = Object.getOwnPropertyDescriptor(this.audioElement, 'setMediaKeys')
    const originalSetMediaKeys = this.audioElement.setMediaKeys
    // AI modified: dash.js 5.2 ignores Firefox's rejected setMediaKeys(null) teardown promise.
    const hasMediaKeysGuard = typeof originalSetMediaKeys === 'function' && Reflect.defineProperty(
      this.audioElement,
      'setMediaKeys',
      {
        configurable: true,
        value: (mediaKeys: MediaKeys | null): Promise<void> => (
          originalSetMediaKeys.call(this.audioElement, mediaKeys).catch(() => undefined)
        ),
      },
    )

    try {
      dashPlayer.reset()
    }
    finally {
      if (hasMediaKeysGuard) {
        if (ownSetMediaKeysDescriptor) {
          Reflect.defineProperty(this.audioElement, 'setMediaKeys', ownSetMediaKeysDescriptor)
        }
        else {
          Reflect.deleteProperty(this.audioElement, 'setMediaKeys')
        }
      }
    }
  }

  private refreshAdaptiveVariants(): void {
    const variants = this.dashPlayer?.getRepresentationsByType('audio') ?? []
    const unassignedVendorVariantIds = new Set(
      variants
        .map(representation => representation.id)
        .filter(vendorVariantId => !this.publicVariantIdsByVendorVariantId.has(vendorVariantId)),
    )
    const currentPublicVariantIds = new Set<string>()
    this.adaptiveVariants = variants.map((representation) => {
      const vendorVariantId = representation.id
      let publicVariantId = this.publicVariantIdsByVendorVariantId.get(vendorVariantId)
      if (publicVariantId === undefined) {
        publicVariantId = vendorVariantId
      }
      if (
        !this.publicVariantIdsByVendorVariantId.has(vendorVariantId)
        && (
          publicVariantId === 'auto'
          || this.vendorVariantIdsByPublicVariantId.has(publicVariantId)
        )
      ) {
        let collisionIndex = 0
        do {
          publicVariantId = `${vendorVariantId}:${collisionIndex}`
          collisionIndex += 1
        } while (
          publicVariantId === 'auto'
          || this.vendorVariantIdsByPublicVariantId.has(publicVariantId)
          || unassignedVendorVariantIds.has(publicVariantId)
        )
      }
      // AI modified: representation identities remain reserved for the full source lifecycle across manifest refreshes.
      this.publicVariantIdsByVendorVariantId.set(vendorVariantId, publicVariantId)
      this.vendorVariantIdsByPublicVariantId.set(publicVariantId, vendorVariantId)
      unassignedVendorVariantIds.delete(vendorVariantId)
      currentPublicVariantIds.add(publicVariantId)
      // AI modified: construct this one-time field mapping directly instead of hiding it behind a copy-only helper.
      return {
        id: publicVariantId,
        bitrate: representation.bandwidth,
        codecs: representation.codecs ?? undefined,
      }
    })
    if (
      this.adaptiveQualitySelection !== 'auto'
      && !currentPublicVariantIds.has(this.adaptiveQualitySelection)
    ) {
      // AI modified: a refreshed manifest cannot leave public state pinned to a representation that disappeared.
      this.dashPlayer?.updateSettings({
        streaming: {
          abr: {
            autoSwitchBitrate: {
              audio: true,
            },
          },
        },
      })
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualVariantId = undefined
    }
    this.followDashQualityMode()
    this.events.emit('manifestloaded', {
      protocol: 'dash',
      implementation: 'dash.js',
      url: this.activeUrl ?? '',
      // AI modified: event consumers receive a snapshot isolated from the engine's selection metadata.
      variants: this.getAdaptiveVariants(),
    })
  }

  private readonly handleQualityChangeRendered = (payload: QualityChangeRenderedEvent): void => {
    if (payload.mediaType !== 'audio') {
      return
    }

    this.followDashQualityMode()

    const variantId = this.publicVariantIdForVendorId(payload.newRepresentation?.id)
    const isManualSelection = variantId !== undefined && variantId === this.pendingManualVariantId
    if (isManualSelection) {
      this.pendingManualVariantId = undefined
    }

    this.events.emit('variantchange', {
      protocol: 'dash',
      implementation: 'dash.js',
      previousVariantId: this.publicVariantIdForVendorId(payload.oldRepresentation?.id),
      variantId,
      bitrate: payload.newRepresentation?.bandwidth,
      reason: isManualSelection
        ? 'manual'
        : payload.oldRepresentation
          ? 'automatic'
          : 'initial',
    })
  }

  private readonly handleFragmentLoadingStarted = (payload: FragmentLoadingStartedEvent): void => {
    if (payload.request.mediaType !== 'audio') {
      return
    }

    this.events.emit('segmentloadstart', {
      protocol: 'dash',
      implementation: 'dash.js',
      url: payload.request.url ?? undefined,
      variantId: this.publicVariantIdForVendorId(payload.request.representationId),
      duration: payload.request.duration,
    })
  }

  private readonly handleFragmentLoadingCompleted = (payload: FragmentLoadingCompletedEvent): void => {
    // AI modified: dash.js also completes failed requests; its declarations omit the runtime error field.
    if (payload.request.mediaType !== 'audio' || ('error' in payload && payload.error)) {
      return
    }

    this.events.emit('segmentloaded', {
      protocol: 'dash',
      implementation: 'dash.js',
      url: payload.request.url ?? undefined,
      variantId: this.publicVariantIdForVendorId(payload.request.representationId),
      duration: payload.request.duration,
    })
  }

  private readonly handleDashError = (payload: DashErrorEvent): void => {
    const dashPlayer = this.dashPlayer
    const category = this.errorCategory(payload)
    // AI modified: dash.js continues after UTC timing failures and falls back to MPD defaults after failed XLink downloads.
    const isRecoverable = typeof payload.error === 'object' && payload.error !== null
      ? payload.error.code === this.dashErrorCodes.TIME_SYNC_FAILED_ERROR_CODE
      || payload.error.code === this.dashErrorCodes.DOWNLOAD_ERROR_ID_XLINK_CODE
      : category === 'segment' || category === 'network'
    const isFatal = !isRecoverable
    const vendorErrorCode = this.dashErrorCode(payload)
    const streamError: AdaptiveStreamError = {
      protocol: 'dash',
      implementation: 'dash.js',
      category,
      isFatal,
      code: vendorErrorCode,
      cause: payload,
    }
    this.events.emit('streamerror', streamError)

    if (isFatal && dashPlayer === this.dashPlayer) {
      // AI modified: a stream listener's source replacement owns the next DASH load.
      const errorCode = this.fatalErrorCode(category)
      const error = new GAudioError(errorCode, `DASH playback failed: ${vendorErrorCode ?? 'unknown error'}`, payload)
      this.events.emit('error', error)
      if (dashPlayer !== this.dashPlayer) {
        // AI modified: an error listener's source replacement cannot be rejected by the old DASH player.
        return
      }
      this.rejectActiveLoad(error)
    }
  }

  private publicVariantIdForVendorId(vendorVariantId: string | undefined): string | undefined {
    if (vendorVariantId === undefined) {
      return undefined
    }
    return this.publicVariantIdsByVendorVariantId.get(vendorVariantId) ?? vendorVariantId
  }

  private followDashQualityMode(): void {
    const dashPlayer = this.dashPlayer
    if (!dashPlayer) {
      return
    }
    // AI modified: explicit ABR settings report the actual mode, including an initially fixed representation.
    if (dashPlayer.getSettings().streaming?.abr?.autoSwitchBitrate?.audio !== false) {
      this.adaptiveQualitySelection = 'auto'
      this.pendingManualVariantId = undefined
      return
    }
    if (this.adaptiveQualitySelection === 'auto' && this.adaptiveVariants.length > 0) {
      const currentRepresentation = dashPlayer.getCurrentRepresentationForType('audio')
      const variantId = this.publicVariantIdForVendorId(currentRepresentation?.id)
      if (variantId !== undefined && this.adaptiveVariants.some(variant => variant.id === variantId)) {
        this.adaptiveQualitySelection = variantId
      }
    }
  }

  private errorCategory(payload: DashErrorEvent): AdaptiveStreamError['category'] {
    if (payload.error === 'manifestError') {
      return 'manifest'
    }
    if (payload.error === 'download') {
      const downloadId = payload.event.id.toLowerCase()
      if (downloadId.includes('manifest')) {
        return 'manifest'
      }
      return downloadId.includes('content') || downloadId.includes('initialization')
        ? 'segment'
        : 'network'
    }
    if (typeof payload.error === 'object' && payload.error !== null) {
      if (this.isManifestErrorCode(payload.error.code)) {
        return 'manifest'
      }
      if (this.isSegmentErrorCode(payload.error.code)) {
        return 'segment'
      }
      return 'media'
    }
    return 'other'
  }

  private dashErrorCode(payload: DashErrorEvent): string | undefined {
    if (typeof payload.error === 'object' && payload.error !== null) {
      return String(payload.error.code)
    }
    if ('event' in payload && typeof payload.event === 'object' && payload.event && 'id' in payload.event) {
      return String(payload.event.id)
    }
    return payload.error
  }

  private isManifestErrorCode(errorCode: number): boolean {
    const codes = this.dashErrorCodes
    // AI modified: manifest and linked-manifest failures retain the stable MANIFEST_ERROR boundary.
    return errorCode === codes.MANIFEST_LOADER_PARSING_FAILURE_ERROR_CODE
      || errorCode === codes.MANIFEST_LOADER_LOADING_FAILURE_ERROR_CODE
      || errorCode === codes.XLINK_LOADER_LOADING_FAILURE_ERROR_CODE
      || errorCode === codes.DOWNLOAD_ERROR_ID_MANIFEST_CODE
      || errorCode === codes.DOWNLOAD_ERROR_ID_XLINK_CODE
      || errorCode === codes.MANIFEST_ERROR_ID_PARSE_CODE
      || errorCode === codes.MANIFEST_ERROR_ID_NOSTREAMS_CODE
      || errorCode === codes.MANIFEST_ERROR_ID_MULTIPLEXED_CODE
  }

  private isSegmentErrorCode(errorCode: number): boolean {
    const codes = this.dashErrorCodes
    // AI modified: fatal index, initialization, and media requests share the stable SEGMENT_ERROR boundary.
    return errorCode === codes.SEGMENT_BASE_LOADER_ERROR_CODE
      || errorCode === codes.FRAGMENT_LOADER_LOADING_FAILURE_ERROR_CODE
      || errorCode === codes.FRAGMENT_LOADER_NULL_REQUEST_ERROR_CODE
      || errorCode === codes.DOWNLOAD_ERROR_ID_SIDX_CODE
      || errorCode === codes.DOWNLOAD_ERROR_ID_CONTENT_CODE
      || errorCode === codes.DOWNLOAD_ERROR_ID_INITIALIZATION_CODE
  }

  private fatalErrorCode(category: AdaptiveStreamError['category']): GAudioErrorCode {
    if (category === 'manifest') {
      return 'MANIFEST_ERROR'
    }
    if (category === 'segment') {
      return 'SEGMENT_ERROR'
    }
    return 'ADAPTIVE_STREAM_ERROR'
  }
}
