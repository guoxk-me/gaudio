// @env browser

import type Hls from 'hls.js'
import type {
  ErrorData,
  ErrorDetails,
  FragLoadedData,
  FragLoadingData,
  HlsConfig,
  LevelSwitchedData,
  ManifestLoadedData,
} from 'hls.js'
import type { GAudioErrorCode } from '../../errors/errors'
import type {
  AdaptivePlaybackInfo,
  AdaptiveQualitySelection,
  AdaptiveStreamError,
  AdaptiveVariant,
} from '../adaptive-audio-types'
import { ErrorTypes, Events } from 'hls.js'
import { MediaElementAudioEngine } from '../../engine/media-element-audio-engine'
import { GAudioError } from '../../errors/errors'

export type HlsPlaybackImplementation = 'native' | 'hls.js'

interface HlsAudioEngineOptions {
  implementation: HlsPlaybackImplementation
  config: Partial<HlsConfig>
  audioElement: HTMLAudioElement
  createHls: (config: Partial<HlsConfig>) => Hls
  onHlsInstanceChange: (instance: Hls | undefined) => void
  onDispose: () => void
}

export interface HlsReloadOptions {
  restorePosition: boolean
  resumePlayback?: boolean
}

export class HlsAudioEngine extends MediaElementAudioEngine {
  private readonly implementation: HlsPlaybackImplementation
  private readonly createHls: (config: Partial<HlsConfig>) => Hls
  private readonly onHlsInstanceChange: (instance: Hls | undefined) => void
  private readonly onDispose: () => void
  private config: Partial<HlsConfig>
  private hls?: Hls
  private activeUrl?: string
  private previousVariantId?: string
  private adaptiveVariants: AdaptiveVariant[] = []
  private adaptiveQualitySelection: AdaptiveQualitySelection = 'auto'
  private rejectMetadataWait?: (error: GAudioError) => void
  private publishedReloadError?: GAudioError

  constructor(options: HlsAudioEngineOptions) {
    super(options.audioElement)
    this.implementation = options.implementation
    this.config = options.config
    this.createHls = options.createHls
    this.onHlsInstanceChange = options.onHlsInstanceChange
    this.onDispose = options.onDispose
  }

  async reload(config: Partial<HlsConfig>, options: HlsReloadOptions): Promise<void> {
    this.config = config
    if (this.implementation !== 'hls.js' || !this.activeUrl) {
      return
    }

    const currentTime = this.getCurrentTime()
    const shouldResume = options.resumePlayback ?? !this.isPaused()
    this.publishedReloadError = undefined

    try {
      const metadataReady = this.waitForMetadata()
      // AI modified: a reloaded hls.js instance starts a fresh manifest and variant lifecycle.
      this.previousVariantId = undefined
      this.adaptiveVariants = []
      this.adaptiveQualitySelection = 'auto'
      this.destroyHlsInstance()
      this.createHlsInstance(this.activeUrl)
      await metadataReady

      if (options.restorePosition && Number.isFinite(currentTime)) {
        await this.seek(currentTime)
      }
      if (shouldResume) {
        await this.play()
      }
    }
    catch (error) {
      const playerError = error instanceof GAudioError
        ? error
        : new GAudioError('ADAPTIVE_STREAM_ERROR', 'HLS configuration reload failed', error)
      if (playerError !== this.publishedReloadError) {
        this.events.emit('error', playerError)
      }
      this.publishedReloadError = undefined
      throw playerError
    }
  }

