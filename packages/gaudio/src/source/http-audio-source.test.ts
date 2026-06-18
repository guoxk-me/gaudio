import { describe, expect, it } from 'vitest'
import { HttpAudioSource } from './http-audio-source'

describe('httpAudioSource', () => {
  it('opens a URL string as a URL-backed stream handle', async () => {
    const source = new HttpAudioSource('https://example.com/audio.mp3')

    await expect(source.open()).resolves.toEqual({
      url: 'https://example.com/audio.mp3',
    })

    expect(source.kind).toBe('url')
    expect(source.url).toBe('https://example.com/audio.mp3')
    expect(source.protocol).toBeUndefined()
    expect(source.mimeType).toBeUndefined()
  })

  it('keeps protocol and MIME hints from a source description', async () => {
    const source = new HttpAudioSource({
      url: 'https://example.com/stream',
      protocol: 'hls',
      mimeType: 'application/vnd.apple.mpegurl',
    })

    await expect(source.open()).resolves.toEqual({
      url: 'https://example.com/stream',
    })

    expect(source.protocol).toBe('hls')
    expect(source.mimeType).toBe('application/vnd.apple.mpegurl')
  })

  it('closes without requiring explicit cleanup', async () => {
    const source = new HttpAudioSource('https://example.com/audio.mp3')

    await expect(source.close()).resolves.toBeUndefined()
  })
})
