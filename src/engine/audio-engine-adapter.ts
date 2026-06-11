import type { AdaptiveAudioProtocol } from '../types'
import type { AudioEngine } from './audio-engine'

export interface AudioEngineAdapter {
  readonly protocol: AdaptiveAudioProtocol
  createEngine: () => AudioEngine
  isSupported: () => boolean
}