  override dispose(): void {
    super.dispose()
    this.onDispose()
  }

  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    return this.activeUrl
      ? { protocol: 'hls', implementation: this.implementation }
      : undefined
  }

  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    return this.adaptiveVariants
  }

  getAdaptiveQualitySelection(): AdaptiveQualitySelection {
    return this.adaptiveQualitySelection
  }

  async setAdaptiveQuality(variantId: AdaptiveQualitySelection): Promise<void> {
    if (this.implementation !== 'hls.js' || !this.hls) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Manual HLS quality selection requires hls.js playback')
    }

    if (variantId === 'auto') {
      this.hls.loadLevel = -1
      this.adaptiveQualitySelection = 'auto'
      return
    }

    const levelIndex = this.adaptiveVariants.findIndex(variant => variant.id === variantId)
    if (levelIndex < 0) {
      throw new GAudioError('ADAPTIVE_STREAM_ERROR', `HLS variant ${variantId} is unavailable`)
    }

    const selectedVariant = this.adaptiveVariants[levelIndex]
    // AI modified: use the next segment switch path so manual selection does not interrupt current audio.
    this.hls.nextLevel = levelIndex
    this.adaptiveQualitySelection = variantId
    this.events.emit('variantchange', {
      protocol: 'hls',
      implementation: 'hls.js',
      previousVariantId: this.previousVariantId,
      variantId,
      bitrate: selectedVariant.bitrate,
      reason: 'manual',
    })
    this.previousVariantId = variantId
  }

  protected override attachSourceUrl(url: string): void {
    this.activeUrl = url
    this.previousVariantId = undefined
    this.adaptiveVariants = []
    this.adaptiveQualitySelection = 'auto'

    if (this.implementation === 'native') {
      super.attachSourceUrl(url)
    }
    else {
      this.createHlsInstance(url)
    }

    this.events.emit('adaptivechange', {
      protocol: 'hls',
      implementation: this.implementation,
    })
  }

  protected override detachSourceUrl(): void {
    this.rejectMetadataWait?.(new GAudioError('LOAD_ABORTED', 'HLS reload was interrupted by source removal'))
    this.activeUrl = undefined
    this.previousVariantId = undefined
    this.adaptiveVariants = []
    this.adaptiveQualitySelection = 'auto'
    this.destroyHlsInstance()
    super.detachSourceUrl()
  }

  private createHlsInstance(url: string): void {
    const hls = this.createHls(this.config)
    this.hls = hls
    this.onHlsInstanceChange(hls)
    hls.on(Events.MANIFEST_LOADED, this.handleManifestLoaded)
    hls.on(Events.LEVEL_SWITCHED, this.handleLevelSwitched)
    hls.on(Events.FRAG_LOADING, this.handleFragmentLoading)
    hls.on(Events.FRAG_LOADED, this.handleFragmentLoaded)
    hls.on(Events.ERROR, this.handleHlsError)
    hls.attachMedia(this.audioElement)
    hls.loadSource(url)
  }

  private destroyHlsInstance(): void {
    this.hls?.destroy()
    this.hls = undefined
    this.onHlsInstanceChange(undefined)
  }

  private waitForMetadata(): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortController = new AbortController()
      const finish = (): void => {
        abortController.abort()
        this.rejectMetadataWait = undefined
        resolve()
      }
      const fail = (): void => {
        abortController.abort()
        this.rejectMetadataWait = undefined
        reject(new GAudioError('ADAPTIVE_STREAM_ERROR', 'HLS media metadata could not be restored'))
      }
      this.rejectMetadataWait = (error): void => {
        abortController.abort()
        this.rejectMetadataWait = undefined
        reject(error)
      }
      this.audioElement.addEventListener('loadedmetadata', finish, {
        once: true,
        signal: abortController.signal,
      })
      this.audioElement.addEventListener('error', fail, {
        once: true,
        signal: abortController.signal,
      })
    })
  }

  private readonly handleManifestLoaded = (_event: Events.MANIFEST_LOADED, payload: ManifestLoadedData): void => {
    this.adaptiveVariants = payload.levels.map((level, index) => ({
      id: String(level.id ?? index),
      bitrate: level.bitrate,
      codecs: level.audioCodec ?? level.videoCodec,
    }))

    this.events.emit('manifestloaded', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: payload.url,
      variants: this.adaptiveVariants,
    })
  }

  private readonly handleLevelSwitched = (_event: Events.LEVEL_SWITCHED, payload: LevelSwitchedData): void => {
    const variantId = String(payload.level)
    const level = this.hls?.levels[payload.level]
    this.events.emit('variantchange', {
      protocol: 'hls',
      implementation: 'hls.js',
      previousVariantId: this.previousVariantId,
      variantId,
      bitrate: level?.bitrate,
      reason: this.previousVariantId === undefined ? 'initial' : 'automatic',
    })
    this.previousVariantId = variantId
  }

  private readonly handleFragmentLoading = (_event: Events.FRAG_LOADING, payload: FragLoadingData): void => {
    this.events.emit('segmentloadstart', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: payload.frag.url,
      variantId: String(payload.frag.level),
      duration: payload.frag.duration,
    })
  }

  private readonly handleFragmentLoaded = (_event: Events.FRAG_LOADED, payload: FragLoadedData): void => {
    this.events.emit('segmentloaded', {
      protocol: 'hls',
      implementation: 'hls.js',
      url: payload.frag.url,
      variantId: String(payload.frag.level),
      duration: payload.frag.duration,
    })
  }

  private readonly handleHlsError = (_event: Events.ERROR, payload: ErrorData): void => {
    const streamError: AdaptiveStreamError = {
      protocol: 'hls',
      implementation: 'hls.js',
      category: this.errorCategory(payload),
      isFatal: payload.fatal,
      code: payload.details,
      cause: payload,
    }
    this.events.emit('streamerror', streamError)

    if (payload.fatal) {
      const errorCode = this.fatalErrorCode(payload.details)
      const error = new GAudioError(errorCode, `HLS playback failed: ${payload.details}`, payload)
      this.events.emit('error', error)
      this.publishedReloadError = error
      this.rejectMetadataWait?.(error)
      this.rejectActiveLoad(error)
    }
  }

  private errorCategory(payload: ErrorData): AdaptiveStreamError['category'] {
    if (payload.details.includes('manifest')) {
      return 'manifest'
    }
    if (payload.details.includes('frag')) {
      return 'segment'
    }
    if (payload.type === ErrorTypes.NETWORK_ERROR) {
      return 'network'
    }
    if (payload.type === ErrorTypes.MEDIA_ERROR) {
      return 'media'
    }
    return 'other'
  }

  private fatalErrorCode(details: ErrorDetails): GAudioErrorCode {
    if (details.includes('manifest')) {
      return 'MANIFEST_ERROR'
    }
    if (details.includes('frag')) {
      return 'SEGMENT_ERROR'
    }
    return 'ADAPTIVE_STREAM_ERROR'
  }
}
