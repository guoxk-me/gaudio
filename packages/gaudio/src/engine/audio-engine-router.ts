// @env browser

import type { AdaptiveAudioProtocol, AdaptivePlaybackInfo, AdaptiveQualitySelection, AdaptiveVariant } from '../adapters/adaptive-audio-types'
import type { AudioAnalyzer, AudioAnalyzerOptions } from '../analysis/audio-analyzer'
import type { AudioProtocol, AudioSource } from '../source/audio-source'
import type { AudioEngine, AudioEngineEvents } from './audio-engine'
import type { AudioEngineAdapter } from './audio-engine-adapter'
import type { AudioEngineLoadOptions, AudioFormatSupport, PreloadMode, TimeRange } from './audio-engine-types'
import type { EngineOperationGate } from './engine-operation-gate'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/event-emitter'
import { audioProtocolForMimeType, resolveAudioProtocol } from '../source/audio-protocol'
import { audioEngineEventNames } from './audio-engine'
import { createEngineOperationGate, observeEngineOperation } from './engine-operation-gate'
import { MediaElementAudioEngine } from './media-element-audio-engine'

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
  private readonly activeEngineDisposals = new Map<AudioEngine, Promise<void>>()
  private readonly pendingEngineFactories = new Set<Promise<AudioEngine>>()
  private readonly pendingFactoryCleanupErrors: unknown[] = []
  private activeDisposal?: Promise<void>
  private readonly activeControls = new Set<ActiveRouterControl>()
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

  async load(source: AudioSource, options?: AudioEngineLoadOptions): Promise<void> {
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
      loadStartErrors.push(...await this.disposeEngines(pendingEngines))
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
        // AI modified: per-load request policy reaches the selected engine without becoming router state.
        await this.waitForOperation(engine.load(source, options), operation)
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
    // AI modified: unload starts retryable cleanup; the next asynchronous load or disposal waits for it.
    void this.disposeEngines([...this.pendingEngineDisposals])
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
    // AI modified: synchronous engine listeners can create new controls that this older pause must not cancel.
    const supersededControls = [...this.activeControls]
    try {
      this.activeEngine?.pause()
    }
    finally {
      this.rejectActiveControls(
        new GAudioError('LOAD_ABORTED', 'Audio playback was superseded by pause'),
        ['play'],
        { controls: supersededControls },
      )
    }
  }

  stop(): void {
    // AI modified: capture older work before engine callbacks can issue a newer play or seek.
    const supersededControls = [...this.activeControls]
    try {
      this.activeEngine?.stop()
    }
    finally {
      this.rejectActiveControls(
        new GAudioError('LOAD_ABORTED', 'Audio playback or seeking was superseded by stop'),
        ['play', 'position'],
        { controls: supersededControls },
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
    // AI modified: routed engines may provide exact seeking without a browser-specific optimized path.
    await this.runControl('position', engine, () => engine.fastSeek ? engine.fastSeek(seconds) : engine.seek(seconds))
  }

  setPreload(preload: PreloadMode): void {
    this.updateMediaSetting('preload', preload, (engine, nextPreload) => {
      engine.setPreload?.(nextPreload)
    })
  }

  getPreload(): PreloadMode {
    return this.activeEngine?.getPreload?.() ?? this.settings.preload
  }

  setAutoplay(shouldAutoplay: boolean): void {
    this.updateMediaSetting('autoplay', shouldAutoplay, (engine, nextAutoplay) => {
      engine.setAutoplay?.(nextAutoplay)
    })
  }

  getAutoplay(): boolean {
    return this.activeEngine?.getAutoplay?.() ?? this.settings.autoplay
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
    return this.activeEngine?.getSeekableRanges?.().map(range => ({
      start: range.start,
      end: range.end,
    })) ?? []
  }

  getPlayedRanges(): readonly TimeRange[] {
    return this.activeEngine?.getPlayedRanges?.().map(range => ({
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
        activeSupport = activeEngine.canPlayType?.(mimeType) ?? ''
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
          void this.disposeEngines([mediaCapabilityEngine])
          this.releaseAdapterOwnersIfReady()
          return ''
        }
        this.mediaCapabilityEngine = mediaCapabilityEngine
      }
      const mediaCapabilityEngine = this.mediaCapabilityEngine
      const mediaSupport = mediaCapabilityEngine.canPlayType?.(mimeType) ?? ''
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

  dispose(): Promise<void> {
    if (this.activeDisposal) {
      return this.activeDisposal
    }

    const disposalErrors: unknown[] = []
    let engines: AudioEngine[]
    if (this.isDisposed) {
      try {
        // AI modified: repeated disposal also retries transient engine-listener cleanup failures.
        this.invalidateEngineSession()
      }
      catch (error) {
        disposalErrors.push(error)
      }
      engines = [...this.pendingEngineDisposals]
    }
    else {
      // AI modified: permanent disposal invalidates in-flight adapter factories before releasing ownership.
      this.isDisposed = true
      this.cancelActiveOperation()
      this.rejectActiveControls(new GAudioError('ENGINE_ERROR', 'Audio engine router has been disposed'))
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
      engines = [
        ...this.pendingEngineDisposals,
        ...(activeEngine ? [activeEngine] : []),
        ...(mediaCapabilityEngine ? [mediaCapabilityEngine] : []),
      ]
      this.events.clear()
    }

    const engineFactories = [...this.pendingEngineFactories]
    if (engines.length === 0 && engineFactories.length === 0) {
      this.releaseAdapterOwnersIfReady()
    }
    const cleanup = this.finishDisposal(engines, engineFactories, disposalErrors)
    // AI modified: concurrent router disposal shares factories and engine cleanup without duplicate vendor teardown.
    const activeDisposal = cleanup.finally(() => {
      if (this.activeDisposal === activeDisposal) {
        this.activeDisposal = undefined
      }
    })
    this.activeDisposal = activeDisposal
    return activeDisposal
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

    if (protocol === 'media') {
      const mediaCapabilityEngine = this.mediaCapabilityEngine
      if (mediaCapabilityEngine) {
        this.mediaCapabilityEngine = undefined
        this.activateEngine(mediaCapabilityEngine, protocol, operation)
        return mediaCapabilityEngine
      }
      return this.createProtocolEngine(this.mediaEngineFactory, protocol, operation)
    }

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
    return this.createProtocolEngine(() => adapter.createEngine(), protocol, operation)
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
    retirementErrors.push(...await this.waitForOperation(this.disposeEngines([previousEngine]), operation))
    if (!this.isCurrentOperation(operation) || this.isDisposed) {
      throw this.loadAbortedError()
    }
    if (retirementErrors.length > 0) {
      throw retirementErrors[0]
    }
  }

  private activateEngine(
    engine: AudioEngine,
    protocol: AudioProtocol,
    operation: RouterOperation,
  ): void {
    // AI modified: creation transfers ownership synchronously after the previous engine has already retired.
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
        void this.disposeEngines([engine])
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
    // AI modified: browser-fetch and native-autoplay hints do not add requirements to core custom engines.
    engine.setPreload?.(this.settings.preload)
    engine.setAutoplay?.(this.settings.autoplay)
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
          // AI modified: observable engine changes become the settings applied to the next protocol engine.
          if (eventName === 'volumechange') {
            const volumeUpdate = payload as AudioEngineEvents['volumechange']
            this.settings.volume = volumeUpdate.volume
            this.settings.isMuted = volumeUpdate.isMuted
            this.settingGenerations.volume += 1
            this.settingGenerations.isMuted += 1
          }
          else if (eventName === 'ratechange') {
            const rateUpdate = payload as AudioEngineEvents['ratechange']
            this.settings.playbackRate = rateUpdate.playbackRate
            this.settingGenerations.playbackRate += 1
          }
          const activeOperation = this.activeOperation
          this.events.emit(eventName, payload)
          if (eventName === 'error') {
            // AI modified: one fatal engine event promptly terminates routed controls with the same error identity.
            this.rejectActiveControls(
              payload as AudioEngineEvents['error'],
              undefined,
              { engine, engineGeneration: generation },
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

  private async disposeEngines(engines: readonly AudioEngine[]): Promise<unknown[]> {
    const disposalOutcomes = await Promise.allSettled(
      [...new Set(engines)].map(engine => this.disposeEngine(engine)),
    )
    return disposalOutcomes.flatMap(disposalOutcome =>
      disposalOutcome.status === 'rejected' ? [disposalOutcome.reason] : [],
    )
  }

  private disposeEngine(engine: AudioEngine): Promise<void> {
    const activeDisposal = this.activeEngineDisposals.get(engine)
    if (activeDisposal) {
      return activeDisposal
    }

    this.pendingEngineDisposals.add(engine)
    let engineDisposal: Promise<void>
    try {
      engineDisposal = Promise.resolve(engine.dispose())
    }
    catch (error) {
      engineDisposal = Promise.reject(error)
    }

    const observedDisposal = engineDisposal.then(() => {
      this.pendingEngineDisposals.delete(engine)
    }).finally(() => {
      if (this.activeEngineDisposals.get(engine) === observedDisposal) {
        this.activeEngineDisposals.delete(engine)
      }
      this.releaseAdapterOwnersIfReady()
    })
    // AI modified: the engine contract itself is the only cleanup completion signal the router observes.
    this.activeEngineDisposals.set(engine, observedDisposal)
    void observedDisposal.catch(() => {})
    return observedDisposal
  }

  private async finishDisposal(
    engines: readonly AudioEngine[],
    engineFactories: readonly Promise<AudioEngine>[],
    disposalErrors: unknown[],
  ): Promise<void> {
    disposalErrors.push(...await this.disposeEngines(engines))
    await Promise.allSettled(engineFactories)
    disposalErrors.push(...this.pendingFactoryCleanupErrors.splice(0))
    this.releaseAdapterOwnersIfReady()
    if (disposalErrors.length > 0) {
      // AI modified: logical disposal stays permanent while unfinished engine cleanup remains retryable.
      throw disposalErrors[0]
    }
  }

  private createProtocolEngine(
    createEngine: () => AudioEngine | Promise<AudioEngine>,
    protocol: AudioProtocol,
    operation: RouterOperation,
  ): Promise<AudioEngine> {
    const creationGate = createEngineOperationGate<AudioEngine>()
    const observedFactory = creationGate.completion.then(
      async (engine) => {
        if (!this.isCurrentOperation(operation) || this.isDisposed) {
          // AI modified: late factory results remain observed and owned through their complete retirement.
          const cleanupErrors = await this.disposeEngines([engine])
          this.pendingFactoryCleanupErrors.push(...cleanupErrors)
          this.releaseAdapterOwnersIfReady()
          throw this.loadAbortedError()
        }
        // AI modified: the factory keeps ownership until the active slot accepts its result without another await.
        this.activateEngine(engine, protocol, operation)
        return engine
      },
    )
    this.pendingEngineFactories.add(observedFactory)
    void observedFactory.then(
      () => {
        this.pendingEngineFactories.delete(observedFactory)
        this.releaseAdapterOwnersIfReady()
      },
      () => {
        this.pendingEngineFactories.delete(observedFactory)
        this.releaseAdapterOwnersIfReady()
      },
    )
    // AI modified: reentrant disposal can wait for this factory before user factory code creates resources.
    observeEngineOperation(() => Promise.resolve(createEngine()), creationGate)
    return this.waitForOperation(observedFactory, operation)
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
    if (!this.isDisposed || this.pendingEngineFactories.size > 0) {
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
    controlScope: {
      controls?: readonly ActiveRouterControl[]
      engine?: AudioEngine
      engineGeneration?: number
    } = {},
  ): void {
    for (const activeControl of controlScope.controls ?? this.activeControls) {
      if (
        (kinds && !kinds.includes(activeControl.kind))
        || (controlScope.engine && activeControl.engine !== controlScope.engine)
        || (controlScope.engineGeneration !== undefined && activeControl.engineGeneration !== controlScope.engineGeneration)
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
