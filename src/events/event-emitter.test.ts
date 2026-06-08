import { describe, expect, it } from 'vitest'
import { EventEmitter } from './event-emitter'

interface TestEvents {
  statechange: 'idle' | 'playing'
  ended: undefined
}

describe('eventEmitter', () => {
  it('emits payloads to active handlers', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []

    emitter.on('statechange', (state) => {
      states.push(state)
    })

    emitter.emit('statechange', 'playing')

    expect(states).toEqual(['playing'])
  })

  it('unsubscribes handlers', () => {
    const emitter = new EventEmitter<TestEvents>()
    let callCount = 0

    const unsubscribe = emitter.on('ended', () => {
      callCount += 1
    })

    unsubscribe()
    emitter.emit('ended', undefined)

    expect(callCount).toBe(0)
  })
})
