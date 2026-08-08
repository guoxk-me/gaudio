// @env browser

import type { AdaptiveAudioProtocol, AdaptivePlaybackInfo, AdaptiveQualitySelection, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer, AudioAnalyzerOptions } from '../analysis/audio-analyzer'
import type { AudioProtocol, AudioSource } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type { AudioEngineAdapter } from './audio-engine-adapter'
import type { AudioFormatSupport, PreloadMode, TimeRange } from './audio-engine-types'
import type { EngineOperationGate } from './engine-operation-gate'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { audioProtocolForMimeType, resolveAudioProtocol } from '../source/audio-protocol'
import { audioEngineEventNames } from './audio-engine'
import { createEngineOperationGate, observeEngineOperation } from './engine-operation-gate'
import { MediaElementAudioEngine, mediaElementCleanupStatus } from './media-element-audio-engine'

interface AudioEngineRouterOptions {
  adapters?: readonly AudioEngineAdapter[]
  mediaEngineFactory?: () => AudioEngine
}

interface MediaSettings {
  preload: PreloadMode
  autoplay: boolean
  volume: number
  isMuted: boolean
  isLooping: boolean
  playbackRate: number
  preservesPitch: boolean
}

interface RouterOperation {
  generation: number
  abortController: AbortController
  terminalError?: unknown
}

type RouterControlKind = 'play' | 'position' | 'adaptive'

interface ActiveRouterControl {
  kind: RouterControlKind
  engine: AudioEngine
  engineGeneration: number
  gate: EngineOperationGate
}

const adapterOwners = new WeakMap<AudioEngineAdapter, AudioEngineRouter>()

export class AudioEngineRouter implements AudioEngine {
  private readonly adapters = new Map<AdaptiveAudioProtocol, AudioEngineAdapter>()
  private readonly events = new EventEmitter<AudioEngineEvents>()
  private readonly mediaEngineFactory: () => AudioEngine
  private readonly settings: MediaSettings = {
    preload: 'metadata',
    autoplay: false,
    volume: 1,
    isMuted: false,
    isLooping: false,
    playbackRate: 1,
    preservesPitch: true,
  }

  private readonly settingGenerations: { [SettingName in keyof MediaSettings]: number } = {
    preload: 0,
    autoplay: 0,
    volume: 0,
    isMuted: 0,
    isLooping: 0,
    playbackRate: 0,
    preservesPitch: 0,
  }

  private activeEngine?: AudioEngine
  private activeProtocol?: AudioProtocol
  private mediaCapabilityEngine?: AudioEngine
  private engineGeneration = 0
  private operationGeneration = 0
  private activeOperation?: RouterOperation
  private isDisposed = false
  private readonly pendingEngineDisposals = new Set<AudioEngine>()
  private readonly failedEngineDisposals = new Set<AudioEngine>()
  private readonly activeControls = new Set<ActiveRouterControl>()
  private pendingAdapterFactoryCount = 0
  private removeEngineListeners: Array<() => void> = []

  constructor(options: AudioEngineRouterOptions = {}) {
    this.mediaEngineFactory = options.mediaEngineFactory ?? (() => new MediaElementAudioEngine())
    const adapters = options.adapters ?? []
    const protocols = new Set<AdaptiveAudioProtocol>()
    const adapterRegistrations: Array<{
      adapter: AudioEngineAdapter
      protocol: AdaptiveAudioProtocol
    }> = []

    for (const adapter of adapters) {
      const protocol = adapter.protocol
      if (protocols.has(protocol)) {
        throw new TypeError(`Only one ${protocol} adapter can be registered`)
      }
      if (adapterOwners.has(adapter)) {
        throw new TypeError(`The ${protocol} adapter is already registered with another player`)
      }
      protocols.add(protocol)
      adapterRegistrations.push({ adapter, protocol })
    }

    for (const { adapter, protocol } of adapterRegistrations) {
      // AI modified: protocol access is validated before ownership changes and reused during registration.
      adapterOwners.set(adapter, this)
      this.adapters.set(protocol, adapter)
    }
  }

