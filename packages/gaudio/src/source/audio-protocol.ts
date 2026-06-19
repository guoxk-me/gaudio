import type { AudioProtocol, AudioSource } from './audio-source'

const hlsMimeTypes = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
])

export function audioProtocolForMimeType(mimeType: string | undefined): AudioProtocol | undefined {
  const mimeTypeKey = mimeType?.toLowerCase()

  if (mimeTypeKey && hlsMimeTypes.has(mimeTypeKey)) {
    return 'hls'
  }
  if (mimeTypeKey === 'application/dash+xml') {
    return 'dash'
  }

  return undefined
}

export function resolveAudioProtocol(source: AudioSource): AudioProtocol {
  if (source.protocol) {
    return source.protocol
  }

  const protocol = audioProtocolForMimeType(source.mimeType)
  if (protocol) {
    return protocol
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
