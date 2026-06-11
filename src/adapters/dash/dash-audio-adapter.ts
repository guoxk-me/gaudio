// @env browser

import type { MediaPlayerClass, MediaPlayerEvents, MediaPlayerSettingClass } from 'dashjs'
import type { AudioEngine } from '../../engine/audio-engine'
import type { AudioEngineAdapter } from '../../engine/audio-engine-adapter'
import { GAudioError } from '../../errors/errors'
import { DashAudioEngine } from './dash-audio-engine'

export interface DashAdapterOptions {
  settings?: MediaPlayerSettingClass
}

export interface DashAudioAdapter extends AudioEngineAdapter {
  readonly dashInstance: MediaPlayerClass | undefined
  getSettings: () => Readonly<MediaPlayerSettingClass>
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
    this.settings = structuredClone(options.settings ?? {})
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

function settingsWithChanges(
  currentSettings: MediaPlayerSettingClass,
  settingsChanges: MediaPlayerSettingClass,
): MediaPlayerSettingClass {
  return mergeSettingRecords(
    currentSettings as Record<string, unknown>,
    settingsChanges as Record<string, unknown>,
  ) as MediaPlayerSettingClass
}

function mergeSettingRecords(
  currentSettings: Record<string, unknown>,
  settingsChanges: Record<string, unknown>,
): Record<string, unknown> {
  const mergedSettings: Record<string, unknown> = { ...currentSettings }
  for (const [settingName, settingChange] of Object.entries(settingsChanges)) {
    const currentSetting = mergedSettings[settingName]
    mergedSettings[settingName] = isSettingRecord(currentSetting) && isSettingRecord(settingChange)
      ? mergeSettingRecords(currentSetting, settingChange)
      : settingChange
  }
  return mergedSettings
}

function isSettingRecord(setting: unknown): setting is Record<string, unknown> {
  return typeof setting === 'object' && setting !== null && !Array.isArray(setting)
}