  async load(source: AudioSource): Promise<void> {
    if (this.isDisposed) {
      throw new GAudioError('ENGINE_ERROR', 'Audio engine router has been disposed')
    }

    // AI modified: a new source promptly terminates controls whose custom-engine promises never settle.
    this.rejectActiveControls(
      new GAudioError('LOAD_ABORTED', 'Audio engine operation was superseded by a newer source'),
    )
    const operation = this.startOperation()
    try {
      const loadStartErrors: unknown[] = []
      try {
        // AI modified: a new load owns event delivery immediately, including while a lazy adapter is still loading.
        this.invalidateEngineSession()
      }
      catch (error) {
        loadStartErrors.push(error)
      }
      const pendingEngines = [...this.pendingEngineDisposals]
      loadStartErrors.push(...this.disposeEngines(pendingEngines))
      if (pendingEngines.length > 0) {
        loadStartErrors.push(...await this.waitForEngineCleanups(pendingEngines, operation))
      }
      if (!this.isCurrentOperation(operation) || this.isDisposed) {
        throw this.loadAbortedError()
      }
      if (loadStartErrors.length > 0) {
        throw loadStartErrors[0]
      }

      const protocol = resolveAudioProtocol(source)
      let engine: AudioEngine
      try {
        engine = await this.engineForProtocol(protocol, operation)
      }
      catch (error) {
        // AI modified: a superseded factory failure belongs to the cancelled load, not the current source.
        if (!this.isCurrentOperation(operation) || this.isDisposed) {
          throw this.loadAbortedError()
        }
        throw error
      }
      if (!this.isCurrentOperation(operation) || this.isDisposed) {
        throw this.loadAbortedError()
      }

      // AI modified: every source load gets a fresh event generation, including same-protocol reuse.
      this.bindEngineSession(engine)
      try {
        await this.waitForOperation(engine.load(source), operation)
      }
      catch (error) {
        if (operation.terminalError) {
          throw operation.terminalError
        }
        // AI modified: late failures from an older engine cannot replace the newer load's cancellation result.
        if (!this.isCurrentOperation(operation) || this.isDisposed) {
          throw this.loadAbortedError()
        }
        throw error
      }
      if (operation.terminalError) {
        throw operation.terminalError
      }
      if (!this.isCurrentOperation(operation) || this.isDisposed) {
        throw this.loadAbortedError()
      }
    }
    finally {
      if (this.activeOperation === operation) {
        this.activeOperation = undefined
      }
    }
  }

  unload(): void {
    // AI modified: unloading invalidates pending engine creation and all events from the old source session.
    this.cancelActiveOperation()
    this.rejectActiveControls(
      new GAudioError('LOAD_ABORTED', 'Audio engine operation was superseded by source removal'),
    )
    const unloadErrors: unknown[] = []
    try {
      this.invalidateEngineSession()
    }
    catch (error) {
      unloadErrors.push(error)
    }
    // AI modified: later lifecycle operations retry engines whose earlier disposal could not finish.
    unloadErrors.push(...this.disposeEngines([...this.pendingEngineDisposals]))
    try {
      this.activeEngine?.unload()
    }
    catch (error) {
      unloadErrors.push(error)
    }
    if (unloadErrors.length > 0) {
      // AI modified: listener cleanup and engine teardown are both attempted before preserving the first failure.
      throw unloadErrors[0]
    }
  }

  async play(): Promise<void> {
    const engine = this.requireActiveEngine()
    await this.runControl('play', engine, () => engine.play())
  }

  pause(): void {
    try {
      this.activeEngine?.pause()
    }
    finally {
      this.rejectActiveControls(
        new GAudioError('LOAD_ABORTED', 'Audio playback was superseded by pause'),
        ['play'],
      )
    }
  }

  stop(): void {
    try {
      this.activeEngine?.stop()
    }
    finally {
      this.rejectActiveControls(
        new GAudioError('LOAD_ABORTED', 'Audio playback or seeking was superseded by stop'),
        ['play', 'position'],
      )
    }
  }

  async seek(seconds: number): Promise<void> {
    const engine = this.requireActiveEngine()
    this.rejectActiveControls(
      new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by a newer seek'),
      ['position'],
    )
    await this.runControl('position', engine, () => engine.seek(seconds))
  }

