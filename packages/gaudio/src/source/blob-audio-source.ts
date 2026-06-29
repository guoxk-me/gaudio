import type { AudioProtocol, AudioSource, AudioStreamHandle } from './audio-source'

/** Configures a {@link BlobAudioSource}. */
export interface BlobAudioSourceOptions {
  /** Explicit playback protocol hint. */
  protocol?: AudioProtocol
  /** MIME type override. Defaults to the blob's `type` value. */
  mimeType?: string
}

/** Blob-backed source that owns the object URL created for local browser playback. */
export class BlobAudioSource implements AudioSource {
  /** Resource shape returned by {@link open}. */
  readonly kind = 'blob'
  /** Explicit playback protocol hint, when provided. */
  readonly protocol?: AudioProtocol
  /** MIME type hint used for routing and support checks. */
  readonly mimeType?: string
  /** Active object URL after {@link open}, when one has been created. */
  url?: string

  private readonly blob: Blob

  /**
   * Creates a blob-backed source.
   *
   * @param blob Local audio data, usually from a `File` input or generated media.
   * @param options Protocol and MIME metadata used by the player.
   */
  constructor(blob: Blob, options: BlobAudioSourceOptions = {}) {
    this.blob = blob
    this.protocol = options.protocol
    this.mimeType = options.mimeType ?? (blob.type || undefined)
  }

  /**
   * Opens the blob by creating one owned object URL.
   *
   * @returns A handle containing the object URL.
   */
  async open(): Promise<AudioStreamHandle> {
    if (!this.url) {
      // AI modified: the source owns object URL creation so close() can reliably revoke it.
      this.url = URL.createObjectURL(this.blob)
    }

    return {
      url: this.url,
    }
  }

  /** Revokes the active object URL when one exists. */
  async close(): Promise<void> {
    if (!this.url) {
      return
    }

    URL.revokeObjectURL(this.url)
    this.url = undefined
  }
}
