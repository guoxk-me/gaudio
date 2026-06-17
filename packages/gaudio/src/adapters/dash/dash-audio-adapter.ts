// @env browser

import type { MediaPlayerClass, MediaPlayerEvents, MediaPlayerSettingClass } from 'dashjs'
import type { AudioEngine } from '../../engine/audio-engine'
import type { AudioEngineAdapter } from '../../engine/audio-engine-adapter'
import { GAudioError } from '../../errors/errors'
import { AdaptivePlaybackPreset } from '../adaptive-audio-types'
import { settingsWithChanges } from '../settings-with-changes'
import { DashAudioEngine } from './dash-audio-engine'
import { dashSettingsForPreset } from './dash-playback-presets'

/** Configures an adapter created by {@link createDashAdapter}. */
export interface DashAdapterOptions {
  /**
   * Audio VOD configuration profile applied before explicit `settings` overrides.
   *
   * @defaultValue {@link AdaptivePlaybackPreset.Balanced}
   */
  preset?: AdaptivePlaybackPreset
  /** Initial dash.js settings applied when a DASH engine is created. */
  settings?: MediaPlayerSettingClass
}

/** DASH adapter with runtime settings and vendor-instance diagnostics. */
export interface DashAudioAdapter extends AudioEngineAdapter {
  /** Active dash.js player instance, or `undefined` when no DASH engine is active. */
  readonly dashInstance: MediaPlayerClass | undefined
  /** @returns A deep readonly copy of settings used for future DASH engines. */
  getSettings: () => Readonly<MediaPlayerSettingClass>
  /**
   * Deep-merges dash.js settings and applies the changed values to the active engine.
   *
   * @param settings Settings to merge through the official dash.js runtime update API.
   */
  updateSettings: (settings: MediaPlayerSettingClass) => void
}

interface DashAdapterDependencies {
  audioElementFactory: () => HTMLAudioElement
  createDashPlayer: () => MediaPlayerClass
  events: MediaPlayerEvents
  isDashSupported: () => boolean
}

export class DashAudioAdapterImpl implements DashAudioAdapter {
  readonly protocol = 'dash'
  dashInstance: MediaPlayerClass | undefined

  private readonly dependencies: DashAdapterDependencies
  private settings: MediaPlayerSettingClass
  private activeEngine?: DashAudioEngine

  constructor(options: DashAdapterOptions = {}, dependencies: DashAdapterDependencies) {
    // AI modified: clone settings because dash.js mutates nested configuration objects internally.
    this.settings = structuredClone(settingsWithChanges(
      dashSettingsForPreset(options.preset ?? AdaptivePlaybackPreset.Balanced),
      options.settings ?? {},
    ))
    this.dependencies = dependencies
  }

  isSupported(): boolean {
    return this.dependencies.isDashSupported()
  }

  createEngine(): AudioEngine {
    if (!this.isSupported()) {
      throw new GAudioError('PROTOCOL_UNSUPPORTED', 'DASH playback is not supported in this browser')
    }

    const audioElement = this.dependencies.audioElementFactory()
    const engine = new DashAudioEngine({
      settings: structuredClone(this.settings),
      audioElement,
      createDashPlayer: this.dependencies.createDashPlayer,
      events: this.dependencies.events,
      onDashInstanceChange: (instance) => {
        if (this.activeEngine === engine) {
          this.dashInstance = instance
        }
      },
      onDispose: () => {
        if (this.activeEngine === engine) {
          this.activeEngine = undefined
          this.dashInstance = undefined
        }
      },
    })
    this.activeEngine = engine
    return engine
  }

  getSettings(): Readonly<MediaPlayerSettingClass> {
    return structuredClone(this.settings)
  }

  updateSettings(settings: MediaPlayerSettingClass): void {
    this.settings = settingsWithChanges(this.settings, settings)
    this.activeEngine?.updateSettings(structuredClone(settings))
  }
}