  async fastSeek(seconds: number): Promise<void> {
    const engine = this.requireActiveEngine()
    this.rejectActiveControls(
      new GAudioError('LOAD_ABORTED', 'Audio seek was superseded by a newer seek'),
      ['position'],
    )
    await this.runControl('position', engine, () => engine.fastSeek(seconds))
  }

  setPreload(preload: PreloadMode): void {
    this.updateMediaSetting('preload', preload, (engine, nextPreload) => {
      engine.setPreload(nextPreload)
    })
  }

  getPreload(): PreloadMode {
    return this.activeEngine?.getPreload() ?? this.settings.preload
  }

  setAutoplay(shouldAutoplay: boolean): void {
    this.updateMediaSetting('autoplay', shouldAutoplay, (engine, nextAutoplay) => {
      engine.setAutoplay(nextAutoplay)
    })
  }

  getAutoplay(): boolean {
    return this.activeEngine?.getAutoplay() ?? this.settings.autoplay
  }

  setVolume(volume: number): void {
    this.updateMediaSetting('volume', volume, (engine, nextVolume) => {
      engine.setVolume(nextVolume)
    })
  }

  getVolume(): number {
    return this.activeEngine?.getVolume() ?? this.settings.volume
  }

  setMuted(isMuted: boolean): void {
    this.updateMediaSetting('isMuted', isMuted, (engine, nextMuted) => {
      engine.setMuted(nextMuted)
    })
  }

  isMuted(): boolean {
    return this.activeEngine?.isMuted() ?? this.settings.isMuted
  }

  setLoop(isLooping: boolean): void {
    this.updateMediaSetting('isLooping', isLooping, (engine, nextLooping) => {
      engine.setLoop(nextLooping)
    })
  }

  isLooping(): boolean {
    return this.activeEngine?.isLooping() ?? this.settings.isLooping
  }

  setPlaybackRate(rate: number): void {
    this.updateMediaSetting('playbackRate', rate, (engine, nextPlaybackRate) => {
      engine.setPlaybackRate(nextPlaybackRate)
    })
  }

  getPlaybackRate(): number {
    return this.activeEngine?.getPlaybackRate() ?? this.settings.playbackRate
  }

  setPreservesPitch(shouldPreservePitch: boolean): void {
    this.updateMediaSetting('preservesPitch', shouldPreservePitch, (engine, nextPreservesPitch) => {
      engine.setPreservesPitch(nextPreservesPitch)
    })
  }

  getPreservesPitch(): boolean {
    return this.activeEngine?.getPreservesPitch() ?? this.settings.preservesPitch
  }

  getCurrentTime(): number {
    return this.activeEngine?.getCurrentTime() ?? 0
  }

  getDuration(): number {
    return this.activeEngine?.getDuration() ?? 0
  }

  isPaused(): boolean {
    return this.activeEngine?.isPaused() ?? true
  }

  isEnded(): boolean {
    return this.activeEngine?.isEnded() ?? false
  }

  isSeeking(): boolean {
    return this.activeEngine?.isSeeking() ?? false
  }

