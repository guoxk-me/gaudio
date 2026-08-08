import type { PlaybackState } from './audio-player-options'
import { GAudioError } from '../errors/errors'

const defaultSeekOffset = 10

const mediaSessionActions = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
] as const satisfies readonly MediaSessionAction[]

const mediaSessionRegistrations = new WeakMap<MediaSession, BrowserMediaSession[]>()

/** Artwork shown by operating-system media controls. */
export interface AudioMediaSessionArtwork {
  /** Absolute or app-relative artwork URL. */
  readonly src: string
  /** Image dimensions such as `512x512`. */
  readonly sizes?: string
  /** MIME type such as `image/png`. */
  readonly type?: string
}

/** Metadata shown in browser, headset, keyboard, and lock-screen media controls. */
export interface AudioMediaSessionMetadata {
  /** Track or program title. */
  readonly title?: string
  /** Artist, host, narrator, or creator name. */
  readonly artist?: string
  /** Album, podcast, audiobook, or collection name. */
  readonly album?: string
  /** Artwork candidates shown by supported system media surfaces. */
  readonly artwork?: readonly AudioMediaSessionArtwork[]
}

/** Configures browser Media Session integration for an {@link AudioPlayer}. */
export interface AudioMediaSessionOptions {
  /**
   * Enables or disables Media Session integration.
   *
   * @defaultValue `true`
   */
  readonly enabled?: boolean
  /** Default metadata used when the active playlist track does not provide metadata. */
  readonly metadata?: AudioMediaSessionMetadata
  /**
   * Seconds moved by headset or system seek-forward and seek-backward actions.
   *
   * @defaultValue `10`
   */
  readonly seekOffset?: number
}

export interface BrowserMediaSessionContext {
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  previous: () => Promise<boolean>
  next: () => Promise<boolean>
  seek: (seconds: number) => Promise<void>
  fastSeek: (seconds: number) => Promise<void>
  getCurrentTime: () => number
  getDuration: () => number
  getPlaybackRate: () => number
  getErrorPublicationSequence: () => number
  wasErrorPublishedSince: (error: unknown, publicationSequence: number) => boolean
}

type BrowserMediaSessionGlobal = typeof globalThis & {
  navigator?: Navigator & { mediaSession?: MediaSession }
  MediaMetadata?: typeof MediaMetadata
  reportError?: (error: unknown) => void
}

/** Browser Media Session adapter used by AudioPlayer. */
export class BrowserMediaSession {
  private readonly context: BrowserMediaSessionContext
  private readonly mediaSession?: MediaSession
  private readonly mediaMetadata?: typeof MediaMetadata
  private readonly seekOffset: number
  private metadata?: AudioMediaSessionMetadata
  private playbackState: PlaybackState = 'idle'
  private isDisposed = false

  constructor(options: AudioMediaSessionOptions, context: BrowserMediaSessionContext) {
    const browserGlobal = globalThis as BrowserMediaSessionGlobal

    this.context = context
    this.mediaSession = options.enabled === false ? undefined : browserGlobal.navigator?.mediaSession
    this.mediaMetadata = browserGlobal.MediaMetadata
    this.seekOffset = Number.isFinite(options.seekOffset) && options.seekOffset && options.seekOffset > 0
      ? options.seekOffset
      : defaultSeekOffset
    this.metadata = options.metadata
      ? {
          title: options.metadata.title,
          artist: options.metadata.artist,
          album: options.metadata.album,
          artwork: options.metadata.artwork?.map(artwork => ({
            src: artwork.src,
            sizes: artwork.sizes,
            type: artwork.type,
          })),
        }
      : undefined

    if (!this.mediaSession) {
      return
    }

    // AI modified: retain live players in ownership order so disposing the latest can restore its predecessor.
    const registrations = mediaSessionRegistrations.get(this.mediaSession) ?? []
    registrations.push(this)
    mediaSessionRegistrations.set(this.mediaSession, registrations)
    try {
      this.restoreMediaSession()
    }
    catch (error) {
      // AI modified: failed ownership activation cannot remain above a live Media Session owner.
      registrations.splice(registrations.lastIndexOf(this), 1)
      if (registrations.length === 0) {
        mediaSessionRegistrations.delete(this.mediaSession)
      }
      for (const action of mediaSessionActions) {
        this.setActionHandler(action, null)
      }
      const previousOwner = registrations.at(-1)
      if (previousOwner) {
        try {
          previousOwner.restoreMediaSession()
        }
        catch {
          // Preserve the activation failure that prevented this owner from being created.
        }
      }
      else {
        this.clearMediaSessionPresentation()
      }
      throw error
    }
  }

