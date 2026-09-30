import type { AdaptivePlaybackInfo, AdaptiveQualitySelection, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioEngine, AudioEngineEvents } from '../engine/audio-engine'
import type { AudioEngineLoadOptions, AudioFormatSupport, PreloadMode, TimeRange } from '../engine/audio-engine-types'
import type { EngineOperationGate } from '../engine/engine-operation-gate'
import type { AudioSource, AudioSourceInput } from '../source/audio-source'
import type { AudioPlayerEvents } from './audio-player-events'
import type { AudioPlayerAnalyzerOptions, AudioPlayerOptions, PlaybackState } from './audio-player-options'
import type { AudioPlaylistNavigationOptions, AudioPlaylistOptions, AudioPlaylistTrack, AudioTrack, AudioTrackSelectionOptions } from './audio-playlist'
import type { AudioMediaSessionMetadata, AudioMediaSessionOptions } from './browser-media-session'
import { audioEngineEventNames } from '../engine/audio-engine'
import { AudioEngineRouter } from '../engine/audio-engine-router'
import { createEngineOperationGate, observeEngineOperation } from '../engine/engine-operation-gate'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { HttpAudioSource } from '../source/http-audio-source'
import { BrowserMediaSession } from './browser-media-session'

const defaultAnalyzerFftSize = 2048

interface ActiveLoadPlaybackIntent {
  loadRequestId: number
  playbackIntentId: number
  positionIntentId: number
  shouldPlay: boolean
  terminalError?: GAudioError
}

interface ActivePlaybackAttempt {
  loadRequestId: number
  gate: EngineOperationGate
  terminalError?: GAudioError
}

interface ActivePlayerEngineOperation {
  loadRequestId: number
  gate: EngineOperationGate
  terminalError?: GAudioError
}

interface ActivePendingStopAttempt {
  terminalError?: GAudioError
}

/**
 * High-level controller for loading, playing, observing, and switching audio sources.
 *
 * Direct operations delegated to an injected custom engine preserve the engine's original
 * thrown or rejected value when it settles first, and that value alone is not published as a
 * player `error` event. Lifecycle-owned termination uses {@link GAudioError}: superseded work
 * rejects with `LOAD_ABORTED`, disposal rejects with `ENGINE_ERROR`, and a fatal engine `error`
 * rejects current work with the same error instance that player listeners receive.
 *
 * Extend playback through an injected {@link AudioEngine}, adapters, sources, analyzer factories,
 * and event composition. Subclassing `AudioPlayer` is not a supported compatibility contract.
 */
export class AudioPlayer {
  private readonly events = new EventEmitter<AudioPlayerEvents>()
  private readonly engine: AudioEngine
  private readonly removeEngineListeners: Array<() => void> = []
  private readonly analyzerOptions?: AudioPlayerAnalyzerOptions
  private readonly sourceLoadOptions?: AudioEngineLoadOptions
  private readonly mediaSession?: BrowserMediaSession
  private analyzer?: AudioAnalyzer
  private mediaSessionMetadata?: AudioMediaSessionMetadata
  private source?: AudioSource
  private playlist: readonly AudioPlaylistTrack[] = []
  private playlistIndex = -1
  private selectedAudioTrackId?: string
  private state: PlaybackState = 'idle'
  private loadRequestId = 0
  private playbackIntentId = 0
  private positionIntentId = 0
  private positionResetIntentId = 0
  private activeLoadRequestId?: number
  private activeLoadError?: GAudioError
  private activeLoadPlaybackIntent?: ActiveLoadPlaybackIntent
  private activeLoadCompletion?: Promise<void>
  private activeLoadEngineOperation?: ActivePlayerEngineOperation
  private readonly activePlaybackAttempts = new Set<ActivePlaybackAttempt>()
  private activePositionOperation?: ActivePlayerEngineOperation
  private activeAdaptiveOperation?: ActivePlayerEngineOperation
  private activePendingStopAttempt?: ActivePendingStopAttempt
  private hasLoadedSource = false
  private isDisposed = false
  private hasPendingEngineDisposal = false
  private hasPendingMediaSessionDisposal = false
  private activeDisposal: Promise<void> | undefined
  private terminalErrorGeneration = 0
  private errorPublicationSequence = 0
  private readonly errorPublicationSequences = new WeakMap<GAudioError, number>()
  private requestedPlayback: 'play' | 'pause' | 'stop' = 'pause'
  private preloadMode: PreloadMode = 'metadata'
  private preloadIntentId = 0
  private shouldAutoplay: boolean
  private outputVolume = 1
  private isOutputMuted = false
  private isPlaybackLooping = false
  private playbackRate = 1
  private shouldPreservePitch = true

  /**
   * Creates an audio player.
   *
   * @param options Initial source, playback settings, and adaptive adapters.
   * @param engine Optional custom engine. It cannot be combined with `options.adapters`.
   * @throws {TypeError} When a custom engine and adapters are combined or the CORS mode is invalid.
   * @throws {RangeError} When the initial volume or playback rate is invalid.
   * @throws The original error when setup or event subscription on an injected custom engine fails.
   */
  constructor(options: AudioPlayerOptions = {}, engine?: AudioEngine) {
    if (engine && options.adapters?.length) {
      throw new TypeError('AudioPlayer cannot combine adapters with an explicit custom engine')
    }

    // AI modified: the router owns protocol engines only when callers do not inject a custom engine.
    this.engine = engine ?? new AudioEngineRouter({ adapters: options.adapters })
    this.analyzerOptions = this.playerAnalyzerOptions(options.analyzer)
    this.mediaSessionMetadata = typeof options.mediaSession === 'object' && options.mediaSession.metadata
      ? {
          title: options.mediaSession.metadata.title,
          artist: options.mediaSession.metadata.artist,
          album: options.mediaSession.metadata.album,
          artwork: options.mediaSession.metadata.artwork?.map(artwork => ({
            src: artwork.src,
            sizes: artwork.sizes,
            type: artwork.type,
          })),
        }
      : undefined
    this.shouldAutoplay = options.autoplay ?? false

    try {
      const configuredCrossOrigin = options.crossOrigin
      if (
        configuredCrossOrigin !== undefined
        && configuredCrossOrigin !== 'anonymous'
        && configuredCrossOrigin !== 'use-credentials'
      ) {
        throw new TypeError('crossOrigin must be anonymous or use-credentials')
      }
      // AI modified: owned Web Audio analysis needs CORS-enabled media; custom integrations retain their request policy.
      const shouldUseBuiltInAnalysis = !engine
        && this.analyzerOptions !== undefined
        && this.analyzerOptions.createAnalyzer === undefined
      const crossOrigin = configuredCrossOrigin ?? (shouldUseBuiltInAnalysis ? 'anonymous' : undefined)
      this.sourceLoadOptions = crossOrigin === undefined ? undefined : { crossOrigin }

      // AI modified: an empty URL string follows the same source semantics as setSource('').
      if (options.source !== undefined) {
        this.source = this.audioSourceForInput(options.source)
      }

      this.setPreload(options.preload ?? 'metadata')
      // AI modified: disable engine-native autoplay so load() owns the observable playback attempt.
      this.engine.setAutoplay?.(false)
      this.setMuted(options.muted ?? false)
      this.setLoop(options.loop ?? false)
      this.setVolume(options.volume ?? 1)
      this.setPlaybackRate(options.playbackRate ?? 1)
      this.setPreservesPitch(options.preservesPitch ?? true)

      // AI modified: derive public state from engine lifecycle events instead of method calls.
      this.connectEngineEvents()
      // AI modified: opt-in Media Session support lets system controls call the stable AudioPlayer API.
      this.mediaSession = this.createMediaSession(options.mediaSession)
      this.mediaSession?.setPlaybackState(this.state)
      this.updateMediaSessionMetadata()
      this.updateMediaSessionPosition()
    }
    catch (error) {
      // AI modified: any subscription whose rollback fails must remain inert after construction aborts.
      this.isDisposed = true
      // AI modified: failed construction releases every listener and owner installed before the failure.
      try {
        this.mediaSession?.dispose()
      }
      catch {
        // Preserve the construction failure that explains why the player was not created.
      }
      try {
        this.disconnectEngineEvents()
      }
      catch {
        // Preserve the construction failure that explains why the player was not created.
      }
      if (!engine) {
        try {
          void this.engine.dispose().catch(() => {
            // Preserve the construction failure that explains why the player was not created.
          })
        }
        catch {
          // Preserve the construction failure that explains why the player was not created.
        }
      }
      throw error
    }
  }

  /**
   * Exposes the lifecycle value applications use to render loading and playback state.
   *
   * @returns The current public playback lifecycle state.
   */
  getState(): PlaybackState {
    return this.state
  }

  /**
   * Inspects the source currently owned by the player without opening it again.
   *
   * @returns The current configured source, or `undefined` when none is configured.
   */
  getSource(): AudioSource | undefined {
    return this.source
  }

  /**
   * Provides a readonly queue snapshot for application playlist interfaces.
   *
   * @returns The current playlist tracks.
   */
  getPlaylist(): readonly AudioPlaylistTrack[] {
    // AI modified: queue snapshots cannot mutate the source, fallback, metadata, or audio-track catalog owned by the player.
    return this.playlist.map(track => ({
      source: typeof track.source === 'object' && !('open' in track.source)
        ? {
            url: track.source.url,
            protocol: track.source.protocol,
            mimeType: track.source.mimeType,
          }
        : track.source,
      fallbackSources: track.fallbackSources?.map(fallbackSource => (
        typeof fallbackSource === 'object' && !('open' in fallbackSource)
          ? {
              url: fallbackSource.url,
              protocol: fallbackSource.protocol,
              mimeType: fallbackSource.mimeType,
            }
          : fallbackSource
      )),
      metadata: track.metadata
        ? {
            title: track.metadata.title,
            artist: track.metadata.artist,
            album: track.metadata.album,
            artwork: track.metadata.artwork?.map(artwork => ({
              src: artwork.src,
              sizes: artwork.sizes,
              type: artwork.type,
            })),
          }
        : undefined,
      audioTracks: track.audioTracks?.map(audioTrack => ({
        id: audioTrack.id,
        label: audioTrack.label,
        language: audioTrack.language,
        source: typeof audioTrack.source === 'object' && !('open' in audioTrack.source)
          ? {
              url: audioTrack.source.url,
              protocol: audioTrack.source.protocol,
              mimeType: audioTrack.source.mimeType,
            }
          : audioTrack.source,
        fallbackSources: audioTrack.fallbackSources?.map(fallbackSource => (
          typeof fallbackSource === 'object' && !('open' in fallbackSource)
            ? {
                url: fallbackSource.url,
                protocol: fallbackSource.protocol,
                mimeType: fallbackSource.mimeType,
              }
            : fallbackSource
        )),
      })),
      defaultAudioTrackId: track.defaultAudioTrackId,
    }))
  }