  getBufferedRanges(): readonly TimeRange[] {
    // AI modified: custom engines cannot expose mutable range storage through the routed public boundary.
    return this.activeEngine?.getBufferedRanges().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  getSeekableRanges(): readonly TimeRange[] {
    return this.activeEngine?.getSeekableRanges().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.activeEngine?.getPlayedRanges().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  canPlayType(mimeType: string): AudioFormatSupport {
    if (this.isDisposed) {
      return ''
    }

    const protocol = audioProtocolForMimeType(mimeType)
    if (protocol && protocol !== 'media') {
      // AI modified: adaptive MIME support reflects the adapter that load() will actually select.
      const adapter = this.adapters.get(protocol)
      let isSupported = false
      try {
        isSupported = adapter?.isSupported() ?? false
      }
      catch {
        // AI modified: custom capability probes remain a total query and report no support on failure.
        return ''
      }
      return !this.isDisposed && adapter && adapterOwners.get(adapter) === this && isSupported
        ? 'probably'
        : ''
    }

    const activeEngine = this.activeEngine
    if (activeEngine) {
      let activeSupport: AudioFormatSupport
      try {
        activeSupport = activeEngine.canPlayType(mimeType)
      }
      catch {
        return ''
      }
      if (this.isDisposed || this.activeEngine !== activeEngine) {
        // AI modified: reentrant teardown invalidates the capability result with its producing engine.
        return ''
      }
      if (activeSupport) {
        return activeSupport
      }
    }

    // AI modified: native MIME capability is available before the first source activates an engine.
    try {
      if (!this.mediaCapabilityEngine) {
        const mediaCapabilityEngine = this.mediaEngineFactory()
        if (this.isDisposed) {
          // AI modified: a reentrant factory cannot install browser resources after permanent disposal.
          this.disposeEngines([mediaCapabilityEngine])
          this.releaseAdapterOwnersIfReady()
          return ''
        }
        this.mediaCapabilityEngine = mediaCapabilityEngine
      }
      const mediaCapabilityEngine = this.mediaCapabilityEngine
      const mediaSupport = mediaCapabilityEngine.canPlayType(mimeType)
      return !this.isDisposed && this.mediaCapabilityEngine === mediaCapabilityEngine
        ? mediaSupport
        : ''
    }
    catch {
      return ''
    }
  }

  createAnalyzer(options: AudioAnalyzerOptions = {}): AudioAnalyzer | undefined {
    return this.activeEngine?.createAnalyzer?.(options)
  }

  getActiveAdaptivePlayback(): AdaptivePlaybackInfo | undefined {
    const activePlayback = this.activeEngine?.getActiveAdaptivePlayback?.()
    // AI modified: routed adaptive diagnostics cannot expose mutable custom-engine state.
    return activePlayback
      ? {
          protocol: activePlayback.protocol,
          implementation: activePlayback.implementation,
        }
      : undefined
  }

  getAdaptiveVariants(): readonly AdaptiveVariant[] {
    const variants = this.activeEngine?.getAdaptiveVariants?.() ?? []
    // AI modified: routed engine metadata remains isolated from callers and higher-level consumers.
    return variants.map(variant => ({
      id: variant.id,
      bitrate: variant.bitrate,
      codecs: variant.codecs,
    }))
  }

  getAdaptiveQualitySelection(): AdaptiveQualitySelection {
    return this.activeEngine?.getAdaptiveQualitySelection?.() ?? 'auto'
  }

  async setAdaptiveQuality(variantId: AdaptiveQualitySelection): Promise<void> {
    const engine = this.requireActiveEngine()
    const selectAdaptiveQuality = engine.setAdaptiveQuality
    if (!selectAdaptiveQuality) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'Adaptive quality selection is unavailable for the active source')
    }

    this.rejectActiveControls(
      new GAudioError('LOAD_ABORTED', 'Adaptive quality selection was superseded by a newer selection'),
      ['adaptive'],
    )
    await this.runControl('adaptive', engine, () => selectAdaptiveQuality.call(engine, variantId))
  }

