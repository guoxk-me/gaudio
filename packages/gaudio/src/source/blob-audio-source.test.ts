import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlobAudioSource } from './blob-audio-source'

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

afterEach(() => {
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
  vi.restoreAllMocks()
})

describe('blobAudioSource', () => {
  it('opens a blob as an owned object URL and revokes it on close', async () => {
    const createObjectUrl = vi.fn(() => 'blob:https://example.com/audio')
    const revokeObjectUrl = vi.fn()
    URL.createObjectURL = createObjectUrl
    URL.revokeObjectURL = revokeObjectUrl

    const source = new BlobAudioSource(new Blob(['audio'], { type: 'audio/mpeg' }))

    await expect(source.open()).resolves.toEqual({
      url: 'blob:https://example.com/audio',
    })
    await source.close()

    expect(source.kind).toBe('blob')
    expect(source.mimeType).toBe('audio/mpeg')
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://example.com/audio')
  })

  it('reuses one object URL until the source is closed', async () => {
    const createObjectUrl = vi.fn(() => 'blob:https://example.com/reused')
    const revokeObjectUrl = vi.fn()
    URL.createObjectURL = createObjectUrl
    URL.revokeObjectURL = revokeObjectUrl

    const source = new BlobAudioSource(new Blob(['audio']))

    await source.open()
    await source.open()
    await source.close()
    await source.close()

    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
  })
})