  setMetadata(metadata: AudioMediaSessionMetadata | undefined): void {
    if (this.isDisposed || !this.mediaSession) {
      return
    }

    // AI modified: inactive owners retain their latest metadata for a later ownership restoration.
    this.metadata = metadata
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

    if (!this.ownsMediaSession()) {
      return
    }

    try {
      this.showMetadata()
    }
    catch {
      // AI modified: optional system presentation failures must not interrupt player metadata updates.
    }
  }

  setPlaybackState(state: PlaybackState): void {
    if (this.isDisposed || !this.mediaSession) {
      return
    }

    this.playbackState = state
    if (!this.ownsMediaSession()) {
      return
    }

    try {
      this.showPlaybackState()
    }
    catch {
      // AI modified: optional system presentation failures must not interrupt playback state transitions.
    }
  }

  setPositionState(): void {
    if (this.isDisposed || !this.ownsMediaSession() || !this.mediaSession?.setPositionState) {
      return
    }

    const duration = this.context.getDuration()
    if (!Number.isFinite(duration) || duration <= 0) {
      // AI modified: invalid timelines clear the previous owner's position instead of leaking stale progress.
      this.clearPositionState()
      return
    }

    const currentTime = this.context.getCurrentTime()
    const playbackRate = this.context.getPlaybackRate()
    const position = Number.isFinite(currentTime)
      ? Math.min(Math.max(currentTime, 0), duration)
      : 0

    try {
      this.mediaSession.setPositionState({
        duration,
        playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
        position,
      })
    }
    catch {
      // Unsupported or inconsistent position state should not break playback.
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return
    }

    const mediaSession = this.mediaSession
    const wasOwner = this.ownsMediaSession()
    this.isDisposed = true
    if (!mediaSession) {
      return
    }

    const registrations = mediaSessionRegistrations.get(mediaSession)
    const registrationIndex = registrations?.lastIndexOf(this) ?? -1
    if (registrations && registrationIndex >= 0) {
      registrations.splice(registrationIndex, 1)
      if (registrations.length === 0) {
        mediaSessionRegistrations.delete(mediaSession)
      }
    }

    if (!wasOwner) {
      return
    }

    for (const action of mediaSessionActions) {
      this.setActionHandler(action, null)
    }

    const previousOwner = registrations?.at(-1)
    if (previousOwner) {
      previousOwner.restoreMediaSession()
      return
    }

    const disposalErrors: unknown[] = []
    try {
      mediaSession.metadata = null
    }
    catch (error) {
      disposalErrors.push(error)
    }
    try {
      mediaSession.playbackState = 'none'
    }
    catch (error) {
      disposalErrors.push(error)
    }
    this.clearPositionState()

    if (disposalErrors.length > 0) {
      throw disposalErrors[0]
    }
  }

