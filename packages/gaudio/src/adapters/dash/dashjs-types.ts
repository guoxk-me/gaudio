// AI modified: import-mode type queries keep CommonJS declarations compatible with ESM-only dashjs.
export type DashErrorEvent = import('dashjs', { with: { 'resolution-mode': 'import' } }).ErrorEvent
export type FragmentLoadingCompletedEvent = import('dashjs', { with: { 'resolution-mode': 'import' } }).FragmentLoadingCompletedEvent
/** dash.js player instance used by the optional DASH adapter. */
export type MediaPlayerClass = import('dashjs', { with: { 'resolution-mode': 'import' } }).MediaPlayerClass
export type MediaPlayerErrors = import('dashjs', { with: { 'resolution-mode': 'import' } }).MediaPlayerErrors
export type MediaPlayerEvents = import('dashjs', { with: { 'resolution-mode': 'import' } }).MediaPlayerEvents
/** Complete dash.js settings snapshot returned by `DashAudioAdapter.getSettings()`. */
export type MediaPlayerSettingClass = import('dashjs', { with: { 'resolution-mode': 'import' } }).MediaPlayerSettingClass
export type QualityChangeRenderedEvent = import('dashjs', { with: { 'resolution-mode': 'import' } }).QualityChangeRenderedEvent
export type Representation = import('dashjs', { with: { 'resolution-mode': 'import' } }).Representation
export type StreamInitializedEvent = import('dashjs', { with: { 'resolution-mode': 'import' } }).StreamInitializedEvent

type DashSettingChanges<Setting>
  = Setting extends RegExp
    ? Setting
    : Setting extends (...parameters: never[]) => unknown
      ? Setting
      : Setting extends readonly unknown[]
        ? Setting
        : Setting extends object
          ? { [SettingName in keyof Setting]?: DashSettingChanges<Setting[SettingName]> }
          : Setting

/** Sparse dash.js settings recursively merged by the GAudio DASH adapter. */
export type DashSettingsChanges = DashSettingChanges<MediaPlayerSettingClass>
