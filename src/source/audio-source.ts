export type AudioSourceKind = 'url'

export interface AudioStreamHandle {
  readonly url: string
}

export interface AudioSource {
  readonly kind: AudioSourceKind
  open: () => Promise<AudioStreamHandle>
  close: () => Promise<void>
}
