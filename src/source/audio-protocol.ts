import type { AudioSource } from './audio-source'
import type { AudioProtocol } from '../types'

const hlsMimeTypes = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
])

export function resolveAudioProtocol(source: AudioSource): AudioProtocol {
  if (source.protocol) {
    return source.protocol
  }

  const mimeType = source.mimeType?.toLowerCase()
  if (mimeType && hlsMimeTypes.has(mimeType)) {
    return 'hls'
  }
  if (mimeType === 'application/dash+xml') {
    return 'dash'
  }

  if (!source.url) {
    return 'media'
  }

  // AI modified: local URL inspection avoids an extra manifest request during engine selection.
  const pathname = new URL(source.url, 'https://gaudio.invalid').pathname.toLowerCase()
  if (pathname.endsWith('.m3u8')) {
    return 'hls'
  }
  if (pathname.endsWith('.mpd')) {
    return 'dash'
  }
  return 'media'
}
