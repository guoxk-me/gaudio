import { describe, expect, it } from 'vitest'
import { resolveAudioProtocol } from './audio-protocol'
import { BlobAudioSource } from './blob-audio-source'
import { HttpAudioSource } from './http-audio-source'

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
    'application/mpegurl',
    'audio/mpegurl',
    'audio/x-mpegURL',
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
    ['application/vnd.apple.mpegurl; charset=utf-8', 'hls'],
    ['application/dash+xml; codecs="mp4a.40.2"', 'dash'],
  ] as const)('ignores MIME parameters for %s', (mimeType, protocol) => {
    const source = new HttpAudioSource({
      url: '/stream?id=1',
      mimeType,
    })

    expect(resolveAudioProtocol(source)).toBe(protocol)
  })

  it.each([
    ['/audio/episode.m3u8?token=abc#start', 'hls'],
    ['/audio/episode.m3u?token=abc#start', 'hls'],
    ['/audio/episode.MPD?token=abc#start', 'dash'],
  ] as const)('uses the URL pathname extension for %s', (url, protocol) => {
    expect(resolveAudioProtocol(new HttpAudioSource(url))).toBe(protocol)
  })

  it('uses the media engine for unknown URLs', () => {
    expect(resolveAudioProtocol(new HttpAudioSource('/audio/episode.mp3'))).toBe('media')
  })

  it('uses the media engine for sources without routing hints', () => {
    expect(resolveAudioProtocol(new BlobAudioSource(new Blob()))).toBe('media')
  })
})
