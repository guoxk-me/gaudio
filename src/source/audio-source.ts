import type { AudioProtocol, AudioSourceDescription } from '../types'

export type AudioSourceKind = 'url'

export interface AudioStreamHandle {
  readonly url: string
}

export interface AudioSource {
  readonly kind: AudioSourceKind
  readonly url?: string
  readonly protocol?: AudioProtocol
  readonly mimeType?: string
  open: () => Promise<AudioStreamHandle>
  close: () => Promise<void>
}

export type AudioSourceInput = string | AudioSourceDescription | AudioSource