  on<EventName extends keyof AudioEngineEvents>(
    eventName: EventName,
    handler: (payload: AudioEngineEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    if (this.isDisposed) {
      const retryErrors: unknown[] = []
      try {
        // AI modified: repeated disposal also retries transient engine-listener cleanup failures.
        this.invalidateEngineSession()
      }
      catch (error) {
        retryErrors.push(error)
      }
      retryErrors.push(...this.disposeEngines([...this.pendingEngineDisposals]))
      this.releaseAdapterOwnersIfReady()
      if (retryErrors.length > 0) {
        // AI modified: logical disposal stays permanent while unfinished engine cleanup remains retryable.
        throw retryErrors[0]
      }
      return
    }

    // AI modified: permanent disposal invalidates in-flight adapter factories before releasing ownership.
    this.isDisposed = true
    this.cancelActiveOperation()
    this.rejectActiveControls(new GAudioError('ENGINE_ERROR', 'Audio engine router has been disposed'))
    const disposalErrors: unknown[] = []
    try {
      this.invalidateEngineSession()
    }
    catch (error) {
      disposalErrors.push(error)
    }

    const activeEngine = this.activeEngine
    const mediaCapabilityEngine = this.mediaCapabilityEngine
    this.activeEngine = undefined
    this.activeProtocol = undefined
    this.mediaCapabilityEngine = undefined

    // AI modified: one failing engine cannot prevent remaining cleanup, and every failed owner stays retryable.
    disposalErrors.push(...this.disposeEngines([
      ...this.pendingEngineDisposals,
      ...(activeEngine ? [activeEngine] : []),
      ...(mediaCapabilityEngine ? [mediaCapabilityEngine] : []),
    ]))
    this.releaseAdapterOwnersIfReady()
    this.events.clear()

    if (disposalErrors.length > 0) {
      throw disposalErrors[0]
    }
  }

  private async engineForProtocol(protocol: AudioProtocol, operation: RouterOperation): Promise<AudioEngine> {
    if (this.activeEngine && this.activeProtocol === protocol) {
      return this.activeEngine
    }

    // AI modified: protocol factories cannot overlap the retiring built-in engine's resource barrier.
    await this.retireActiveEngine(operation)
    if (!this.isCurrentOperation(operation) || this.isDisposed) {
      throw this.loadAbortedError()
    }

    let engine: AudioEngine
    if (protocol === 'media') {
      engine = this.mediaCapabilityEngine ?? this.mediaEngineFactory()
      this.mediaCapabilityEngine = undefined
    }
    else {
      const adapter = this.adapters.get(protocol)
      if (!adapter) {
        throw new GAudioError('ADAPTER_UNAVAILABLE', `No ${protocol.toUpperCase()} adapter is registered`)
      }
      const isSupported = adapter.isSupported()
      if (
        !this.isCurrentOperation(operation)
        || this.isDisposed
        || adapterOwners.get(adapter) !== this
      ) {
        // AI modified: a reentrant support check cannot create through an adapter whose ownership changed.
        throw this.loadAbortedError()
      }
      if (!isSupported) {
        throw new GAudioError('PROTOCOL_UNSUPPORTED', `${protocol.toUpperCase()} playback is not supported in this browser`)
      }
      // AI modified: DASH loads dash.js lazily so importing gaudio/dash is SSR-safe.
      engine = await this.createAdapterEngine(adapter, operation)
    }

    if (!this.isCurrentOperation(operation) || this.isDisposed) {
      if (engine !== this.activeEngine) {
        // AI modified: stale factories retain failed cleanup for the next router lifecycle operation.
        this.disposeEngines([engine])
      }
      throw this.loadAbortedError()
    }

    await this.replaceActiveEngine(engine, protocol, operation)
    return engine
  }

  private async retireActiveEngine(operation: RouterOperation): Promise<void> {
    const previousEngine = this.activeEngine
    if (!previousEngine) {
      return
    }

    this.activeEngine = undefined
    this.activeProtocol = undefined
    const retirementErrors: unknown[] = []
    try {
      this.invalidateEngineSession()
    }
    catch (error) {
      retirementErrors.push(error)
    }
    retirementErrors.push(...this.disposeEngines([previousEngine]))
    retirementErrors.push(...await this.waitForEngineCleanups([previousEngine], operation))
    if (!this.isCurrentOperation(operation) || this.isDisposed) {
      throw this.loadAbortedError()
    }
    if (retirementErrors.length > 0) {
      throw retirementErrors[0]
    }
  }

  private async replaceActiveEngine(
    engine: AudioEngine,
    protocol: AudioProtocol,
    operation: RouterOperation,
  ): Promise<void> {
    // AI modified: advance the generation before disposal so late vendor events cannot reach the player.
    const previousEngine = this.activeEngine
    this.activeEngine = undefined
    this.activeProtocol = undefined
    let replacementError: unknown
    let hasReplacementError = false
    try {
      this.invalidateEngineSession()
    }
    catch (error) {
      replacementError = error
      hasReplacementError = true
    }
    const previousEngines = previousEngine ? [previousEngine] : []
    const previousDisposalErrors = this.disposeEngines(previousEngines)
    if (!hasReplacementError && previousDisposalErrors.length > 0) {
      replacementError = previousDisposalErrors[0]
      hasReplacementError = true
    }
    if (previousEngines.length > 0) {
      const previousCleanupErrors = await this.waitForEngineCleanups(previousEngines, operation)
      if (!hasReplacementError && previousCleanupErrors.length > 0) {
        replacementError = previousCleanupErrors[0]
        hasReplacementError = true
      }
    }
    if (!this.isCurrentOperation(operation) || this.isDisposed) {
      // AI modified: a superseding operation owns the transition while the uncommitted engine is retired.
      this.disposeEngines([engine])
      throw this.loadAbortedError()
    }
    if (hasReplacementError) {
      // AI modified: a failed engine transition disposes the uncommitted replacement instead of leaking it.
      this.disposeEngines([engine])
      throw replacementError
    }

    this.activeEngine = engine
    this.activeProtocol = protocol
    try {
      this.applySettings(engine)
    }
    catch (error) {
      if (
        this.isCurrentOperation(operation)
        && !this.isDisposed
        && this.activeEngine === engine
      ) {
        this.activeEngine = undefined
        this.activeProtocol = undefined
        // AI modified: only the current transition may retire an engine after a settings failure.
        this.disposeEngines([engine])
      }
      throw error
    }
  }

  private bindEngineSession(engine: AudioEngine): void {
    this.invalidateEngineSession()
    this.bindActiveEngineEvents(engine, this.engineGeneration)
  }

  private invalidateEngineSession(): void {
    this.engineGeneration += 1
    this.removeActiveEngineListeners()
  }

  private applySettings(engine: AudioEngine): void {
    engine.setPreload(this.settings.preload)
    engine.setAutoplay(this.settings.autoplay)
    engine.setVolume(this.settings.volume)
    engine.setMuted(this.settings.isMuted)
    engine.setLoop(this.settings.isLooping)
    engine.setPlaybackRate(this.settings.playbackRate)
    engine.setPreservesPitch(this.settings.preservesPitch)
  }

  private updateMediaSetting<SettingName extends keyof MediaSettings>(
    settingName: SettingName,
    nextSetting: MediaSettings[SettingName],
    setOnEngine: (engine: AudioEngine, setting: MediaSettings[SettingName]) => void,
  ): void {
    const previousSetting = this.settings[settingName]
    const previousSettingGeneration = this.settingGenerations[settingName]
    const settingGeneration = previousSettingGeneration + 1
    this.settingGenerations[settingName] = settingGeneration
    this.settings[settingName] = nextSetting
    const activeEngine = this.activeEngine
    try {
      if (activeEngine) {
        setOnEngine(activeEngine, nextSetting)
      }
    }
    catch (error) {
      // AI modified: a rejected write restores its value and prior reentrant owner only while it owns the slot.
      if (this.settingGenerations[settingName] === settingGeneration) {
        this.settings[settingName] = previousSetting
        this.settingGenerations[settingName] = previousSettingGeneration
      }
      throw error
    }
  }

  private bindActiveEngineEvents(engine: AudioEngine, generation: number): void {
    const sessionListeners: Array<() => void> = []
    const forward = <EventName extends keyof AudioEngineEvents>(eventName: EventName): void => {
      const removeListener = engine.on(eventName, (payload) => {
        if (generation === this.engineGeneration) {
          const activeOperation = this.activeOperation
          this.events.emit(eventName, payload)
          if (eventName === 'error') {
            // AI modified: one fatal engine event promptly terminates routed controls with the same error identity.
            this.rejectActiveControls(
              payload as AudioEngineEvents['error'],
              undefined,
              engine,
              generation,
            )
            if (
              activeOperation
              && this.activeOperation === activeOperation
              && generation === this.engineGeneration
            ) {
              // AI modified: routed loads do not wait forever when their active engine emits a fatal error.
              activeOperation.terminalError ??= payload
              activeOperation.abortController.abort()
            }
          }
        }
      })
      if (generation !== this.engineGeneration || this.isDisposed) {
        try {
          // AI modified: reentrant lifecycle changes cannot leave a just-created stale subscription behind.
          removeListener()
        }
        catch {
          this.removeEngineListeners.push(removeListener)
        }
        throw this.loadAbortedError()
      }
      sessionListeners.push(removeListener)
    }

    try {
      for (const eventName of audioEngineEventNames) {
        forward(eventName)
      }
    }
    catch (bindingError) {
      // AI modified: a partially bound custom engine cannot retain a live event session after setup fails.
      this.engineGeneration += 1
      for (const removeListener of sessionListeners.reverse()) {
        try {
          removeListener()
        }
        catch {
          // AI modified: failed partial-binding cleanup remains retryable by the next router lifecycle.
          this.removeEngineListeners.push(removeListener)
        }
      }
      throw bindingError
    }
    this.removeEngineListeners.push(...sessionListeners)
  }

  private removeActiveEngineListeners(): void {
    const removeEngineListeners = this.removeEngineListeners
    this.removeEngineListeners = []
    const failedListenerRemovals: Array<() => void> = []
    let firstRemovalError: unknown
    let hasRemovalError = false
    for (const removeListener of removeEngineListeners) {
      try {
        removeListener()
      }
      catch (error) {
        // AI modified: all engine subscriptions are attempted even when a custom unsubscribe callback fails.
        failedListenerRemovals.push(removeListener)
        if (!hasRemovalError) {
          firstRemovalError = error
          hasRemovalError = true
        }
      }
    }
    this.removeEngineListeners.push(...failedListenerRemovals)
    if (hasRemovalError) {
      throw firstRemovalError
    }
  }

  private disposeEngines(engines: readonly AudioEngine[]): unknown[] {
    const disposalErrors: unknown[] = []
    for (const engine of new Set(engines)) {
      let hasDisposalError = false
      try {
        engine.dispose()
        this.failedEngineDisposals.delete(engine)
      }
      catch (error) {
        // AI modified: cleanup failures remain strongly owned until a later lifecycle operation succeeds.
        hasDisposalError = true
        this.failedEngineDisposals.add(engine)
        this.pendingEngineDisposals.add(engine)
        disposalErrors.push(error)
      }

      const cleanupStatus = mediaElementCleanupStatus(engine)
      if (cleanupStatus) {
        // AI modified: pending and contained failures retain the engine until every built-in resource settles.
        this.pendingEngineDisposals.add(engine)
        this.observeEngineCleanup(engine, cleanupStatus.completion)
        if (cleanupStatus.state === 'failed' && !hasDisposalError) {
          // AI modified: cleanup that failed synchronously is observable by the initiating router lifecycle call.
          disposalErrors.push(cleanupStatus.error)
        }
      }
      else if (!hasDisposalError) {
        this.pendingEngineDisposals.delete(engine)
      }
    }
    return disposalErrors
  }

  private async createAdapterEngine(
    adapter: AudioEngineAdapter,
    operation: RouterOperation,
  ): Promise<AudioEngine> {
    this.pendingAdapterFactoryCount += 1
    let factory: Promise<AudioEngine>
    try {
      factory = Promise.resolve(adapter.createEngine())
    }
    catch (error) {
      this.pendingAdapterFactoryCount -= 1
      this.releaseAdapterOwnersIfReady()
      throw error
    }

    const observedFactory = factory.then(
      (engine) => {
        this.pendingAdapterFactoryCount -= 1
        if (!this.isCurrentOperation(operation) || this.isDisposed) {
          // AI modified: late factory results remain observed and owned through their complete retirement.
          this.disposeEngines([engine])
          this.releaseAdapterOwnersIfReady()
          throw this.loadAbortedError()
        }
        this.releaseAdapterOwnersIfReady()
        return engine
      },
      (error) => {
        this.pendingAdapterFactoryCount -= 1
        this.releaseAdapterOwnersIfReady()
        throw error
      },
    )
    void observedFactory.catch(() => {})
    return this.waitForOperation(observedFactory, operation)
  }

  private async waitForEngineCleanups(
    engines: readonly AudioEngine[],
    operation: RouterOperation,
  ): Promise<unknown[]> {
    const cleanupWaits = [...new Set(engines)].map(async (engine) => {
      while (true) {
        const cleanupStatus = mediaElementCleanupStatus(engine)
        if (!cleanupStatus) {
          return
        }
        await cleanupStatus.completion
      }
    })
    if (cleanupWaits.length === 0) {
      return []
    }

    const cleanupOutcomes = await this.waitForOperation(Promise.allSettled(cleanupWaits), operation)
    return cleanupOutcomes.flatMap(cleanupOutcome =>
      cleanupOutcome.status === 'rejected' ? [cleanupOutcome.reason] : [],
    )
  }

  private observeEngineCleanup(engine: AudioEngine, cleanup: Promise<void>): void {
    void cleanup.then(
      () => {
        if (!mediaElementCleanupStatus(engine) && !this.failedEngineDisposals.has(engine)) {
          this.pendingEngineDisposals.delete(engine)
        }
        this.releaseAdapterOwnersIfReady()
      },
      () => {
        // The retained engine is retried by the next load, unload, or dispose.
      },
    )
  }

  private startOperation(): RouterOperation {
    this.activeOperation?.abortController.abort()
    const operation: RouterOperation = {
      generation: ++this.operationGeneration,
      abortController: new AbortController(),
    }
    this.activeOperation = operation
    return operation
  }

  private cancelActiveOperation(): void {
    this.operationGeneration += 1
    this.activeOperation?.abortController.abort()
    this.activeOperation = undefined
  }

  private isCurrentOperation(operation: RouterOperation): boolean {
    return operation.generation === this.operationGeneration
  }

  private waitForOperation<OperationResult>(
    operationPromise: Promise<OperationResult>,
    operation: RouterOperation,
  ): Promise<OperationResult> {
    return new Promise<OperationResult>((resolve, reject) => {
      let hasFinishedWait = false
      let handleAbort = (): void => {}
      const finishWait = (
        hasOperationResult: boolean,
        operationResult: OperationResult | undefined,
        error?: unknown,
      ): void => {
        if (hasFinishedWait) {
          return
        }
        hasFinishedWait = true
        operation.abortController.signal.removeEventListener('abort', handleAbort)
        if (hasOperationResult) {
          resolve(operationResult as OperationResult)
        }
        else {
          reject(error)
        }
      }
      handleAbort = (): void => finishWait(
        false,
        undefined,
        operation.terminalError ?? this.loadAbortedError(),
      )
      operation.abortController.signal.addEventListener('abort', handleAbort, { once: true })
      if (operation.abortController.signal.aborted) {
        handleAbort()
      }
      void operationPromise.then(
        operationResult => finishWait(true, operationResult),
        error => finishWait(false, undefined, error),
      )
    })
  }

  private releaseAdapterOwnersIfReady(): void {
    if (!this.isDisposed || this.pendingAdapterFactoryCount > 0) {
      return
    }
    if (this.pendingEngineDisposals.size > 0 || this.removeEngineListeners.length > 0) {
      return
    }

    for (const adapter of this.adapters.values()) {
      if (adapterOwners.get(adapter) === this) {
        adapterOwners.delete(adapter)
      }
    }
  }

  private requireActiveEngine(): AudioEngine {
    if (this.isDisposed) {
      throw new GAudioError('ENGINE_ERROR', 'Audio engine router has been disposed')
    }
    if (!this.activeEngine) {
      throw new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before playback')
    }
    return this.activeEngine
  }

  private async runControl(
    kind: RouterControlKind,
    engine: AudioEngine,
    startControl: () => Promise<void>,
  ): Promise<void> {
    const activeControl: ActiveRouterControl = {
      kind,
      engine,
      engineGeneration: this.engineGeneration,
      gate: createEngineOperationGate(),
    }
    this.activeControls.add(activeControl)
    observeEngineOperation(startControl, activeControl.gate)

    try {
      await activeControl.gate.completion
      this.assertEngineOperationCurrent(engine, activeControl.engineGeneration)
    }
    finally {
      this.activeControls.delete(activeControl)
    }
  }

  private rejectActiveControls(
    error: unknown,
    kinds?: readonly RouterControlKind[],
    engine?: AudioEngine,
    engineGeneration?: number,
  ): void {
    for (const activeControl of this.activeControls) {
      if (
        (kinds && !kinds.includes(activeControl.kind))
        || (engine && activeControl.engine !== engine)
        || (engineGeneration !== undefined && activeControl.engineGeneration !== engineGeneration)
      ) {
        continue
      }
      activeControl.gate.reject(error)
    }
  }

  private assertEngineOperationCurrent(engine: AudioEngine, engineGeneration: number): void {
    if (this.isDisposed) {
      throw new GAudioError('ENGINE_ERROR', 'Audio engine router has been disposed')
    }
    if (this.activeEngine !== engine || this.engineGeneration !== engineGeneration) {
      throw new GAudioError('LOAD_ABORTED', 'Audio engine operation was superseded by a newer source')
    }
  }

  private loadAbortedError(): GAudioError {
    return new GAudioError('LOAD_ABORTED', 'Audio load was superseded by a newer source')
  }
}