  /**
   * Identifies which queue entry supplies the active source.
   *
   * @returns The selected playlist index, or `-1` when no playlist is active.
   */
  getPlaylistIndex(): number {
    return this.playlistIndex
  }

  /**
   * Lists alternate language or companion audio choices on the active queue entry.
   *
   * @returns Audio tracks available for the selected playlist track.
   */
  getAudioTracks(): readonly AudioTrack[] {
    return this.activePlaylistTrack()?.audioTracks?.map(audioTrack => ({
      id: audioTrack.id,
      label: audioTrack.label,
      language: audioTrack.language,
      source: typeof audioTrack.source === 'object' && !('open' in audioTrack.source)
        ? {
            url: audioTrack.source.url,
            protocol: audioTrack.source.protocol,
            mimeType: audioTrack.source.mimeType,
          }
        : audioTrack.source,
      fallbackSources: audioTrack.fallbackSources?.map(fallbackSource => (
        typeof fallbackSource === 'object' && !('open' in fallbackSource)
          ? {
              url: fallbackSource.url,
              protocol: fallbackSource.protocol,
              mimeType: fallbackSource.mimeType,
            }
          : fallbackSource
      )),
    })) ?? []
  }

  /**
   * Identifies the alternate audio choice currently supplying playback.
   *
   * @returns The selected alternate audio track, or `undefined` when none is active.
   */
  getSelectedAudioTrack(): AudioTrack | undefined {
    const selectedAudioTrackId = this.selectedAudioTrackId
    if (selectedAudioTrackId === undefined) {
      return undefined
    }

    return this.getAudioTracks().find(audioTrack => audioTrack.id === selectedAudioTrackId)
  }

  /**
   * Reports the timeline position used by progress displays and resume persistence.
   *
   * @returns The current playback position in seconds.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getCurrentTime(): number {
    return this.isDisposed ? 0 : this.engine.getCurrentTime()
  }

  /**
   * Reports the known timeline length for progress and seek interfaces.
   *
   * @returns The media duration in seconds, or `0` when it is not known.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getDuration(): number {
    return this.isDisposed ? 0 : this.engine.getDuration()
  }

  /**
   * Reveals how aggressively the browser is asked to fetch the active source.
   *
   * @returns The engine's browser preload hint, or the configured hint when the engine omits this query.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getPreload(): PreloadMode {
    return this.isDisposed ? this.preloadMode : this.engine.getPreload?.() ?? this.preloadMode
  }

  /**
   * Changes the browser preload hint for current and future sources.
   * Engines without browser-fetch controls retain the hint as player configuration.
   *
   * @param preload Amount of media data the browser should preload.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setPreload(preload: PreloadMode): void {
    this.assertUsable()
    const preloadIntentId = ++this.preloadIntentId
    this.engine.setPreload?.(preload)
    // AI modified: without an engine getter, only the latest successful request may commit its retained hint.
    if (!this.isDisposed && preloadIntentId === this.preloadIntentId) {
      const effectivePreload = this.engine.getPreload?.() ?? preload
      if (!this.isDisposed && preloadIntentId === this.preloadIntentId) {
        this.preloadMode = effectivePreload
      }
    }
  }

  /**
   * Reveals whether successful future loads will also request playback.
   *
   * @returns Whether future calls to {@link load} should attempt playback automatically.
   */
  getAutoplay(): boolean {
    return this.shouldAutoplay
  }

  /**
   * Controls whether future loads attempt playback after becoming ready.
   *
   * @param shouldAutoplay `true` to make {@link load} call {@link play} after loading.
   */
  setAutoplay(shouldAutoplay: boolean): void {
    this.assertUsable()
    // AI modified: player-managed autoplay keeps browser policy failures observable through load().
    this.shouldAutoplay = shouldAutoplay
  }

