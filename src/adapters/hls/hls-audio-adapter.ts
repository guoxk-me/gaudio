// @env browser

import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import type { AudioEngine } from '../../engine/audio-engine'
import type { AudioEngineAdapter } from '../../engine/audio-engine-adapter'
import { GAudioError } from '../../errors/errors'
import { HlsAudioEngine } from './hls-audio-engine'

export type HlsPlaybackStrategy = 'native-first' | 'hls-first' | 'native-only' | 'hls-only'

export interface HlsConfigUpdateOptions {
  apply?: 'next-load' | 'reload'
  restorePosition?: boolean
  resumePlayback?: boolean
}

export interface HlsAdapterOptions {
  playbackStrategy?: HlsPlaybackStrategy
  config?: Partial<HlsConfig>
}

export interface HlsAudioAdapter extends AudioEngineAdapter {
  readonly hlsInstance: Hls | undefined
  readonly implementation: 'native' | 'hls.js' | undefined
  getConfig: () => Readonly<Partial<HlsConfig>>
  updateConfig: (config: Partial<HlsConfig>, options?: HlsConfigUpdateOptions) => Promise<void>
}

interface HlsAdapterDependencies {
  audioElementFactory: () => HTMLAudioElement
  createHls: (config: Partial<HlsConfig>) => Hls
  isHlsSupported: () => boolean
}

export class HlsAudioAdapterImpl implements HlsAudioAdapter {
  readonly protocol = 'hls'
  hlsInstance: Hls | undefined
  implementation: 'native' | 'hls.js' | undefined

  private readonly playbackStrategy: HlsPlaybackStrategy
  private readonly dependencies: HlsAdapterDependencies
  private config: Partial<HlsConfig>
  private activeEngine?: HlsAudioEngine

  constructor(options: HlsAdapterOptions = {}, dependencies: HlsAdapterDependencies) {
    this.playbackStrategy = options.playbackStrategy ?? 'native-first'
    this.config = { ...options.config }
    this.dependencies = dependencies
  }

  isSupported(): boolean {
    return this.selectImplementation(false) !== undefined
  }

  createEngine(): AudioEngine {
    const implementation = this.selectImplementation(true)
    if (!implementation) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'HLS playback is not supported in this browser')
    }

    const audioElement = this.dependencies.audioElementFactory()
    const engine = new HlsAudioEngine({
      implementation,
      config: { ...this.config },
      audioElement,
      createHls: this.dependencies.createHls,
      onHlsInstanceChange: (instance) => {
        if (this.activeEngine === engine) {
          this.hlsInstance = instance
        }
      },
      onDispose: () => {
        if (this.activeEngine === engine) {
          this.activeEngine = undefined
          this.hlsInstance = undefined
          this.implementation = undefined
        }
      },
    })
    this.activeEngine = engine
    this.implementation = implementation
    return engine
  }

  getConfig(): Readonly<Partial<HlsConfig>> {
    return { ...this.config }
  }

  async updateConfig(config: Partial<HlsConfig>, options: HlsConfigUpdateOptions = {}): Promise<void> {
    this.config = {
      ...this.config,
      ...config,
    }

    if (options.apply !== 'reload' || !this.activeEngine) {
      return
    }

    // AI modified: reload is explicit because many hls.js constructor options cannot change in place.
    await this.activeEngine.reload({ ...this.config }, {
      restorePosition: options.restorePosition ?? true,
      resumePlayback: options.resumePlayback,
    })
  }

  private selectImplementation(shouldThrow: boolean): 'native' | 'hls.js' | undefined {
    const nativeSupported = this.supportsNativeHls()
    const hlsSupported = this.dependencies.isHlsSupported()

    switch (this.playbackStrategy) {
      case 'native-first':
        return nativeSupported ? 'native' : hlsSupported ? 'hls.js' : undefined
      case 'hls-first':
        return hlsSupported ? 'hls.js' : nativeSupported ? 'native' : undefined
      case 'native-only':
        if (nativeSupported) {
          return 'native'
        }
        break
      case 'hls-only':
        if (hlsSupported) {
          return 'hls.js'
        }
        break
    }

    if (shouldThrow) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', `HLS strategy ${this.playbackStrategy} is not supported in this browser`)
    }
    return undefined
  }

  private supportsNativeHls(): boolean {
    const audioElement = this.dependencies.audioElementFactory()
    return audioElement.canPlayType('application/vnd.apple.mpegurl') !== ''
      || audioElement.canPlayType('application/x-mpegURL') !== ''
  }
}
