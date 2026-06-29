import type { PlaybackState } from './audio-player-options'

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
}

type BrowserMediaSessionGlobal = typeof globalThis & {
  navigator?: Navigator & { mediaSession?: MediaSession }
  MediaMetadata?: typeof MediaMetadata
}

/** Browser Media Session adapter used by AudioPlayer. */
export class BrowserMediaSession {
  private readonly context: BrowserMediaSessionContext
  private readonly mediaSession?: MediaSession
  private readonly mediaMetadata?: typeof MediaMetadata
  private readonly seekOffset: number

  constructor(options: AudioMediaSessionOptions, context: BrowserMediaSessionContext) {
    const browserGlobal = globalThis as BrowserMediaSessionGlobal

    this.context = context
    this.mediaSession = options.enabled === false ? undefined : browserGlobal.navigator?.mediaSession
    this.mediaMetadata = browserGlobal.MediaMetadata
    this.seekOffset = Number.isFinite(options.seekOffset) && options.seekOffset && options.seekOffset > 0
      ? options.seekOffset
      : defaultSeekOffset

    if (!this.mediaSession) {
      return
    }

    // AI modified: Media Session action handlers are optional browser integrations around existing player controls.
    this.attachActionHandlers()
    this.setMetadata(options.metadata)
  }

  setMetadata(metadata: AudioMediaSessionMetadata | undefined): void {
    if (!this.mediaSession) {
      return
    }

    if (!metadata || !this.mediaMetadata) {
      this.mediaSession.metadata = null
      return
    }

    const MediaMetadataConstructor = this.mediaMetadata

    try {
      this.mediaSession.metadata = new MediaMetadataConstructor({
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
      this.mediaSession.metadata = null
    }
  }

  setPlaybackState(state: PlaybackState): void {
    if (!this.mediaSession) {
      return
    }

    if (state === 'playing') {
      this.mediaSession.playbackState = 'playing'
      return
    }

    this.mediaSession.playbackState = state === 'idle' || state === 'error'
      ? 'none'
      : 'paused'
  }

  setPositionState(): void {
    if (!this.mediaSession?.setPositionState) {
      return
    }

    const duration = this.context.getDuration()
    if (!Number.isFinite(duration) || duration <= 0) {
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
    if (!this.mediaSession) {
      return
    }

    for (const action of mediaSessionActions) {
      this.setActionHandler(action, null)
    }

    this.mediaSession.metadata = null
    this.mediaSession.playbackState = 'none'
  }

  private attachActionHandlers(): void {
    this.setActionHandler('play', () => {
      void this.context.play().catch(() => {})
    })
    this.setActionHandler('pause', () => this.context.pause())
    this.setActionHandler('stop', () => this.context.stop())
    this.setActionHandler('previoustrack', () => {
      void this.context.previous().catch(() => {})
    })
    this.setActionHandler('nexttrack', () => {
      void this.context.next().catch(() => {})
    })
    this.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? this.seekOffset
      void this.seekBy(-offset).catch(() => {})
    })
    this.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? this.seekOffset
      void this.seekBy(offset).catch(() => {})
    })
    this.setActionHandler('seekto', (details) => {
      void this.seekTo(details).catch(() => {})
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
