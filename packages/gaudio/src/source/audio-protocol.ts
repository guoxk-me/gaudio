import type { AudioProtocol, AudioSource } from './audio-source'

// AI modified: keep protocol routing and native capability probes aligned across common HLS MIME aliases.
export const hlsMimeTypes = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
] as const

const hlsMimeTypeSet = new Set<string>(hlsMimeTypes)

export function audioProtocolForMimeType(mimeType: string | undefined): AudioProtocol | undefined {
  // AI modified: protocol routing ignores valid MIME parameters such as charset and codecs.
  const mimeTypeKey = mimeType?.split(';', 1)[0]?.trim().toLowerCase()

  if (mimeTypeKey && hlsMimeTypeSet.has(mimeTypeKey)) {
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
  // AI modified: RFC 8216 permits both .m3u8 and .m3u playlist path suffixes.
  if (pathname.endsWith('.m3u8') || pathname.endsWith('.m3u')) {
    return 'hls'
  }
  if (pathname.endsWith('.mpd')) {
    return 'dash'
  }
  return 'media'
}
