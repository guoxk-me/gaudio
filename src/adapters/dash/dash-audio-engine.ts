// @env browser

import type {
  ErrorEvent as DashErrorEvent,
  FragmentLoadingCompletedEvent,
  ManifestLoadedEvent,
  MediaPlayerClass,
  MediaPlayerEvents,
  MediaPlayerSettingClass,
  QualityChangeRenderedEvent,
  Representation,
} from 'dashjs'
import type { AdaptiveStreamError, GAudioErrorCode } from '../../types'
import { MediaElementAudioEngine } from '../../engine/media-element-audio-engine'
import { GAudioError } from '../../errors/errors'

interface DashAudioEngineOptions {
  settings: MediaPlayerSettingClass
  audioElement: HTMLAudioElement
  createDashPlayer: () => MediaPlayerClass
  events: MediaPlayerEvents
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

export class DashAudioEngine extends MediaElementAudioEngine {
  private readonly createDashPlayer: () => MediaPlayerClass
  private readonly dashEvents: MediaPlayerEvents
  private readonly onDashInstanceChange: (instance: MediaPlayerClass | undefined) => void
  private readonly onDispose: () => void
  private readonly settings: MediaPlayerSettingClass
  private dashPlayer?: MediaPlayerClass
  private activeUrl?: string

  constructor(options: DashAudioEngineOptions) {
    super(options.audioElement)
    this.settings = options.settings
    this.createDashPlayer = options.createDashPlayer
    this.dashEvents = options.events
    this.onDashInstanceChange = options.onDashInstanceChange
    this.onDispose = options.onDispose
  }

  updateSettings(settings: MediaPlayerSettingClass): void {
    this.dashPlayer?.updateSettings(settings)
  }

  override dispose(): void {
    super.dispose()
    this.onDispose()
  }

  protected override attachSourceUrl(url: string): void {
    this.activeUrl = url
    const dashPlayer = this.createDashPlayer()
    this.dashPlayer = dashPlayer
    this.onDashInstanceChange(dashPlayer)
    dashPlayer.on(this.dashEvents.MANIFEST_LOADED, this.handleManifestLoaded)
    dashPlayer.on(this.dashEvents.QUALITY_CHANGE_RENDERED, this.handleQualityChangeRendered)
    dashPlayer.on(this.dashEvents.FRAGMENT_LOADING_STARTED, this.handleFragmentLoadingStarted)
    dashPlayer.on(this.dashEvents.FRAGMENT_LOADING_COMPLETED, this.handleFragmentLoadingCompleted)
    dashPlayer.on(this.dashEvents.ERROR, this.handleDashError)
    dashPlayer.updateSettings(this.settings)
    dashPlayer.initialize(this.audioElement, url, false)
    this.events.emit('adaptivechange', {
      protocol: 'dash',
      implementation: 'dash.js',
    })
  }

  protected override detachSourceUrl(): void {
    this.activeUrl = undefined
    this.dashPlayer?.reset()
    this.dashPlayer = undefined
    this.onDashInstanceChange(undefined)
    super.detachSourceUrl()
  }

  private readonly handleManifestLoaded = (_payload: ManifestLoadedEvent): void => {
    const variants = this.dashPlayer?.getRepresentationsByType('audio') ?? []
    this.events.emit('manifestloaded', {
      protocol: 'dash',
      implementation: 'dash.js',
      url: this.activeUrl ?? '',
      variants: variants.map(representation => this.adaptiveVariant(representation)),
    })
  }

  private readonly handleQualityChangeRendered = (payload: QualityChangeRenderedEvent): void => {
    if (payload.mediaType !== 'audio') {
      return
    }

    this.events.emit('variantchange', {
      protocol: 'dash',
      implementation: 'dash.js',
      previousVariantId: payload.oldRepresentation?.id,
      variantId: payload.newRepresentation?.id,
      bitrate: payload.newRepresentation?.bandwidth,
      reason: payload.oldRepresentation ? 'automatic' : 'initial',
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
      variantId: payload.request.representationId,
      duration: payload.request.duration,
    })
  }

  private readonly handleFragmentLoadingCompleted = (payload: FragmentLoadingCompletedEvent): void => {
    if (payload.request.mediaType !== 'audio') {
      return
    }

    this.events.emit('segmentloaded', {
      protocol: 'dash',
      implementation: 'dash.js',
      url: payload.request.url ?? undefined,
      variantId: payload.request.representationId,
      duration: payload.request.duration,
    })
  }

  private readonly handleDashError = (payload: DashErrorEvent): void => {
    const category = this.errorCategory(payload)
    const isFatal = category !== 'segment' && category !== 'network'
    const streamError: AdaptiveStreamError = {
      protocol: 'dash',
      implementation: 'dash.js',
      category,
      isFatal,
      code: this.dashErrorCode(payload),
      cause: payload,
    }
    this.events.emit('streamerror', streamError)

    if (isFatal) {
      const errorCode = this.fatalErrorCode(category)
      this.events.emit('error', new GAudioError(errorCode, `DASH playback failed: ${streamError.code ?? 'unknown error'}`, payload))
    }
  }

  private adaptiveVariant(representation: Representation): { id: string, bitrate: number, codecs?: string } {
    return {
      id: representation.id,
      bitrate: representation.bandwidth,
      codecs: representation.codecs ?? undefined,
    }
  }

  private errorCategory(payload: DashErrorEvent): AdaptiveStreamError['category'] {
    if (payload.error === 'manifestError') {
      return 'manifest'
    }
    if (payload.error === 'download') {
      return payload.event.id.toLowerCase().includes('content') ? 'segment' : 'network'
    }
    if (typeof payload.error === 'object') {
      return 'media'
    }
    return 'other'
  }

  private dashErrorCode(payload: DashErrorEvent): string | undefined {
    if (typeof payload.error === 'object') {
      return String(payload.error.code)
    }
    if ('event' in payload && typeof payload.event === 'object' && payload.event && 'id' in payload.event) {
      return String(payload.event.id)
    }
    return payload.error
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
