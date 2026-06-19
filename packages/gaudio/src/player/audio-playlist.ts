import type { AudioSourceInput } from '../source/audio-source'

/** A selectable audio variant for the current playlist track, such as a dubbed language. */
export interface AudioTrack {
  /** Stable identifier used by {@link AudioPlayer.selectAudioTrack}. */
  readonly id: string
  /** Reader-facing label for UI menus. */
  readonly label?: string
  /** BCP 47 language tag, such as `zh-CN`, `en`, `it`, or `ko`. */
  readonly language?: string
  /** Primary source attempted first when this audio track is selected. */
  readonly source: AudioSourceInput
  /** Backup sources attempted in order when this audio track cannot load. */
  readonly fallbackSources?: readonly AudioSourceInput[]
}

/** A playable track in an {@link AudioPlayer} playlist. */
export interface AudioPlaylistTrack {
  /** Primary source attempted first when this track is loaded. */
  readonly source: AudioSourceInput
  /** Backup sources attempted in order when the primary source cannot load. */
  readonly fallbackSources?: readonly AudioSourceInput[]
  /** Language or alternate audio sources available for this playlist track. */
  readonly audioTracks?: readonly AudioTrack[]
  /**
   * Audio track selected when this playlist track becomes active.
   *
   * When omitted, the first `audioTracks` entry is used. If no audio tracks are supplied, `source` is used.
   */
  readonly defaultAudioTrackId?: string
}

/** Controls which track becomes active when a playlist is assigned. */
export interface AudioPlaylistOptions {
  /**
   * Zero-based track index to select immediately.
   *
   * @defaultValue `0`
   */
  readonly startIndex?: number
}

/** Controls how playlist navigation loads the selected track. */
export interface AudioPlaylistNavigationOptions {
  /**
   * Whether the selected track should begin playback after loading.
   *
   * @defaultValue `false`
   */
  readonly autoplay?: boolean
}

/** Controls how selecting an alternate audio track affects playback continuity. */
export interface AudioTrackSelectionOptions {
  /**
   * Whether to seek the replacement audio track back to the current playback position.
   *
   * @defaultValue `true`
   */
  readonly preserveTime?: boolean
  /**
   * Whether playback should start after the audio track loads.
   *
   * `preserve` keeps the previous paused/playing state.
   *
   * @defaultValue `'preserve'`
   */
  readonly autoplay?: boolean | 'preserve'
}