  /**
   * Reports configured output gain independently from the mute switch.
   *
   * @returns Linear output volume between `0` and `1`.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getVolume(): number {
    return this.isDisposed ? this.outputVolume : this.engine.getVolume()
  }

  /**
   * Sets linear output volume.
   *
   * @param volume Volume between `0` and `1`.
   * @throws {RangeError} When `volume` is not finite or is outside `0` through `1`.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setVolume(volume: number): void {
    this.assertUsable()
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new RangeError('Volume must be a finite number between 0 and 1')
    }
    this.engine.setVolume(volume)
    // AI modified: synchronous listener re-entry may leave a newer engine value than this call requested.
    if (!this.isDisposed) {
      this.outputVolume = this.engine.getVolume()
    }
  }

  /**
   * Reports whether output is suppressed without treating zero volume as mute.
   *
   * @returns Whether audio output is muted.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  isMuted(): boolean {
    return this.isDisposed ? this.isOutputMuted : this.engine.isMuted()
  }

  /**
   * Enables or disables muted output.
   *
   * @param isMuted `true` to suppress audio output without changing volume.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setMuted(isMuted: boolean): void {
    this.assertUsable()
    this.engine.setMuted(isMuted)
    // AI modified: snapshot the effective value after any synchronous nested mute request completes.
    if (!this.isDisposed) {
      this.isOutputMuted = this.engine.isMuted()
    }
  }

  /**
   * Reports whether the active source will restart instead of remaining ended.
   *
   * @returns Whether playback restarts automatically after reaching the end.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  isLooping(): boolean {
    return this.isDisposed ? this.isPlaybackLooping : this.engine.isLooping()
  }

  /**
   * Enables or disables playback looping.
   *
   * @param isLooping `true` to restart playback after the source ends.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setLoop(isLooping: boolean): void {
    this.assertUsable()
    this.engine.setLoop(isLooping)
    // AI modified: preserve the final loop mode when a synchronous callback issues a newer request.
    if (!this.isDisposed) {
      this.isPlaybackLooping = this.engine.isLooping()
    }
  }

  /**
   * Reports timeline speed for controls, Media Session, and persisted preferences.
   *
   * @returns The playback speed multiplier, where `1` is normal speed.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getPlaybackRate(): number {
    return this.isDisposed ? this.playbackRate : this.engine.getPlaybackRate()
  }

  /**
   * Sets the playback speed multiplier.
   *
   * @param rate Finite multiplier greater than `0`.
   * @throws {RangeError} When `rate` is not finite or is not greater than `0`.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setPlaybackRate(rate: number): void {
    this.assertUsable()
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError('Playback rate must be a finite number greater than 0')
    }
    this.engine.setPlaybackRate(rate)
    // AI modified: preserve the final engine rate when a ratechange listener issues a newer request.
    if (!this.isDisposed) {
      this.playbackRate = this.engine.getPlaybackRate()
      this.updateMediaSessionPosition()
    }
  }

  /**
   * Reports whether rate changes retain natural vocal and musical pitch.
   *
   * @returns Whether pitch remains stable when playback speed changes.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getPreservesPitch(): boolean {
    return this.isDisposed ? this.shouldPreservePitch : this.engine.getPreservesPitch()
  }

  /**
   * Controls pitch preservation during playback-rate changes.
   *
   * @param shouldPreservePitch `true` to preserve the original audio pitch.
   * @throws The original error when the corresponding operation on an injected custom engine fails.
   */
  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.assertUsable()
    this.engine.setPreservesPitch(shouldPreservePitch)
    // AI modified: preserve the final pitch mode when a synchronous callback issues a newer request.
    if (!this.isDisposed) {
      this.shouldPreservePitch = this.engine.getPreservesPitch()
    }
  }

  /**
   * Exposes the engine's immediate paused flag independently from public lifecycle transitions.
   *
   * @returns Whether the underlying media engine is currently paused.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  isPaused(): boolean {
    return this.isDisposed || this.engine.isPaused()
  }

  /**
   * Indicates whether queue continuation or an ended interface can run for the source.
   *
   * @returns Whether playback has reached the end of the current source.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  isEnded(): boolean {
    return this.isDisposed ? false : this.engine.isEnded()
  }

  /**
   * Indicates whether timeline controls should present a pending position change.
   *
   * @returns Whether a seek operation is currently in progress.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  isSeeking(): boolean {
    return this.isDisposed ? false : this.engine.isSeeking()
  }

  /**
   * Provides downloaded timeline ranges for buffer visualization and diagnostics.
   *
   * @returns Buffered media ranges in seconds.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getBufferedRanges(): readonly TimeRange[] {
    if (this.isDisposed) {
      return []
    }
    return this.engine.getBufferedRanges().map(range => ({
      start: range.start,
      end: range.end,
    }))
  }

  /**
   * Provides the timeline windows a seek interface can target for the active source.
   *
   * @returns Seekable media ranges, or an empty array when the engine does not expose them.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getSeekableRanges(): readonly TimeRange[] {
    if (this.isDisposed) {
      return []
    }
    return this.engine.getSeekableRanges?.().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  /**
   * Provides consumed timeline ranges for progress history and completion analytics.
   *
   * @returns Played media ranges, or an empty array when the engine does not expose them.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getPlayedRanges(): readonly TimeRange[] {
    if (this.isDisposed) {
      return []
    }
    return this.engine.getPlayedRanges?.().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  /**
   * Checks browser support for an audio MIME type.
   *
   * Registered adaptive adapters contribute their synchronous browser-capability
   * probes. This query does not verify that an optional vendor peer can be imported later.
   *
   * @param mimeType MIME type with optional codec parameters.
   * @returns `''`, `'maybe'`, or `'probably'`; an omitted engine capability query returns `''`.
   * @throws The original error when the capability query on an injected custom engine fails.
   */
  canPlayType(mimeType: string): AudioFormatSupport {
    return this.isDisposed ? '' : this.engine.canPlayType?.(mimeType) ?? ''
  }

  /**
   * Returns the analyzer created for the loaded source, when enabled and supported.
   *
   * The analyzer is created after a successful {@link load}. Custom engines can support this by exposing
   * `createAnalyzer`, or callers can provide `options.analyzer.createAnalyzer`.
   */
  getAnalyzer(): AudioAnalyzer | undefined {
    return this.analyzer
  }

  /**
   * Inspects the fallback metadata exposed to browser and operating-system media controls.
   *
   * @returns Default Media Session metadata used when the active playlist track does not provide metadata.
   */
  getMediaSessionMetadata(): AudioMediaSessionMetadata | undefined {
    const metadata = this.mediaSessionMetadata
    // AI modified: metadata inspection cannot silently alter later Media Session presentation.
    return metadata
      ? {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          artwork: metadata.artwork?.map(artwork => ({
            src: artwork.src,
            sizes: artwork.sizes,
            type: artwork.type,
          })),
        }
      : undefined
  }

  /**
   * Updates default Media Session metadata for direct sources and playlist tracks without their own metadata.
   *
   * @param metadata Metadata shown by browser and operating-system media controls.
   */
  setMediaSessionMetadata(metadata: AudioMediaSessionMetadata | undefined): void {
    this.assertUsable()
    this.mediaSessionMetadata = metadata
      ? {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          artwork: metadata.artwork?.map(artwork => ({
            src: artwork.src,
            sizes: artwork.sizes,
            type: artwork.type,
          })),
        }
      : undefined
    this.updateMediaSessionMetadata()
  }

  /**
   * Gives this player browser Media Session controls without starting playback.
   *
   * A later playing or explicitly activated player can take ownership again.
   * Calling this method is a no-op when Media Session integration is disabled or unavailable.
   *
   * @throws The original browser Media Session error when ownership presentation cannot be restored.
   */
  activateMediaSession(): void {
    this.assertUsable()
    this.mediaSession?.activate()
  }

  /**
   * Identifies the protocol and runtime currently serving a manifest source.
   *
   * @returns Active adaptive playback implementation details, when an adaptive source is loaded.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    const adaptivePlayback = this.isDisposed ? undefined : this.engine.getActiveAdaptivePlayback?.()
    // AI modified: custom engines cannot expose mutable adaptive identity through the high-level query boundary.
    return adaptivePlayback
      ? {
          protocol: adaptivePlayback.protocol,
          implementation: adaptivePlayback.implementation,
        }
      : undefined
  }

  /**
   * Lists manifest qualities available to telemetry and manual selection interfaces.
   *
   * @returns Variants discovered for the active adaptive source.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    if (this.isDisposed) {
      return []
    }
    const variants = this.engine.getAdaptiveVariants?.() ?? []
    // AI modified: custom engines cannot expose mutable variant state through the high-level player API.
    return variants.map(variant => ({
      id: variant.id,
      bitrate: variant.bitrate,
      codecs: variant.codecs,
    }))
  }

  /**
   * Reports whether adaptive quality is automatic or pinned to a manifest variant.
   *
   * @returns `'auto'` for automatic ABR or the selected variant identifier.
   * @throws The original error when the corresponding query on an injected custom engine fails.
   */
  getAdaptiveQualitySelection(): AdaptiveQualitySelection {
    return this.isDisposed ? 'auto' : this.engine.getAdaptiveQualitySelection?.() ?? 'auto'
  }

  /**
   * Selects automatic adaptive quality or a specific variant identifier.
   *
   * A newer selection or source operation rejects this request with `LOAD_ABORTED`; disposal
   * rejects it with `ENGINE_ERROR`. A fatal engine `error` rejects it with that exact published
   * error instance. Otherwise, an injected engine's own rejection is preserved unchanged.
   *
   * @param variantId `'auto'` for automatic ABR or a variant identifier from {@link getAdaptiveVariants}.
   * @throws {@link GAudioError} When selection is unavailable, superseded, fatally failed, or disposed.
   * @throws The original rejection when adaptive-quality selection on an injected custom engine fails.
   */
  async setAdaptiveQuality(variantId: AdaptiveQualitySelection): Promise<void> {
    this.assertUsable()
    const selectAdaptiveQuality = this.engine.setAdaptiveQuality
    if (!selectAdaptiveQuality) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Adaptive quality selection is unavailable for the active source')
    }

    if (this.activeAdaptiveOperation) {
      this.rejectPlayerEngineOperation(
        this.activeAdaptiveOperation,
        new GAudioError('LOAD_ABORTED', 'Adaptive quality selection was superseded by a newer selection'),
      )
    }
    const activeAdaptiveOperation: ActivePlayerEngineOperation = {
      loadRequestId: this.loadRequestId,
      gate: createEngineOperationGate(),
    }
    this.activeAdaptiveOperation = activeAdaptiveOperation
    observeEngineOperation(
      () => selectAdaptiveQuality.call(this.engine, variantId),
      activeAdaptiveOperation.gate,
    )
    try {
      await activeAdaptiveOperation.gate.completion
      // AI modified: lifecycle errors raised after engine success still own the public operation.
      if (activeAdaptiveOperation.terminalError) {
        throw activeAdaptiveOperation.terminalError
      }
      this.assertUsable()
    }
    finally {
      if (this.activeAdaptiveOperation === activeAdaptiveOperation) {
        this.activeAdaptiveOperation = undefined
      }
    }
  }

  /**
   * Replaces the current source without loading it.
   *
   * Any active load is cancelled, the current engine is unloaded, and state returns to `idle`.
   *
   * @param source URL, source description, or custom source implementation.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  setSource(source: AudioSourceInput): void {
    this.assertUsable()
    this.playlist = []
    this.playlistIndex = -1
    this.selectedAudioTrackId = undefined
    this.replaceSource(source)
  }

  /**
   * Replaces the current playlist and selects a track without loading it.
   *
   * @param playlist Tracks to make available for sequential playback.
   * @param options Selection options for the initial track.
   * @throws {RangeError} When `options.startIndex` does not reference a playlist track.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  setPlaylist(playlist: readonly AudioPlaylistTrack[], options: AudioPlaylistOptions = {}): void {
    this.assertUsable()
    const playlistTracks = playlist.map(track => ({
      source: typeof track.source === 'object' && !('open' in track.source)
        ? {
            url: track.source.url,
            protocol: track.source.protocol,
            mimeType: track.source.mimeType,
          }
        : track.source,
      fallbackSources: track.fallbackSources?.map(fallbackSource => (
        typeof fallbackSource === 'object' && !('open' in fallbackSource)
          ? {
              url: fallbackSource.url,
              protocol: fallbackSource.protocol,
              mimeType: fallbackSource.mimeType,
            }
          : fallbackSource
      )),
      metadata: track.metadata
        ? {
            title: track.metadata.title,
            artist: track.metadata.artist,
            album: track.metadata.album,
            artwork: track.metadata.artwork?.map(artwork => ({
              src: artwork.src,
              sizes: artwork.sizes,
              type: artwork.type,
            })),
          }
        : undefined,
      audioTracks: track.audioTracks?.map(audioTrack => ({
        id: audioTrack.id,
        label: audioTrack.label,
        language: audioTrack.language,
        source: typeof audioTrack.source === 'object' && !('open' in audioTrack.source)
          ? {
              url: audioTrack.source.url,
              protocol: audioTrack.source.protocol,
              mimeType: audioTrack.source.mimeType,
            }
          : audioTrack.source,
        fallbackSources: audioTrack.fallbackSources?.map(fallbackSource => (
          typeof fallbackSource === 'object' && !('open' in fallbackSource)
            ? {
                url: fallbackSource.url,
                protocol: fallbackSource.protocol,
                mimeType: fallbackSource.mimeType,
              }
            : fallbackSource
        )),
      })),
      defaultAudioTrackId: track.defaultAudioTrackId,
    }))

    if (playlistTracks.length === 0) {
      this.playlist = playlistTracks
      this.playlistIndex = -1
      this.selectedAudioTrackId = undefined
      this.replaceSource(undefined)
      return
    }

    const startIndex = options.startIndex ?? 0
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= playlistTracks.length) {
      throw new RangeError('Playlist index must reference an existing track')
    }

    // AI modified: validate the complete replacement before committing any playlist-visible state.
    this.playlist = playlistTracks
    this.playlistIndex = startIndex
    this.selectedAudioTrackId = this.defaultAudioTrackId(this.playlist[startIndex])
    // AI modified: playlist selection reuses the same source lifecycle as direct source changes.
    this.replaceSource(this.activePlaylistSource())
  }

  /**
   * Loads the next playlist track when one is available.
   *
   * @param options Playback behavior after the track loads.
   * @returns `true` when a next track was selected.
   * @throws {@link GAudioError} When selecting or loading the next source fails.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  async next(options: AudioPlaylistNavigationOptions = {}): Promise<boolean> {
    this.assertUsable()
    if (this.playlistIndex < 0 || this.playlistIndex >= this.playlist.length - 1) {
      return false
    }

    await this.selectPlaylistTrack(this.playlistIndex + 1, options)
    // AI modified: navigation remains terminal when disposal wins a delayed selection.
    this.assertUsable()
    return true
  }

  /**
   * Loads the previous playlist track when one is available.
   *
   * @param options Playback behavior after the track loads.
   * @returns `true` when a previous track was selected.
   * @throws {@link GAudioError} When selecting or loading the previous source fails.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  async previous(options: AudioPlaylistNavigationOptions = {}): Promise<boolean> {
    this.assertUsable()
    if (this.playlistIndex <= 0) {
      return false
    }

    await this.selectPlaylistTrack(this.playlistIndex - 1, options)
    this.assertUsable()
    return true
  }

  /**
   * Selects and loads a playlist track by index.
   *
   * @param index Zero-based playlist track index.
   * @param options Playback behavior after the track loads.
   * @throws {RangeError} When `index` does not reference a playlist track.
   * @throws {@link GAudioError} When selecting or loading the requested source fails.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  async selectPlaylistTrack(index: number, options: AudioPlaylistNavigationOptions = {}): Promise<void> {
    this.assertUsable()
    this.assertPlaylistIndex(index)
    this.playlistIndex = index
    this.selectedAudioTrackId = this.defaultAudioTrackId(this.playlist[index])
    if (!this.replaceSource(this.activePlaylistSource())) {
      // AI modified: superseded navigation must not load or autoplay the newer operation's source.
      throw new GAudioError('LOAD_ABORTED', 'Playlist selection was superseded by a newer source operation')
    }

    // AI modified: an explicit navigation option overrides the player-wide future-load default.
    await this.loadSource(options.autoplay ?? this.shouldAutoplay)
    // AI modified: ready listeners cannot dispose the player and still complete public navigation successfully.
    this.assertUsable()
  }

  /**
   * Selects an alternate audio track for the active playlist item.
   *
   * @param audioTrackId Audio track identifier from {@link getAudioTracks}.
   * @param options Continuity behavior while switching sources.
   * @throws {RangeError} When `audioTrackId` does not reference an available audio track.
   * @throws {@link GAudioError} When selecting, loading, seeking, or playing the requested track fails.
   * @throws The original error when a query or seek on an injected custom engine fails.
   * @throws The original analyzer-disposal or engine-unload error when source replacement cleanup fails.
   */
  async selectAudioTrack(audioTrackId: string, options: AudioTrackSelectionOptions = {}): Promise<void> {
    this.assertUsable()
    const audioTrack = this.getAudioTracks().find(track => track.id === audioTrackId)
    if (!audioTrack) {
      throw new RangeError('Audio track id must reference an available audio track')
    }

    const previousTime = this.getCurrentTime()
    const wasPlaying = !this.isPaused()
    const shouldPreserveTime = options.preserveTime ?? true
    const shouldPlayAfterLoad = options.autoplay === 'preserve' || options.autoplay === undefined
      ? wasPlaying
      : options.autoplay
    this.selectedAudioTrackId = audioTrack.id
    // AI modified: alternate audio tracks are same-program source switches, so keep playlist context intact.
    if (!this.replaceSource(audioTrack.source)) {
      // AI modified: superseded track selection must not restore time or playback onto the newer source.
      throw new GAudioError('LOAD_ABORTED', 'Audio track selection was superseded by a newer source operation')
    }
    // AI modified: later source or position commands supersede only this replacement's continuity restore.
    const positionIntentId = this.positionIntentId
    const activeLoadCompletion = this.loadSource(false)
    const playbackIntentId = this.playbackIntentId
    await activeLoadCompletion
    // AI modified: a ready listener that disposes the player terminates alternate-track selection.
    this.assertUsable()

    if (shouldPreserveTime && positionIntentId === this.positionIntentId) {
      await this.seek(previousTime)
    }

    if (shouldPlayAfterLoad && playbackIntentId === this.playbackIntentId) {
      await this.play()
    }
  }

  private replaceSource(sourceInput: AudioSourceInput | undefined): boolean {
    const nextSource = sourceInput === undefined ? undefined : this.audioSourceForInput(sourceInput)
    const replacementRequestId = ++this.loadRequestId
    // AI modified: replacing a source invalidates late playback completions before the replacement can load.
    this.playbackIntentId += 1
    // AI modified: a new source invalidates continuity seeks still owned by the previous source.
    this.positionIntentId += 1
    this.requestedPlayback = 'pause'
    const replacementCancellation = new GAudioError(
      'LOAD_ABORTED',
      'Audio operation was superseded by a replacement source',
    )
    // AI modified: source replacement settles custom-engine operations without waiting for their promises.
    this.rejectActiveSourceOperations(replacementCancellation)
    this.resolveActivePlaybackAttempts()
    let replacementError: unknown
    let hasReplacementError = false
    try {
      this.releaseAnalyzer()
    }
    catch (error) {
      replacementError = error
      hasReplacementError = true
    }
    if (replacementRequestId === this.loadRequestId && !this.isDisposed) {
      try {
        this.engine.unload()
      }
      catch (error) {
        if (!hasReplacementError) {
          replacementError = error
          hasReplacementError = true
        }
      }
    }

    if (replacementRequestId === this.loadRequestId && !this.isDisposed) {
      // AI modified: only the latest synchronous replacement may commit after reentrant teardown callbacks.
      this.source = nextSource
      this.hasLoadedSource = false
      this.setState('idle')
      this.updateMediaSessionMetadata()
      this.updateMediaSessionPosition()
    }

    if (hasReplacementError) {
      throw replacementError
    }

    return replacementRequestId === this.loadRequestId && !this.isDisposed
  }

  /**
   * Loads the configured source and resolves when it is ready.
   *
   * When autoplay is enabled, this method also attempts playback before resolving.
   * GAudio-owned loading and playback failures use stable {@link GAudioError} codes.
   * Source replacement or a newer load rejects with `LOAD_ABORTED`, while disposal rejects with
   * `ENGINE_ERROR`, without waiting for an injected engine promise to settle. A terminal fatal
   * engine `error` is preserved as the same instance published to player listeners.
   * An error thrown while disposing a caller-provided analyzer is propagated unchanged.
   *
   * @throws {@link GAudioError} When a GAudio-owned source, engine, cancellation, analyzer-creation, or autoplay operation fails.
   * @throws The original error when caller-provided analyzer cleanup fails before loading starts.
   */
  async load(): Promise<void> {
    this.assertUsable()
    await this.loadSource(this.shouldAutoplay)
    // AI modified: a reentrant ready listener cannot turn disposal into a successful load.
    this.assertUsable()
  }

  private loadSource(shouldPlayAfterLoad: boolean): Promise<void> {
    if (!this.source) {
      const error = new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before loading')
      this.publishError(error)
      throw error
    }

    const previousLoadRequestId = this.loadRequestId
    try {
      // AI modified: release first so a cleanup failure leaves the already-loaded source state internally consistent.
      this.releaseAnalyzer()
    }
    catch (error) {
      if (previousLoadRequestId !== this.loadRequestId || this.isDisposed) {
        throw this.loadInterruptionError('Audio load was superseded while releasing its previous analyzer', error)
      }
      throw error
    }
    if (previousLoadRequestId !== this.loadRequestId || this.isDisposed) {
      throw this.loadInterruptionError('Audio load was superseded while releasing its previous analyzer')
    }

    const loadRequestId = ++this.loadRequestId
    // AI modified: loading is a paused boundary; its captured autoplay intent starts only after readiness.
    this.playbackIntentId += 1
    this.requestedPlayback = 'pause'
    const loadCancellation = new GAudioError('LOAD_ABORTED', 'Audio operation was superseded by a newer load')
    this.rejectActiveSourceOperations(loadCancellation)
    this.resolveActivePlaybackAttempts()
    this.hasLoadedSource = false
    const activeLoadPlaybackIntent: ActiveLoadPlaybackIntent = {
      loadRequestId,
      playbackIntentId: this.playbackIntentId,
      positionIntentId: this.positionIntentId,
      shouldPlay: shouldPlayAfterLoad,
    }
    this.activeLoadRequestId = loadRequestId
    this.activeLoadError = undefined
    this.activeLoadPlaybackIntent = activeLoadPlaybackIntent
    const activeLoadCompletion = Promise.resolve().then(
      () => this.completeSourceLoad(loadRequestId, activeLoadPlaybackIntent),
    )
    this.activeLoadCompletion = activeLoadCompletion
    this.setState('loading')

    return activeLoadCompletion
  }

  private async completeSourceLoad(
    loadRequestId: number,
    activeLoadPlaybackIntent: ActiveLoadPlaybackIntent,
  ): Promise<void> {
    try {
      try {
        if (loadRequestId !== this.loadRequestId || this.isDisposed) {
          throw this.loadInterruptionError('Audio load was superseded by a newer operation')
        }
        await this.loadCurrentSource(loadRequestId)
        // AI modified: handoff errors must reach the load boundary before its buffered error is cleared.
        if (loadRequestId !== this.loadRequestId || this.isDisposed) {
          throw this.loadInterruptionError('Audio load was superseded by a newer operation')
        }
        if (this.activeLoadRequestId === loadRequestId && this.activeLoadError) {
          throw this.activeLoadError
        }
      }
      catch (error) {
        // AI modified: a previous load's rejection cannot inherit the replacement source's fatal error.
        const activeLoadError = this.activeLoadRequestId === loadRequestId
          ? this.activeLoadError
          : undefined
        if (this.activeLoadRequestId === loadRequestId) {
          this.activeLoadRequestId = undefined
          this.activeLoadError = undefined
        }

        if (error instanceof GAudioError && error.code === 'LOAD_ABORTED') {
          if (loadRequestId === this.loadRequestId) {
            this.setState('idle')
          }
          throw error
        }

        const playerError = activeLoadError ?? (error instanceof GAudioError
          ? error
          : new GAudioError('ENGINE_ERROR', 'Audio source could not be loaded', error))

        if (loadRequestId === this.loadRequestId && this.state !== 'error') {
          this.publishError(playerError)
        }
        throw playerError
      }

      if (this.activeLoadRequestId === loadRequestId) {
        this.activeLoadRequestId = undefined
        this.activeLoadError = undefined
      }

      if (loadRequestId !== this.loadRequestId || this.isDisposed) {
        throw this.loadInterruptionError('Audio load was superseded by a newer operation')
      }

      this.hasLoadedSource = true
      // AI modified: analyzer creation remains part of the load attempt so emitted fatal errors cannot resolve it.
      this.activeLoadRequestId = loadRequestId
      this.activeLoadError = undefined
      try {
        try {
          this.ensureAnalyzer(loadRequestId)
          if (this.activeLoadRequestId === loadRequestId && this.activeLoadError) {
            throw this.activeLoadError
          }
        }
        catch (error) {
          const activeLoadError = this.activeLoadRequestId === loadRequestId
            ? this.activeLoadError
            : undefined
          if (error instanceof GAudioError && error.code === 'LOAD_ABORTED') {
            throw error
          }
          const playerError = activeLoadError ?? (error instanceof GAudioError
            ? error
            : new GAudioError('ENGINE_ERROR', 'Audio analyzer could not be created', error))
          this.publishError(playerError)
          throw playerError
        }
      }
      finally {
        if (this.activeLoadRequestId === loadRequestId) {
          this.activeLoadRequestId = undefined
          this.activeLoadError = undefined
        }
      }
      if (
        activeLoadPlaybackIntent.positionIntentId < this.positionResetIntentId
        && this.positionResetIntentId === this.positionIntentId
      ) {
        const activePendingStopAttempt: ActivePendingStopAttempt = {}
        this.activePendingStopAttempt = activePendingStopAttempt
        // AI modified: apply a loading-time stop before ready observers can issue a newer playback command.
        try {
          try {
            this.engine.stop()
          }
          catch (error) {
            if (loadRequestId !== this.loadRequestId || this.isDisposed) {
              throw this.loadInterruptionError('Audio load was superseded while applying its pending stop', error)
            }
            if (activePendingStopAttempt.terminalError) {
              throw activePendingStopAttempt.terminalError
            }
            // AI modified: a failed pending stop must leave loading through the standard player error boundary.
            const playerError = new GAudioError('ENGINE_ERROR', 'Audio source could not be stopped after loading', error)
            if (this.state !== 'error') {
              this.publishError(playerError)
            }
            throw playerError
          }
          if (loadRequestId !== this.loadRequestId || this.isDisposed) {
            // AI modified: synchronous stop events can transfer ownership to a listener-selected source.
            throw this.loadInterruptionError('Audio load was superseded while applying its pending stop')
          }
          if (activePendingStopAttempt.terminalError) {
            // AI modified: a synchronous engine error owns the pending stop and rejects the joining load.
            throw activePendingStopAttempt.terminalError
          }
          this.updateMediaSessionPosition()
          // AI modified: position queries remain inside the pending-stop fatal-error boundary.
          if (activePendingStopAttempt.terminalError) {
            throw activePendingStopAttempt.terminalError
          }
          if (activeLoadPlaybackIntent.terminalError) {
            throw activeLoadPlaybackIntent.terminalError
          }
          if (this.isDisposed) {
            throw new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal')
          }
          if (loadRequestId !== this.loadRequestId) {
            throw new GAudioError('LOAD_ABORTED', 'Audio load was superseded while updating its stopped position')
          }
        }
        finally {
          if (this.activePendingStopAttempt === activePendingStopAttempt) {
            this.activePendingStopAttempt = undefined
          }
        }
      }
      if (activeLoadPlaybackIntent.terminalError) {
        throw activeLoadPlaybackIntent.terminalError
      }
      if (this.isDisposed) {
        throw new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal')
      }
      if (loadRequestId !== this.loadRequestId) {
        // AI modified: only the active load generation may publish the ready state.
        throw new GAudioError('LOAD_ABORTED', 'Audio load was superseded before becoming ready')
      }
      this.setState('ready')
      // AI modified: ready observers cannot turn a synchronous fatal error into a successful load.
      if (activeLoadPlaybackIntent.terminalError) {
        throw activeLoadPlaybackIntent.terminalError
      }
      if (this.isDisposed) {
        throw new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal')
      }
      if (loadRequestId !== this.loadRequestId) {
        throw new GAudioError('LOAD_ABORTED', 'Audio load was superseded after becoming ready')
      }
      if (
        activeLoadPlaybackIntent.shouldPlay
        && activeLoadPlaybackIntent.playbackIntentId === this.playbackIntentId
      ) {
        // AI modified: the active load owns the single playback attempt requested before readiness.
        await this.startPlayback()
        if (activeLoadPlaybackIntent.terminalError) {
          throw activeLoadPlaybackIntent.terminalError
        }
        if (this.isDisposed) {
          throw new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal')
        }
        if (loadRequestId !== this.loadRequestId) {
          throw new GAudioError('LOAD_ABORTED', 'Audio load was superseded during autoplay')
        }
      }
    }
    finally {
      if (this.activeLoadPlaybackIntent === activeLoadPlaybackIntent) {
        this.activeLoadPlaybackIntent = undefined
        this.activeLoadCompletion = undefined
      }
    }
  }

  /**
   * Starts or resumes playback, loading first when the player has no successfully loaded source.
   *
   * A fatal engine `error` rejects with the same instance published to listeners, and disposal
   * rejects with `ENGINE_ERROR`, even if the engine's play promise never settles. Pause or stop
   * silently supersedes an in-flight engine play attempt; source replacement or a newer load does
   * the same after engine playback has started. A play still awaiting its prerequisite load instead
   * inherits that load's `LOAD_ABORTED` rejection. Every late engine settlement remains observed.
   *
   * @throws {@link GAudioError} When a GAudio-owned load or playback operation fails.
   */
  async play(): Promise<void> {
    this.assertUsable()
    if (this.state === 'idle' || (this.state === 'error' && !this.hasLoadedSource)) {
      // AI modified: a play request retries failed loads but reuses sources that only failed during playback.
      await this.loadSource(true)
      this.assertUsable()
      return
    }

    if (this.state === 'loading') {
      const activeLoadPlaybackIntent = this.activeLoadPlaybackIntent
      const activeLoadCompletion = this.activeLoadCompletion

      if (!activeLoadPlaybackIntent || !activeLoadCompletion) {
        throw new GAudioError('ENGINE_ERROR', 'Active audio load is unavailable')
      }

      // AI modified: a play request during loading upgrades and joins the load instead of touching an unready engine.
      activeLoadPlaybackIntent.shouldPlay = true
      activeLoadPlaybackIntent.playbackIntentId = this.playbackIntentId
      await activeLoadCompletion
      this.assertUsable()
      return
    }

    await this.startPlayback()
  }

  private startPlayback(): Promise<void> {
    // AI modified: every play attempt owns an intent generation so later controls can invalidate its completion.
    const playbackIntentId = ++this.playbackIntentId
    const activePlaybackAttempt: ActivePlaybackAttempt = {
      loadRequestId: this.loadRequestId,
      gate: createEngineOperationGate(),
    }
    this.activePlaybackAttempts.add(activePlaybackAttempt)
    this.requestedPlayback = 'play'

    // AI modified: the worker keeps observing a late engine settlement after lifecycle events settle play() promptly.
    void this.completePlaybackAttempt(playbackIntentId, activePlaybackAttempt).catch((error: unknown) => {
      const playerError = error instanceof GAudioError
        ? error
        : new GAudioError('ENGINE_ERROR', 'Audio playback failed', error)
      activePlaybackAttempt.gate.reject(playerError)
    })

    return activePlaybackAttempt.gate.completion.finally(() => {
      this.activePlaybackAttempts.delete(activePlaybackAttempt)
    })
  }

  private async completePlaybackAttempt(
    playbackIntentId: number,
    activePlaybackAttempt: ActivePlaybackAttempt,
  ): Promise<void> {
    try {
      await this.engine.play()
    }
    catch (error) {
      // AI modified: a fatal engine event owns the in-flight play result even when it invalidates the play intent.
      if (activePlaybackAttempt.terminalError) {
        activePlaybackAttempt.gate.reject(activePlaybackAttempt.terminalError)
        return
      }
      if (this.isDisposed) {
        // AI modified: disposal is terminal for the caller even though superseded user controls remain silent.
        activePlaybackAttempt.gate.reject(
          error instanceof GAudioError
            ? error
            : new GAudioError('ENGINE_ERROR', 'Audio playback was interrupted by player disposal', error),
        )
        return
      }
      if (playbackIntentId !== this.playbackIntentId) {
        activePlaybackAttempt.gate.resolve()
        return
      }
      // AI modified: a failed current play request cannot let its queued pause task overwrite the error boundary.
      this.requestedPlayback = 'pause'
      const playerError = error instanceof GAudioError
        ? error
        : new GAudioError('ENGINE_ERROR', 'Audio playback failed', error)
      this.publishError(playerError)
      activePlaybackAttempt.gate.reject(playerError)
      return
    }

    if (this.isDisposed) {
      // AI modified: a late custom-engine resolution cannot make a disposed public play operation succeed.
      activePlaybackAttempt.gate.reject(
        new GAudioError('ENGINE_ERROR', 'Audio playback completed after player disposal'),
      )
      return
    }
    if (playbackIntentId !== this.playbackIntentId) {
      // AI modified: a late play resolution must not reverse a newer pause or stop request.
      const enforcementLoadRequestId = this.loadRequestId
      const enforcementPlaybackIntentId = this.playbackIntentId
      const enforcedPlayback = this.requestedPlayback
      try {
        this.enforceRequestedPlayback()
      }
      catch (error) {
        if (activePlaybackAttempt.terminalError) {
          activePlaybackAttempt.gate.reject(activePlaybackAttempt.terminalError)
          return
        }
        if (
          this.isDisposed
          || enforcementLoadRequestId !== this.loadRequestId
          || enforcementPlaybackIntentId !== this.playbackIntentId
          || enforcedPlayback !== this.requestedPlayback
        ) {
          // AI modified: a reentrant lifecycle command owns failures from obsolete late-play enforcement.
          activePlaybackAttempt.gate.resolve()
          return
        }
        const playerError = error instanceof GAudioError
          ? error
          : new GAudioError('ENGINE_ERROR', 'Audio playback could not honor the latest pause or stop request', error)
        this.publishError(playerError)
        activePlaybackAttempt.gate.reject(playerError)
        return
      }
    }

    if (activePlaybackAttempt.terminalError) {
      activePlaybackAttempt.gate.reject(activePlaybackAttempt.terminalError)
      return
    }
    activePlaybackAttempt.gate.resolve()
  }

  private enforceRequestedPlayback(): void {
    if (this.requestedPlayback === 'stop') {
      const stopLoadRequestId = this.loadRequestId
      const stopPlaybackIntentId = this.playbackIntentId
      const terminalErrorGeneration = this.terminalErrorGeneration
      this.engine.stop()
      // AI modified: synchronous errors or reentrant controls own state after late-play stop enforcement.
      if (
        this.isDisposed
        || stopLoadRequestId !== this.loadRequestId
        || stopPlaybackIntentId !== this.playbackIntentId
        || terminalErrorGeneration !== this.terminalErrorGeneration
        || this.requestedPlayback !== 'stop'
      ) {
        return
      }
      this.setState(this.hasLoadedSource ? 'ready' : 'idle')
      this.updateMediaSessionPosition()
    }
    else if (this.requestedPlayback === 'pause') {
      this.engine.pause()
    }
  }

  /**
   * Pauses playback while retaining the current position and loaded source.
   *
   * @throws The original error when `pause()` on an injected custom engine fails.
   */
  pause(): void {
    this.assertUsable()
    // AI modified: a pause during loading invalidates that load's captured autoplay intent.
    this.requestedPlayback = 'pause'
    this.playbackIntentId += 1
    if (this.state === 'loading') {
      this.resolveActivePlaybackAttempts()
      return
    }
    // AI modified: synchronous pause listeners may start new plays that this older control must not settle.
    const supersededPlaybackAttempts = [...this.activePlaybackAttempts]
    try {
      this.engine.pause()
    }
    finally {
      this.resolveActivePlaybackAttempts(supersededPlaybackAttempts)
    }
  }

  /**
   * Pauses playback and returns to `0` seconds while retaining the loaded source.
   *
   * @throws The original error when `stop()` on an injected custom engine fails.
   */
  stop(): void {
    this.assertUsable()
    // AI modified: a stop during loading invalidates that load's captured autoplay intent.
    this.requestedPlayback = 'stop'
    this.playbackIntentId += 1
    // AI modified: alternate-track loads cannot restore a position superseded by an explicit stop.
    this.positionIntentId += 1
    this.positionResetIntentId = this.positionIntentId
    if (this.activePositionOperation) {
      this.rejectPlayerEngineOperation(
        this.activePositionOperation,
        new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by stop'),
      )
    }
    if (this.state === 'loading') {
      this.resolveActivePlaybackAttempts()
      return
    }
    const stopLoadRequestId = this.loadRequestId
    const stopPlaybackIntentId = this.playbackIntentId
    const terminalErrorGeneration = this.terminalErrorGeneration
    // AI modified: retain only older plays so reentrant stop listeners own their new playback attempts.
    const supersededPlaybackAttempts = [...this.activePlaybackAttempts]
    try {
      this.engine.stop()
    }
    finally {
      this.resolveActivePlaybackAttempts(supersededPlaybackAttempts)
    }
    // AI modified: synchronous engine errors or reentrant controls own the post-stop state.
    if (
      this.isDisposed
      || stopLoadRequestId !== this.loadRequestId
      || stopPlaybackIntentId !== this.playbackIntentId
      || terminalErrorGeneration !== this.terminalErrorGeneration
      || this.requestedPlayback !== 'stop'
    ) {
      return
    }
    // AI modified: ready means a source is loaded and can resume without another load.
    this.setState(this.hasLoadedSource ? 'ready' : 'idle')
    this.updateMediaSessionPosition()
  }

  /**
   * Seeks to an exact playback position.
   *
   * A newer seek, stop, or source operation rejects this request with `LOAD_ABORTED`; disposal
   * rejects it with `ENGINE_ERROR`. A fatal engine `error` rejects it with that exact published
   * error instance. Otherwise, an injected engine's own rejection is preserved unchanged.
   *
   * @param seconds Non-negative target position in seconds.
   * @throws {RangeError} When `seconds` is negative or not finite.
   * @throws {@link GAudioError} When the operation is superseded, fatally failed, or disposed.
   * @throws The original rejection when `seek()` on an injected custom engine fails.
   */
  async seek(seconds: number): Promise<void> {
    this.assertUsable()
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Seek position must be a finite number greater than or equal to 0')
    }
    // AI modified: a new seek prevents an older alternate-track switch from restoring stale time.
    this.positionIntentId += 1
    if (this.activePositionOperation) {
      this.rejectPlayerEngineOperation(
        this.activePositionOperation,
        new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by a newer seek'),
      )
    }
    const activePositionOperation: ActivePlayerEngineOperation = {
      loadRequestId: this.loadRequestId,
      gate: createEngineOperationGate(),
    }
    this.activePositionOperation = activePositionOperation
    observeEngineOperation(() => this.engine.seek(seconds), activePositionOperation.gate)
    try {
      await activePositionOperation.gate.completion
      if (activePositionOperation.terminalError) {
        throw activePositionOperation.terminalError
      }
      this.assertUsable()
      this.updateMediaSessionPosition()
      // AI modified: Media Session queries can synchronously transfer lifecycle ownership after engine success.
      if (activePositionOperation.terminalError) {
        throw activePositionOperation.terminalError
      }
      this.assertUsable()
    }
    finally {
      if (this.activePositionOperation === activePositionOperation) {
        this.activePositionOperation = undefined
      }
    }
  }

  /**
   * Seeks using the browser's optimized seek operation when available.
   * Calls the engine's exact seek operation when it omits an optimized path.
   *
   * A newer seek, stop, or source operation rejects this request with `LOAD_ABORTED`; disposal
   * rejects it with `ENGINE_ERROR`. A fatal engine `error` rejects it with that exact published
   * error instance. Otherwise, an injected engine's own rejection is preserved unchanged.
   *
   * @param seconds Non-negative target position in seconds.
   * @throws {RangeError} When `seconds` is negative or not finite.
   * @throws {@link GAudioError} When the operation is superseded, fatally failed, or disposed.
   * @throws The original rejection when `fastSeek()` on an injected custom engine fails.
   */
  async fastSeek(seconds: number): Promise<void> {
    this.assertUsable()
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Fast seek position must be a finite number greater than or equal to 0')
    }
    // AI modified: fast seek owns the same position intent ordering as exact seek.
    this.positionIntentId += 1
    if (this.activePositionOperation) {
      this.rejectPlayerEngineOperation(
        this.activePositionOperation,
        new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by a newer seek'),
      )
    }
    const activePositionOperation: ActivePlayerEngineOperation = {
      loadRequestId: this.loadRequestId,
      gate: createEngineOperationGate(),
    }
    this.activePositionOperation = activePositionOperation
    // AI modified: engines without a browser fast-seek path retain the same position-operation lifecycle through seek.
    observeEngineOperation(
      () => this.engine.fastSeek ? this.engine.fastSeek(seconds) : this.engine.seek(seconds),
      activePositionOperation.gate,
    )
    try {
      await activePositionOperation.gate.completion
      if (activePositionOperation.terminalError) {
        throw activePositionOperation.terminalError
      }
      this.assertUsable()
      this.updateMediaSessionPosition()
      if (activePositionOperation.terminalError) {
        throw activePositionOperation.terminalError
      }
      this.assertUsable()
    }
    finally {
      if (this.activePositionOperation === activePositionOperation) {
        this.activePositionOperation = undefined
      }
    }
  }

  /**
   * Registers a typed player event listener.
   *
   * Listener callbacks run synchronously. A callback failure does not interrupt internal or sibling
   * listeners; it is passed to `globalThis.reportError` when available or rethrown from a queued microtask.
   *
   * @typeParam EventName Player event key whose payload type is delivered to the handler.
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    this.assertUsable()
    return this.events.on(eventName, handler)
  }

  /**
   * Registers a typed listener that is removed after the next matching player event.
   *
   * Listener failure reporting follows {@link on}.
   *
   * @typeParam EventName Player event key whose payload type is delivered to the handler.
   * @param eventName Event to observe once.
   * @param handler Listener invoked with the next event payload.
   * @returns A function that removes this listener before it runs.
   */
  once<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    this.assertUsable()
    return this.events.once(eventName, handler)
  }

  /**
   * Removes player event listeners.
   *
   * @typeParam EventName Optional player event key whose listeners should be removed.
   * @param eventName Optional event name. When omitted, every player listener is removed.
   */
  removeAllListeners<EventName extends keyof AudioPlayerEvents>(eventName?: EventName): void {
    // AI modified: expose scoped listener cleanup without forcing applications to dispose playback.
    this.events.clear(eventName)
  }

  /**
   * Permanently disposes the player and waits for cleanup of every owned resource.
   *
   * The player becomes unusable synchronously. The returned promise settles after source,
   * browser, and vendor cleanup finishes. A failed cleanup remains retryable by a later
   * repeated `dispose()` call; the player remains disposed while that cleanup is retried.
   * An adapter remains owned by its router until all router cleanup finishes.
   *
   * Read-only queries remain safe. Create a new player and fresh adapter instances
   * instead of transferring adapters from a router that may still be cleaning up.
   * In-flight load, play, seek, fast-seek, adaptive-quality, and navigation work is rejected
   * promptly with `ENGINE_ERROR` and does not emit a public player `error` solely because of disposal.
   *
   * @returns A promise that rejects with the first cleanup error reported by an owned resource.
   */
  dispose(): Promise<void> {
    if (this.activeDisposal) {
      return this.activeDisposal
    }

    const disposalErrors: unknown[] = []
    let engineDisposal = Promise.resolve()

    if (this.isDisposed) {
      if (this.hasPendingMediaSessionDisposal) {
        try {
          // AI modified: a failed browser ownership handoff remains retryable after logical player disposal.
          this.mediaSession?.dispose()
          this.hasPendingMediaSessionDisposal = false
        }
        catch (error) {
          disposalErrors.push(error)
        }
      }
      if (this.removeEngineListeners.length > 0) {
        try {
          // AI modified: repeated disposal retries only engine subscriptions whose cleanup failed.
          this.disconnectEngineEvents()
        }
        catch (error) {
          disposalErrors.push(error)
        }
      }
      if (this.hasPendingEngineDisposal) {
        try {
          this.hasPendingEngineDisposal = true
          engineDisposal = this.engine.dispose().then(
            () => {
              this.hasPendingEngineDisposal = false
            },
            (error: unknown) => {
              this.hasPendingEngineDisposal = true
              throw error
            },
          )
        }
        catch (error) {
          this.hasPendingEngineDisposal = true
          disposalErrors.push(error)
        }
      }

      return this.trackDisposal(engineDisposal, disposalErrors)
    }

    // AI modified: disposed players reject future control operations and cannot be revived by late loads.
    this.isDisposed = true
    this.loadRequestId += 1
    this.playbackIntentId += 1
    const disposalError = new GAudioError('ENGINE_ERROR', 'Audio operation was interrupted by player disposal')
    // AI modified: disposal settles every public async operation even when an injected engine never does.
    this.rejectActiveSourceOperations(disposalError)
    this.rejectActivePlaybackAttempts(disposalError)
    this.activeLoadRequestId = undefined
    this.activeLoadError = undefined
    this.activeLoadPlaybackIntent = undefined
    this.activeLoadCompletion = undefined

    // AI modified: every owned resource gets one cleanup attempt even when an earlier disposer fails.
    try {
      this.disconnectEngineEvents()
    }
    catch (error) {
      disposalErrors.push(error)
    }
    try {
      this.releaseAnalyzer()
    }
    catch (error) {
      disposalErrors.push(error)
    }
    try {
      this.mediaSession?.dispose()
      this.hasPendingMediaSessionDisposal = false
    }
    catch (error) {
      this.hasPendingMediaSessionDisposal = true
      disposalErrors.push(error)
    }
    try {
      this.hasPendingEngineDisposal = true
      engineDisposal = this.engine.dispose().then(
        () => {
          this.hasPendingEngineDisposal = false
        },
        (error: unknown) => {
          this.hasPendingEngineDisposal = true
          throw error
        },
      )
    }
    catch (error) {
      // AI modified: failed engine cleanup remains retryable without repeating already released player resources.
      this.hasPendingEngineDisposal = true
      disposalErrors.push(error)
    }
    this.events.clear()
    this.source = undefined
    this.hasLoadedSource = false
    this.state = 'idle'

    return this.trackDisposal(engineDisposal, disposalErrors)
  }

  private trackDisposal(engineDisposal: Promise<void>, disposalErrors: unknown[]): Promise<void> {
    const cleanup = engineDisposal.catch((error: unknown) => {
      disposalErrors.push(error)
    }).then(() => {
      if (disposalErrors.length > 0) {
        throw disposalErrors[0]
      }
    })
    // AI modified: concurrent dispose calls share one cleanup attempt; a rejection unlocks an explicit retry.
    const activeDisposal = cleanup.finally(() => {
      if (this.activeDisposal === activeDisposal) {
        this.activeDisposal = undefined
      }
    })
    this.activeDisposal = activeDisposal
    return activeDisposal
  }

  private playerAnalyzerOptions(
    analyzerOption: AudioPlayerOptions['analyzer'],
  ): AudioPlayerAnalyzerOptions | undefined {
    if (analyzerOption === undefined || analyzerOption === false) {
      return undefined
    }
    if (analyzerOption === true) {
      return { enabled: true, fftSize: defaultAnalyzerFftSize }
    }

    return analyzerOption.enabled === false
      ? undefined
      : {
          ...analyzerOption,
          fftSize: analyzerOption.fftSize ?? defaultAnalyzerFftSize,
        }
  }

  private createMediaSession(
    option: AudioPlayerOptions['mediaSession'],
  ): BrowserMediaSession | undefined {
    if (option === undefined || option === false) {
      return undefined
    }

    const mediaSessionOptions: AudioMediaSessionOptions = option === true
      ? {}
      : option

    if (mediaSessionOptions.enabled === false) {
      return undefined
    }

    return new BrowserMediaSession(mediaSessionOptions, {
      play: () => this.play(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      previous: () => this.previous({ autoplay: true }),
      next: () => this.next({ autoplay: true }),
      seek: seconds => this.seek(seconds),
      fastSeek: seconds => this.fastSeek(seconds),
      getCurrentTime: () => this.getCurrentTime(),
      getDuration: () => this.getDuration(),
      getPlaybackRate: () => this.getPlaybackRate(),
      getErrorPublicationSequence: () => this.errorPublicationSequence,
      wasErrorPublishedSince: (error, publicationSequence) => (
        error instanceof GAudioError
        && (this.errorPublicationSequences.get(error) ?? 0) > publicationSequence
      ),
    })
  }

  private ensureAnalyzer(loadRequestId: number): void {
    if (!this.analyzerOptions || this.analyzer) {
      return
    }

    const fftSize = this.analyzerOptions.fftSize ?? defaultAnalyzerFftSize
    let analyzer: AudioAnalyzer | undefined
    try {
      const createAnalyzer = this.analyzerOptions.createAnalyzer
      // AI modified: an explicit factory owns analyzer availability, including an intentional undefined result.
      analyzer = createAnalyzer
        ? createAnalyzer({
            engine: this.engine,
            fftSize,
          })
        : this.engine.createAnalyzer?.({ fftSize })
    }
    catch (error) {
      if (loadRequestId !== this.loadRequestId || this.isDisposed) {
        throw this.loadInterruptionError('Audio load was superseded while creating its analyzer', error)
      }
      throw error
    }

    if (loadRequestId !== this.loadRequestId || this.isDisposed) {
      let disposalError: unknown
      try {
        // AI modified: a reentrant factory cannot return ownership to a superseded or disposed player.
        analyzer?.dispose()
      }
      catch (error) {
        disposalError = error
      }
      throw this.loadInterruptionError(
        'Audio load was superseded while creating its analyzer',
        disposalError,
      )
    }

    this.analyzer = analyzer
  }

  private releaseAnalyzer(): void {
    const analyzer = this.analyzer
    this.analyzer = undefined
    // AI modified: detach the analyzer before disposal so a failing implementation cannot be released twice.
    analyzer?.dispose()
  }

  private connectEngineEvents(): void {
    for (const eventName of audioEngineEventNames) {
      switch (eventName) {
        case 'loadedmetadata':
        case 'seeked':
        case 'timeupdate':
        case 'durationchange':
          this.connectEngineEvent(eventName, (payload) => {
            this.updateMediaSessionPosition()
            this.events.emit(eventName, payload)
          })
          break
        case 'ratechange':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: browser-originated setting changes update the player-owned disposal-safe snapshot.
            this.playbackRate = payload.playbackRate
            this.updateMediaSessionPosition()
            this.events.emit(eventName, payload)
          })
          break
        case 'volumechange':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: native media controls keep player-owned volume and mute settings current.
            this.outputVolume = payload.volume
            this.isOutputMuted = payload.isMuted
            this.events.emit(eventName, payload)
          })
          break
        case 'playing':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: queued playback events cannot override a newer pause, stop, or ended engine state.
            if (
              !this.hasLoadedSource
              || this.requestedPlayback !== 'play'
              || this.engine.isPaused()
              || this.engine.isEnded()
            ) {
              return
            }
            const lifecycleLoadRequestId = this.loadRequestId
            const lifecyclePlaybackIntentId = this.playbackIntentId
            try {
              // AI modified: the most recently confirmed playing player owns system media controls.
              this.mediaSession?.activate()
            }
            catch {
              // Optional browser presentation failures cannot interrupt confirmed audio playback.
            }
            this.setState('playing')
            if (this.canPublishPlaybackLifecycleEvent('playing', lifecycleLoadRequestId, lifecyclePlaybackIntentId)) {
              this.events.emit(eventName, payload)
            }
          })
          break
        case 'pause':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: only the active loaded source's actual paused state may publish a queued pause.
            if (
              !this.hasLoadedSource
              || this.requestedPlayback === 'stop'
              || this.state === 'error'
              || !this.engine.isPaused()
              || this.engine.isEnded()
            ) {
              return
            }
            const lifecycleLoadRequestId = this.loadRequestId
            const lifecyclePlaybackIntentId = this.playbackIntentId
            this.setState('paused')
            if (this.canPublishPlaybackLifecycleEvent('paused', lifecycleLoadRequestId, lifecyclePlaybackIntentId)) {
              this.events.emit(eventName, payload)
            }
          })
          break
        case 'waiting':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: stale buffering work cannot revive playback after a newer control intent.
            if (
              !this.hasLoadedSource
              || this.requestedPlayback !== 'play'
              || this.engine.isPaused()
              || this.engine.isEnded()
            ) {
              return
            }
            const lifecycleLoadRequestId = this.loadRequestId
            const lifecyclePlaybackIntentId = this.playbackIntentId
            this.setState('buffering')
            if (this.canPublishPlaybackLifecycleEvent('buffering', lifecycleLoadRequestId, lifecyclePlaybackIntentId)) {
              this.events.emit(eventName, payload)
            }
          })
          break
        case 'ended':
          this.connectEngineEvent(eventName, (payload) => {
            // AI modified: only a currently ended engine under the active play intent may advance the queue.
            if (
              !this.hasLoadedSource
              || this.requestedPlayback !== 'play'
              || !this.engine.isEnded()
            ) {
              return
            }
            const endedLoadRequestId = this.loadRequestId
            const endedPlaylistIndex = this.playlistIndex
            const endedPlaybackIntentId = this.playbackIntentId
            this.setState('ended')
            if (!this.canPublishPlaybackLifecycleEvent('ended', endedLoadRequestId, endedPlaybackIntentId)) {
              return
            }
            this.events.emit(eventName, payload)
            if (
              endedLoadRequestId === this.loadRequestId
              && endedPlaylistIndex === this.playlistIndex
              && endedPlaybackIntentId === this.playbackIntentId
              && !this.isDisposed
            ) {
              // AI modified: listener-driven controls or navigation own the ended transition instead of being overridden.
              this.continuePlaylistAfterEnded()
            }
          })
          break
        case 'error':
          this.connectEngineEvent(eventName, (error) => {
            if (this.activeLoadRequestId === this.loadRequestId) {
              // AI modified: candidate errors stay private until fallback exhaustion makes one terminal.
              this.activeLoadError = error
              if (this.activeLoadEngineOperation) {
                this.rejectPlayerEngineOperation(this.activeLoadEngineOperation, error)
              }
              if (this.activePositionOperation?.loadRequestId === this.loadRequestId) {
                this.rejectPlayerEngineOperation(this.activePositionOperation, error)
              }
              if (this.activeAdaptiveOperation?.loadRequestId === this.loadRequestId) {
                this.rejectPlayerEngineOperation(this.activeAdaptiveOperation, error)
              }
              return
            }
            if (this.activeLoadPlaybackIntent?.loadRequestId === this.loadRequestId) {
              // AI modified: post-load bookkeeping remains part of load()'s fatal-error boundary.
              this.activeLoadPlaybackIntent.terminalError ??= error
            }
            // AI modified: one fatal event promptly terminates every current operation with the same identity.
            this.rejectActivePlaybackAttempts(error, this.loadRequestId)
            if (this.activePositionOperation?.loadRequestId === this.loadRequestId) {
              this.rejectPlayerEngineOperation(this.activePositionOperation, error)
            }
            if (this.activeAdaptiveOperation?.loadRequestId === this.loadRequestId) {
              this.rejectPlayerEngineOperation(this.activeAdaptiveOperation, error)
            }
            if (this.activePendingStopAttempt) {
              this.activePendingStopAttempt.terminalError ??= error
            }
            this.publishError(error)
          })
          break
        default:
          this.forwardEngineEvent(eventName)
      }
    }
  }

  private connectEngineEvent<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): void {
    this.removeEngineListeners.push(this.engine.on(eventName, (payload) => {
      // AI modified: a failed custom unsubscribe cannot mutate a disposed player's retained query snapshots.
      if (!this.isDisposed) {
        handler(payload)
      }
    }))
  }

  private disconnectEngineEvents(): void {
    const removeEngineListeners = this.removeEngineListeners.splice(0)
    const failedEngineListenerRemovals: Array<() => void> = []
    const removalErrors: unknown[] = []
    for (const removeEngineListener of removeEngineListeners) {
      try {
        removeEngineListener()
      }
      catch (error) {
        // AI modified: a custom unsubscribe failure cannot leave the remaining engine callbacks attached.
        failedEngineListenerRemovals.push(removeEngineListener)
        removalErrors.push(error)
      }
    }
    this.removeEngineListeners.push(...failedEngineListenerRemovals)
    if (removalErrors.length > 0) {
      throw removalErrors[0]
    }
  }

  private forwardEngineEvent<EventName extends keyof AudioEngineEvents>(eventName: EventName): void {
    this.connectEngineEvent(eventName, payload => this.events.emit(eventName, payload as AudioPlayerEvents[EventName]))
  }

  private publishError(error: GAudioError): void {
    if (this.isDisposed) {
      return
    }
    // AI modified: a terminal engine error atomically cancels queued playback lifecycle work.
    this.terminalErrorGeneration += 1
    this.requestedPlayback = 'pause'
    this.playbackIntentId += 1
    const errorLoadRequestId = this.loadRequestId
    const errorPlaybackIntentId = this.playbackIntentId
    this.setState('error')
    if (this.canPublishPlaybackLifecycleEvent('error', errorLoadRequestId, errorPlaybackIntentId)) {
      // AI modified: Media Session can avoid globally reporting an error already delivered to player listeners.
      this.errorPublicationSequence += 1
      this.errorPublicationSequences.set(error, this.errorPublicationSequence)
      this.events.emit('error', error)
    }
  }

  private loadInterruptionError(supersededMessage: string, cause?: unknown): GAudioError {
    // AI modified: permanent disposal is distinguishable from recoverable source supersession.
    return this.isDisposed
      ? new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal', cause)
      : new GAudioError('LOAD_ABORTED', supersededMessage, cause)
  }

  private rejectActiveSourceOperations(error: GAudioError): void {
    if (this.activeLoadEngineOperation) {
      this.rejectPlayerEngineOperation(this.activeLoadEngineOperation, error)
    }
    if (this.activePositionOperation) {
      this.rejectPlayerEngineOperation(this.activePositionOperation, error)
    }
    if (this.activeAdaptiveOperation) {
      this.rejectPlayerEngineOperation(this.activeAdaptiveOperation, error)
    }
  }

  private rejectPlayerEngineOperation(
    activeOperation: ActivePlayerEngineOperation,
    error: GAudioError,
  ): void {
    // AI modified: retain lifecycle ownership even when the engine promise settled just before reentrant bookkeeping.
    activeOperation.terminalError ??= error
    activeOperation.gate.reject(activeOperation.terminalError)
  }

  private resolveActivePlaybackAttempts(
    activePlaybackAttempts: Iterable<ActivePlaybackAttempt> = this.activePlaybackAttempts,
  ): void {
    // AI modified: pause, stop, and source replacement preserve silent play supersession without engine cooperation.
    for (const activePlaybackAttempt of activePlaybackAttempts) {
      activePlaybackAttempt.gate.resolve()
    }
  }

  private rejectActivePlaybackAttempts(error: GAudioError, loadRequestId?: number): void {
    for (const activePlaybackAttempt of this.activePlaybackAttempts) {
      if (loadRequestId !== undefined && activePlaybackAttempt.loadRequestId !== loadRequestId) {
        continue
      }
      activePlaybackAttempt.terminalError ??= error
      activePlaybackAttempt.gate.reject(activePlaybackAttempt.terminalError)
    }
  }

  private async loadCurrentSource(loadRequestId: number): Promise<void> {
    const sources = this.playlistSourceCandidates()
    let loadError: unknown

    for (const source of sources) {
      if (loadRequestId !== this.loadRequestId || this.isDisposed) {
        throw this.loadInterruptionError('Audio load was superseded by a newer operation')
      }

      this.source = source
      this.activeLoadError = undefined
      const activeLoadEngineOperation: ActivePlayerEngineOperation = {
        loadRequestId,
        gate: createEngineOperationGate(),
      }
      this.activeLoadEngineOperation = activeLoadEngineOperation
      observeEngineOperation(
        () => this.engine.load(source, this.sourceLoadOptions),
        activeLoadEngineOperation.gate,
      )

      try {
        await activeLoadEngineOperation.gate.completion
        if (activeLoadEngineOperation.terminalError) {
          throw activeLoadEngineOperation.terminalError
        }
        // AI modified: a superseded fallback loop cannot replace the source selected by a newer load.
        if (loadRequestId !== this.loadRequestId || this.isDisposed) {
          throw this.loadInterruptionError('Audio load was superseded by a newer operation')
        }
        if (this.activeLoadError) {
          // AI modified: a terminal load event cannot be erased when a custom engine resolves its load promise.
          throw this.activeLoadError
        }
        this.activeLoadError = undefined
        return
      }
      catch (error) {
        if (this.isDisposed) {
          throw error instanceof GAudioError && error.code === 'ENGINE_ERROR'
            ? error
            : new GAudioError('ENGINE_ERROR', 'Audio load was interrupted by player disposal', error)
        }
        if (error instanceof GAudioError && error.code === 'LOAD_ABORTED') {
          throw error
        }

        // AI modified: fallback failures only consult fatal events owned by this load request.
        loadError = this.activeLoadRequestId === loadRequestId
          ? this.activeLoadError ?? error
          : error
      }
      finally {
        if (this.activeLoadEngineOperation === activeLoadEngineOperation) {
          this.activeLoadEngineOperation = undefined
        }
      }
    }

    throw loadError
  }

  private playlistSourceCandidates(): AudioSource[] {
    if (this.playlistIndex < 0) {
      return this.source ? [this.source] : []
    }

    const playlistTrack = this.playlist[this.playlistIndex]
    if (!playlistTrack) {
      return this.source ? [this.source] : []
    }

    const audioTrack = this.getSelectedAudioTrack()
    const source = audioTrack?.source ?? playlistTrack.source
    // AI modified: alternate tracks own their fallback chain and must never inherit the primary track's sources.
    const fallbackSources = audioTrack
      ? audioTrack.fallbackSources ?? []
      : playlistTrack.fallbackSources ?? []

    return [
      source,
      ...fallbackSources,
    ].map(sourceInput => this.audioSourceForInput(sourceInput))
  }

  private audioSourceForInput(source: AudioSourceInput): AudioSource {
    return typeof source === 'string' || !('open' in source)
      ? new HttpAudioSource(source)
      : source
  }

  private assertPlaylistIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.playlist.length) {
      throw new RangeError('Playlist index must reference an existing track')
    }
  }

  private activePlaylistTrack(): AudioPlaylistTrack | undefined {
    return this.playlistIndex >= 0 ? this.playlist[this.playlistIndex] : undefined
  }

  private activeMediaSessionMetadata(): AudioMediaSessionMetadata | undefined {
    return this.activePlaylistTrack()?.metadata ?? this.mediaSessionMetadata
  }

  private activePlaylistSource(): AudioSourceInput {
    const playlistTrack = this.activePlaylistTrack()
    if (!playlistTrack) {
      throw new GAudioError('SOURCE_UNAVAILABLE', 'Playlist track is required before selecting a playlist source')
    }

    return this.getSelectedAudioTrack()?.source ?? playlistTrack.source
  }

  private defaultAudioTrackId(playlistTrack: AudioPlaylistTrack): string | undefined {
    const audioTracks = playlistTrack.audioTracks ?? []
    const preferredAudioTrack = playlistTrack.defaultAudioTrackId !== undefined
      ? audioTracks.find(audioTrack => audioTrack.id === playlistTrack.defaultAudioTrackId)
      : undefined

    // AI modified: an empty string is a valid string identifier, not an absent selection.
    return preferredAudioTrack?.id ?? audioTracks[0]?.id
  }

  private continuePlaylistAfterEnded(): void {
    const continuationPlaylist = this.playlist
    const continuationPlaylistIndex = this.playlistIndex + 1
    const continuationLoadRequestId = this.loadRequestId
    const terminalErrorGeneration = this.terminalErrorGeneration
    void this.next({ autoplay: true }).catch((error: unknown) => {
      if (
        this.isDisposed
        || this.playlist !== continuationPlaylist
        || this.playlistIndex !== continuationPlaylistIndex
        || this.terminalErrorGeneration !== terminalErrorGeneration
        || (
          error instanceof GAudioError
          && error.code === 'LOAD_ABORTED'
          && this.loadRequestId !== continuationLoadRequestId + 1
        )
      ) {
        return
      }

      // AI modified: ended auto-navigation has no caller, so publish an otherwise unreported failure once.
      this.publishError(error instanceof GAudioError
        ? error
        : new GAudioError('ENGINE_ERROR', 'Playlist could not continue after the active source ended', error))
    })
  }

  private setState(state: PlaybackState): void {
    if (this.isDisposed || this.state === state) {
      return
    }

    this.state = state
    this.mediaSession?.setPlaybackState(state)
    this.events.emit('statechange', state)
  }

  private canPublishPlaybackLifecycleEvent(
    state: PlaybackState,
    loadRequestId: number,
    playbackIntentId: number,
  ): boolean {
    // AI modified: synchronous state observers can transfer ownership before the originating event is published.
    return !this.isDisposed
      && state === this.state
      && loadRequestId === this.loadRequestId
      && playbackIntentId === this.playbackIntentId
  }

  private updateMediaSessionMetadata(): void {
    this.mediaSession?.setMetadata(this.activeMediaSessionMetadata())
  }

  private updateMediaSessionPosition(): void {
    this.mediaSession?.setPositionState()
  }

  private assertUsable(): void {
    if (this.isDisposed) {
      throw new GAudioError('ENGINE_ERROR', 'AudioPlayer has been disposed')
    }
  }
}