  private attachActionHandlers(): void {
    this.setActionHandler('play', () => {
      this.dispatchOwnedMediaAction(() => this.context.play())
    })
    this.setActionHandler('pause', () => {
      this.dispatchOwnedMediaAction(() => this.context.pause())
    })
    this.setActionHandler('stop', () => {
      this.dispatchOwnedMediaAction(() => this.context.stop())
    })
    this.setActionHandler('previoustrack', () => {
      this.dispatchOwnedMediaAction(() => this.context.previous())
    })
    this.setActionHandler('nexttrack', () => {
      this.dispatchOwnedMediaAction(() => this.context.next())
    })
    this.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? this.seekOffset
      this.dispatchOwnedMediaAction(() => this.seekBy(-offset))
    })
    this.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? this.seekOffset
      this.dispatchOwnedMediaAction(() => this.seekBy(offset))
    })
    this.setActionHandler('seekto', (details) => {
      this.dispatchOwnedMediaAction(() => this.seekTo(details))
    })
  }

  private dispatchOwnedMediaAction(action: () => void | Promise<unknown>): void {
    // AI modified: browser-retained handlers become inert immediately after ownership changes or disposal.
    if (this.isDisposed || !this.ownsMediaSession()) {
      return
    }

    const errorPublicationSequence = this.context.getErrorPublicationSequence()
    try {
      void Promise.resolve(action()).catch(error => this.reportActionFailure(error, errorPublicationSequence))
    }
    catch (error) {
      // AI modified: system actions have no promise caller, so preserve failures through host error reporting.
      this.reportActionFailure(error, errorPublicationSequence)
    }
  }

  private reportActionFailure(error: unknown, errorPublicationSequence: number): void {
    if (this.isDisposed || !this.ownsMediaSession()) {
      // AI modified: a late action from a released owner cannot report expected cancellation into the host.
      return
    }

    if (error instanceof GAudioError && error.code === 'LOAD_ABORTED') {
      // AI modified: a newer source or lifecycle command makes the superseded system action an expected cancellation.
      return
    }

    // AI modified: player-owned load and playback failures already have an observable error-event channel.
    if (this.context.wasErrorPublishedSince(error, errorPublicationSequence)) {
      return
    }

    const errorReporter = (globalThis as BrowserMediaSessionGlobal).reportError
    if (errorReporter) {
      try {
        errorReporter(error)
        return
      }
      catch (reportingError) {
        // AI modified: a broken host reporter cannot throw back through the browser's action dispatcher.
        queueMicrotask(() => {
          throw new AggregateError([error, reportingError], 'Media Session action and error reporter failed')
        })
        return
      }
    }

    queueMicrotask(() => {
      throw error
    })
  }

  private setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
    try {
      this.mediaSession?.setActionHandler(action, handler)
    }
    catch {
      // Some browsers expose Media Session but reject individual action handlers.
    }
  }

  private ownsMediaSession(): boolean {
    if (!this.mediaSession) {
      return false
    }

    return mediaSessionRegistrations.get(this.mediaSession)?.at(-1) === this
  }

  private restoreMediaSession(): void {
    if (this.isDisposed || !this.ownsMediaSession()) {
      return
    }

    // AI modified: restored owners reclaim handlers and their last known system-media presentation.
    this.attachActionHandlers()
    const restorationErrors: unknown[] = []
    try {
      this.showMetadata()
    }
    catch (error) {
      restorationErrors.push(error)
    }
    try {
      this.showPlaybackState()
    }
    catch (error) {
      restorationErrors.push(error)
    }
    try {
      this.setPositionState()
    }
    catch (error) {
      restorationErrors.push(error)
    }

    if (restorationErrors.length > 0) {
      throw restorationErrors[0]
    }
  }

  private showMetadata(): void {
    const mediaSession = this.mediaSession
    const metadata = this.metadata
    if (!mediaSession) {
      return
    }

    if (!metadata || !this.mediaMetadata) {
      mediaSession.metadata = null
      return
    }

    const MediaMetadataConstructor = this.mediaMetadata

    try {
      mediaSession.metadata = new MediaMetadataConstructor({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: metadata.artwork?.map(artwork => ({
          src: artwork.src,
          sizes: artwork.sizes,
          type: artwork.type,
        })),
      })
    }
    catch {
      mediaSession.metadata = null
    }
  }

  private showPlaybackState(): void {
    const mediaSession = this.mediaSession
    if (!mediaSession) {
      return
    }

    if (this.playbackState === 'playing') {
      mediaSession.playbackState = 'playing'
      return
    }

    mediaSession.playbackState = this.playbackState === 'idle' || this.playbackState === 'error'
      ? 'none'
      : 'paused'
  }

  private clearMediaSessionPresentation(): void {
    const mediaSession = this.mediaSession
    if (!mediaSession) {
      return
    }

    try {
      mediaSession.metadata = null
    }
    catch {
      // A failed constructor still preserves its original activation error.
    }
    try {
      mediaSession.playbackState = 'none'
    }
    catch {
      // A failed constructor still preserves its original activation error.
    }
    this.clearPositionState()
  }

  private clearPositionState(): void {
    try {
      this.mediaSession?.setPositionState?.()
    }
    catch {
      // Unsupported position clearing should not break playback or ownership cleanup.
    }
  }

  private async seekBy(offset: number): Promise<void> {
    const duration = this.context.getDuration()
    const maxTime = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
    const nextTime = Math.min(Math.max(this.context.getCurrentTime() + offset, 0), maxTime)

    await this.context.seek(nextTime)
    this.setPositionState()
  }

  private async seekTo(details: MediaSessionActionDetails): Promise<void> {
    if (typeof details.seekTime !== 'number' || !Number.isFinite(details.seekTime)) {
      return
    }

    if (details.fastSeek) {
      await this.context.fastSeek(details.seekTime)
    }
    else {
      await this.context.seek(details.seekTime)
    }

    this.setPositionState()
  }
}
