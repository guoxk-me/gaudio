import type { AudioProtocol, AudioSourceDescription } from '../types'
import type { AudioSource, AudioStreamHandle } from './audio-source'

export class HttpAudioSource implements AudioSource {
  readonly kind = 'url'
  readonly url: string
  readonly protocol?: AudioProtocol
  readonly mimeType?: string

  constructor(source: string | AudioSourceDescription) {
    if (typeof source === 'string') {
      this.url = source
      return
    }

    this.url = source.url
    this.protocol = source.protocol
    this.mimeType = source.mimeType
  }

  async open(): Promise<AudioStreamHandle> {
    return {
      url: this.url,
    }
  }

  async close(): Promise<void> {}
}
