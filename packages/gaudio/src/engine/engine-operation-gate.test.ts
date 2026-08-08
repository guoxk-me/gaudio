import { describe, expect, it } from 'vitest'
import { createEngineOperationGate, observeEngineOperation } from './engine-operation-gate'

describe('engine operation gate', () => {
  it('rejects the public operation when starting the engine operation throws', async () => {
    const operationGate = createEngineOperationGate<void>()
    const startError = new Error('Engine operation failed before returning a promise')

    // AI modified: synchronous extension failures must terminate the same gate used for async failures.
    observeEngineOperation(() => {
      throw startError
    }, operationGate)

    await expect(operationGate.completion).rejects.toBe(startError)
  })
})
