import type { AudioSource, AudioStreamHandle } from './audio-source'

export class HttpAudioSource implements AudioSource {
  readonly kind = 'url'

  constructor(private readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    return {
      url: this.url,
    }
  }

  async close(): Promise<void> {}
}
