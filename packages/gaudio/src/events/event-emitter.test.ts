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

  it('emits once handlers only for the next matching event', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []

    emitter.once('statechange', state => states.push(state))
    emitter.emit('statechange', 'playing')
    emitter.emit('statechange', 'idle')

    expect(states).toEqual(['playing'])
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
})
