import type { AudioProtocol, AudioSourceDescription } from '../types'
import type { AudioSource, AudioStreamHandle } from './audio-source'

/** URL-backed audio source used for strings and {@link AudioSourceDescription} values. */
export class HttpAudioSource implements AudioSource {
  /** Resource shape returned by {@link open}. */
  readonly kind = 'url'
  /** URL loaded by the selected playback engine. */
  readonly url: string
  /** Explicit playback protocol hint, when provided. */
  readonly protocol?: AudioProtocol
  /** MIME type hint, when provided. */
  readonly mimeType?: string

  /**
   * Creates a URL-backed source.
   *
   * @param source URL string or source description with protocol metadata.
   */
  constructor(source: string | AudioSourceDescription) {
    if (typeof source === 'string') {
      this.url = source
      return
    }

    this.url = source.url
    this.protocol = source.protocol
    this.mimeType = source.mimeType
  }

  /**
   * Opens the source without performing a network request.
   *
   * @returns A handle containing the configured URL.
   */
  async open(): Promise<AudioStreamHandle> {
    return {
      url: this.url,
    }
  }

  /** Releases source resources. URL-backed sources require no explicit cleanup. */
  async close(): Promise<void> {}
}
