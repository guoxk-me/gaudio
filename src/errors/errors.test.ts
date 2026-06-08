import { describe, expect, it } from 'vitest'
import { GAudioError } from './errors'

describe('gAudioError', () => {
  it('preserves stable error metadata', () => {
    const sourceError = new Error('network failed')
    const error = new GAudioError('NETWORK_ERROR', 'Audio request failed', sourceError)

    expect(error.name).toBe('GAudioError')
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toBe('Audio request failed')
    expect(error.cause).toBe(sourceError)
  })
})
