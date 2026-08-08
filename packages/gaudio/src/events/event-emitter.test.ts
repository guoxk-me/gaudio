import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from './event-emitter'

interface TestEvents {
  statechange: 'idle' | 'playing'
  ended: undefined
}

interface NumericEvents {
  0: string
  other: string
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('emits once handlers only for the next matching event', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []

    emitter.once('statechange', state => states.push(state))
    emitter.emit('statechange', 'playing')
    emitter.emit('statechange', 'idle')

    expect(states).toEqual(['playing'])
  })

  it('emits a once handler only once when an earlier listener emits re-entrantly', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []
    let hasEmittedReentrantly = false

    emitter.on('statechange', () => {
      if (!hasEmittedReentrantly) {
        hasEmittedReentrantly = true
        emitter.emit('statechange', 'idle')
      }
    })
    emitter.once('statechange', state => states.push(state))

    emitter.emit('statechange', 'playing')

    expect(states).toEqual(['idle'])
  })

  it('uses a listener snapshot while emitting', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []

    emitter.on('statechange', (state) => {
      states.push(`first:${state}`)
      emitter.on('statechange', nextState => states.push(`second:${nextState}`))
    })

    emitter.emit('statechange', 'playing')
    emitter.emit('statechange', 'idle')

    expect(states).toEqual(['first:playing', 'first:idle', 'second:idle'])
  })

  it('clears handlers for one event without removing other events', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []
    let endCount = 0

    emitter.on('statechange', state => states.push(state))
    emitter.on('ended', () => {
      endCount += 1
    })

    emitter.clear('statechange')
    emitter.emit('statechange', 'playing')
    emitter.emit('ended', undefined)

    expect(states).toEqual([])
    expect(endCount).toBe(1)
  })

  it('clears a falsy event key without removing other events', () => {
    const emitter = new EventEmitter<NumericEvents>()
    const receivedEvents: string[] = []
    emitter.on(0, payload => receivedEvents.push(`zero:${payload}`))
    emitter.on('other', payload => receivedEvents.push(`other:${payload}`))

    emitter.clear(0)
    emitter.emit(0, 'ignored')
    emitter.emit('other', 'kept')

    expect(receivedEvents).toEqual(['other:kept'])
  })

  it('reports listener failures without interrupting sibling listeners', () => {
    const reportedErrors: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => reportedErrors.push(error))
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []
    const listenerError = new Error('listener failed')
    emitter.on('statechange', () => {
      throw listenerError
    })
    emitter.on('statechange', state => states.push(state))

    emitter.emit('statechange', 'playing')

    expect(reportedErrors).toEqual([listenerError])
    expect(states).toEqual(['playing'])
  })

  it('continues notifying listeners when the host error reporter throws', () => {
    const queuedFailures: Array<() => void> = []
    const listenerError = new Error('listener failed')
    const reporterError = new Error('reporter failed')
    vi.stubGlobal('queueMicrotask', (callback: () => void) => queuedFailures.push(callback))
    vi.stubGlobal('reportError', () => {
      throw reporterError
    })
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []
    emitter.on('statechange', () => {
      throw listenerError
    })
    emitter.on('statechange', state => states.push(state))

    expect(() => emitter.emit('statechange', 'playing')).not.toThrow()

    expect(states).toEqual(['playing'])
    expect(queuedFailures).toHaveLength(1)
    expect(queuedFailures[0]).toThrow(expect.objectContaining({
      errors: [listenerError, reporterError],
    }))
  })
})
