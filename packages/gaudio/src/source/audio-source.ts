/** Identifies the transport or manifest protocol used by an audio source. */
export type AudioProtocol = 'media' | 'hls' | 'dash'

/** Describes a URL-backed audio source and optional protocol hints. */
export interface AudioSourceDescription {
  /** URL passed to the selected playback engine. */
  url: string
  /** Explicit protocol override for URLs that cannot be identified by MIME type or extension. */
  protocol?: AudioProtocol
  /** MIME type used for protocol selection and browser capability checks. */
  mimeType?: string
}

/** Identifies the resource shape exposed by an {@link AudioSource}. */
export type AudioSourceKind = 'url'

/** Contains the playable resource produced when an {@link AudioSource} is opened. */
export interface AudioStreamHandle {
  /** URL that a playback engine should attach to its media element or vendor player. */
  readonly url: string
}

/** Provides a lazily opened audio resource to an {@link AudioEngine}. */
export interface AudioSource {
  /** Resource shape returned by {@link open}. */
  readonly kind: AudioSourceKind
  /** Original URL, when the source can expose it before opening. */
  readonly url?: string
  /** Explicit playback protocol hint. */
  readonly protocol?: AudioProtocol
  /** MIME type hint used for protocol routing and capability checks. */
  readonly mimeType?: string
  /**
   * Opens the source for playback.
   *
   * @returns A handle containing the URL to load.
   */
  open: () => Promise<AudioStreamHandle>
  /**
   * Releases resources associated with the current open operation.
   *
   * @returns A promise that settles after cleanup completes.
   */
  close: () => Promise<void>
}

/** Source forms accepted by {@link AudioPlayer.setSource} and {@link AudioPlayerOptions.source}. */
export type AudioSourceInput = string | AudioSourceDescription | AudioSource
