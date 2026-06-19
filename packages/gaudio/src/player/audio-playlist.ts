import type { AudioSourceInput } from '../source/audio-source'

/** A playable track in an {@link AudioPlayer} playlist. */
export interface AudioPlaylistTrack {
  /** Primary source attempted first when this track is loaded. */
  readonly source: AudioSourceInput
  /** Backup sources attempted in order when the primary source cannot load. */
  readonly fallbackSources?: readonly AudioSourceInput[]
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
