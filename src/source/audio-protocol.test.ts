import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from './http-audio-source'
import { resolveAudioProtocol } from './audio-protocol'

describe('resolveAudioProtocol', () => {
  it('prefers an explicit protocol over MIME and URL hints', () => {
    const source = new HttpAudioSource({
      url: '/stream.m3u8',
      protocol: 'dash',
      mimeType: 'application/vnd.apple.mpegurl',
    })

    expect(resolveAudioProtocol(source)).toBe('dash')
  })

  it.each([
    'application/vnd.apple.mpegurl',
    'application/x-mpegURL',
  ])('recognizes HLS MIME type %s case-insensitively', (mimeType) => {
    const source = new HttpAudioSource({
      url: '/stream?id=1',
      mimeType,
    })

    expect(resolveAudioProtocol(source)).toBe('hls')
  })

  it('recognizes the DASH MIME type', () => {
    const source = new HttpAudioSource({
      url: '/stream?id=1',
      mimeType: 'application/dash+xml',
    })

    expect(resolveAudioProtocol(source)).toBe('dash')
  })

  it.each([
    ['/audio/episode.m3u8?token=abc#start', 'hls'],
    ['/audio/episode.MPD?token=abc#start', 'dash'],
  ] as const)('uses the URL pathname extension for %s', (url, protocol) => {
    expect(resolveAudioProtocol(new HttpAudioSource(url))).toBe(protocol)
  })

  it('uses the media engine for unknown URLs', () => {
    expect(resolveAudioProtocol(new HttpAudioSource('/audio/episode.mp3'))).toBe('media')
  })
})
