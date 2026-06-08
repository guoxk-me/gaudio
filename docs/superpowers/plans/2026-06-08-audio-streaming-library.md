# Audio Streaming Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-first TypeScript audio streaming library with stable playback controls, typed events, basic Web Audio analysis, and a package shape ready for npm publishing.

**Architecture:** The library centers on `AudioPlayer`, which owns playback state and delegates runtime-specific behavior to an `AudioBackend`. Version 1 uses `HTMLAudioElement` for reliable streaming playback and a small Web Audio graph for analysis and effects, while preserving interfaces that allow future MSE, HLS, DASH, WebCodecs, or Node adapters.

**Tech Stack:** TypeScript, Web Audio API, HTMLMediaElement, pnpm, tsdown, Vitest, @antfu/eslint-config.

---

## Scope

Version 1 provides:

- URL audio playback for browser environments.
- `load`, `play`, `pause`, `stop`, `seek`, `setVolume`, `setPlaybackRate`, and `dispose`.
- Strongly typed playback state and events.
- Unified error codes for predictable application handling.
- Frequency and waveform access through `AnalyserNode`.
- A minimal build, lint, typecheck, and test setup.

Version 1 deliberately excludes:

- Full HLS or DASH protocol handling.
- DRM, transcoding, server-side processing, or custom codec decoding.
- Complex playlist management.
- Large framework integrations.

## File Structure

- Create: `package.json` - package metadata, exports, and scripts.
- Create: `tsconfig.json` - strict TypeScript configuration.
- Create: `tsdown.config.ts` - ESM and CJS library build configuration.
- Create: `eslint.config.mjs` - Antfu ESLint configuration.
- Create: `vitest.config.ts` - Vitest configuration for logic tests.
- Create: `src/index.ts` - public exports.
- Create: `src/types.ts` - public and shared TypeScript types.
- Create: `src/errors/errors.ts` - typed library error.
- Create: `src/events/EventEmitter.ts` - small typed event emitter.
- Create: `src/source/AudioSource.ts` - source interfaces.
- Create: `src/source/HttpAudioSource.ts` - URL source implementation.
- Create: `src/backend/AudioBackend.ts` - backend contract.
- Create: `src/backend/MediaElementBackend.ts` - browser playback backend.
- Create: `src/analysis/AudioAnalyzer.ts` - waveform and frequency reader.
- Create: `src/player/AudioPlayer.ts` - main public player.
- Create: `src/player/AudioPlayer.test.ts` - player state tests with a fake backend.
- Create: `src/events/EventEmitter.test.ts` - typed event behavior tests.
- Create: `src/errors/errors.test.ts` - error metadata tests.
- Create: `README.md` - installation, quick start, and first-version limits.

## Implementation Tasks

### Task 1: Project Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsdown.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gaudio",
  "version": "0.1.0",
  "description": "A browser-first TypeScript audio streaming library.",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^4.0.0",
    "eslint": "^9.0.0",
    "tsdown": "^0.15.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": [
    "src",
    "*.config.ts",
    "eslint.config.mjs"
  ]
}
```

- [ ] **Step 3: Create `tsdown.config.ts`**

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```js
import antfu from '@antfu/eslint-config'

export default antfu()
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
})
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 7: Verify baseline tooling**

Run: `pnpm typecheck`

Expected: PASS after source files are added in later tasks; before source files exist this may report no inputs or missing entry files depending on the local TypeScript version.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json tsdown.config.ts eslint.config.mjs vitest.config.ts pnpm-lock.yaml
git commit -m "chore: initialize audio library tooling"
```

### Task 2: Public Types and Errors

**Files:**
- Create: `src/types.ts`
- Create: `src/errors/errors.ts`
- Create: `src/errors/errors.test.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type PlaybackState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'error'

export type PreloadMode = 'none' | 'metadata' | 'auto'

export type GAudioErrorCode =
  | 'SOURCE_UNAVAILABLE'
  | 'LOAD_ABORTED'
  | 'DECODE_FAILED'
  | 'PLAYBACK_BLOCKED'
  | 'UNSUPPORTED_FORMAT'
  | 'NETWORK_ERROR'
  | 'BACKEND_ERROR'

export interface TimeUpdate {
  currentTime: number
  duration: number
}

export interface BufferUpdate {
  bufferedStart: number
  bufferedEnd: number
}

export interface AudioPlayerEvents {
  statechange: PlaybackState
  timeupdate: TimeUpdate
  bufferupdate: BufferUpdate
  error: GAudioError
  ended: undefined
}

export interface AudioPlayerOptions {
  source?: string
  preload?: PreloadMode
  lowLatency?: boolean
}

export interface FrequencyDataOptions {
  binCount?: number
}

export interface WaveformDataOptions {
  sampleCount?: number
}

export interface GAudioError {
  readonly name: 'GAudioError'
  readonly code: GAudioErrorCode
  readonly message: string
  readonly cause?: unknown
}
```

- [ ] **Step 2: Create `src/errors/errors.ts`**

```ts
import type { GAudioErrorCode } from '../types'

export class GAudioError extends Error {
  readonly code: GAudioErrorCode

  override readonly name = 'GAudioError'

  constructor(code: GAudioErrorCode, message: string, cause?: unknown) {
    super(message)
    this.code = code

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}
```

- [ ] **Step 3: Create `src/errors/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GAudioError } from './errors'

describe('GAudioError', () => {
  it('preserves stable error metadata', () => {
    const sourceError = new Error('network failed')
    const error = new GAudioError('NETWORK_ERROR', 'Audio request failed', sourceError)

    expect(error.name).toBe('GAudioError')
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toBe('Audio request failed')
    expect(error.cause).toBe(sourceError)
  })
})
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export { GAudioError } from './errors/errors'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm test src/errors/errors.test.ts`

Expected: PASS with `GAudioError preserves stable error metadata`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/errors/errors.ts src/errors/errors.test.ts src/index.ts
git commit -m "feat: add public audio error types"
```

### Task 3: Typed Event Emitter

**Files:**
- Create: `src/events/EventEmitter.ts`
- Create: `src/events/EventEmitter.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/events/EventEmitter.ts`**

```ts
type EventMap = Record<string, unknown>

type EventHandler<Payload> = (payload: Payload) => void

export class EventEmitter<Events extends EventMap> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>()

  on<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): () => void {
    const existingHandlers = this.handlers.get(eventName) ?? new Set<EventHandler<Events[keyof Events]>>()
    existingHandlers.add(handler as EventHandler<Events[keyof Events]>)
    this.handlers.set(eventName, existingHandlers)

    return () => {
      this.off(eventName, handler)
    }
  }

  off<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): void {
    const existingHandlers = this.handlers.get(eventName)
    existingHandlers?.delete(handler as EventHandler<Events[keyof Events]>)
  }

  emit<EventName extends keyof Events>(eventName: EventName, payload: Events[EventName]): void {
    const existingHandlers = this.handlers.get(eventName)

    if (!existingHandlers) {
      return
    }

    for (const handler of existingHandlers) {
      handler(payload)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
```

- [ ] **Step 2: Create `src/events/EventEmitter.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { EventEmitter } from './EventEmitter'

interface TestEvents {
  statechange: 'idle' | 'playing'
  ended: undefined
}

describe('EventEmitter', () => {
  it('emits payloads to active handlers', () => {
    const emitter = new EventEmitter<TestEvents>()
    const states: string[] = []

    emitter.on('statechange', state => {
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
```

- [ ] **Step 3: Export `EventEmitter` from `src/index.ts`**

```ts
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/EventEmitter'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm test src/events/EventEmitter.test.ts`

Expected: PASS with both event tests.

- [ ] **Step 5: Commit**

```bash
git add src/events/EventEmitter.ts src/events/EventEmitter.test.ts src/index.ts
git commit -m "feat: add typed audio event emitter"
```

### Task 4: Audio Sources and Backend Contract

**Files:**
- Create: `src/source/AudioSource.ts`
- Create: `src/source/HttpAudioSource.ts`
- Create: `src/backend/AudioBackend.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/source/AudioSource.ts`**

```ts
export type AudioSourceKind = 'url'

export interface AudioStreamHandle {
  readonly url: string
}

export interface AudioSource {
  readonly kind: AudioSourceKind
  open(): Promise<AudioStreamHandle>
  close(): Promise<void>
}
```

- [ ] **Step 2: Create `src/source/HttpAudioSource.ts`**

```ts
import type { AudioSource, AudioStreamHandle } from './AudioSource'

export class HttpAudioSource implements AudioSource {
  readonly kind = 'url'

  constructor(private readonly url: string) {}

  async open(): Promise<AudioStreamHandle> {
    return {
      url: this.url,
    }
  }

  async close(): Promise<void> {}
}
```

- [ ] **Step 3: Create `src/backend/AudioBackend.ts`**

```ts
import type { AudioSource } from '../source/AudioSource'
import type { BufferUpdate, TimeUpdate } from '../types'
import type { GAudioError } from '../errors/errors'

export interface AudioBackendEvents {
  timeupdate: TimeUpdate
  bufferupdate: BufferUpdate
  ended: undefined
  error: GAudioError
}

export interface AudioBackend {
  load(source: AudioSource): Promise<void>
  play(): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): Promise<void>
  setVolume(volume: number): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getDuration(): number
  on<EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void
  ): () => void
  dispose(): void
}
```

- [ ] **Step 4: Export source and backend types from `src/index.ts`**

```ts
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/EventEmitter'
export { HttpAudioSource } from './source/HttpAudioSource'
export type { AudioBackend, AudioBackendEvents } from './backend/AudioBackend'
export type { AudioSource, AudioSourceKind, AudioStreamHandle } from './source/AudioSource'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/source/AudioSource.ts src/source/HttpAudioSource.ts src/backend/AudioBackend.ts src/index.ts
git commit -m "feat: define audio source and backend contracts"
```

### Task 5: Browser Media Element Backend

**Files:**
- Create: `src/backend/MediaElementBackend.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/backend/MediaElementBackend.ts`**

```ts
// @env browser

import type { AudioBackend, AudioBackendEvents } from './AudioBackend'
import type { AudioSource } from '../source/AudioSource'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/EventEmitter'

export class MediaElementBackend implements AudioBackend {
  private readonly audioElement: HTMLAudioElement
  private readonly events = new EventEmitter<AudioBackendEvents>()
  private activeSource?: AudioSource

  constructor(audioElement = new Audio()) {
    this.audioElement = audioElement
    this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.addEventListener('progress', this.handleProgress)
    this.audioElement.addEventListener('ended', this.handleEnded)
    this.audioElement.addEventListener('error', this.handleError)
  }

  async load(source: AudioSource): Promise<void> {
    this.activeSource = source
    const streamHandle = await source.open()

    this.audioElement.src = streamHandle.url
    this.audioElement.load()

    await new Promise<void>((resolve, reject) => {
      const handleReady = (): void => {
        cleanup()
        resolve()
      }

      const handleError = (): void => {
        cleanup()
        reject(new GAudioError('SOURCE_UNAVAILABLE', 'Audio source could not be loaded'))
      }

      const cleanup = (): void => {
        this.audioElement.removeEventListener('loadedmetadata', handleReady)
        this.audioElement.removeEventListener('error', handleError)
      }

      this.audioElement.addEventListener('loadedmetadata', handleReady, { once: true })
      this.audioElement.addEventListener('error', handleError, { once: true })
    })
  }

  async play(): Promise<void> {
    try {
      await this.audioElement.play()
    }
    catch (error) {
      throw new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback', error)
    }
  }

  pause(): void {
    this.audioElement.pause()
  }

  stop(): void {
    this.audioElement.pause()
    this.audioElement.currentTime = 0
  }

  async seek(seconds: number): Promise<void> {
    this.audioElement.currentTime = Math.max(0, seconds)
  }

  setVolume(volume: number): void {
    this.audioElement.volume = Math.min(1, Math.max(0, volume))
  }

  setPlaybackRate(rate: number): void {
    this.audioElement.playbackRate = Math.max(0.25, rate)
  }

  getCurrentTime(): number {
    return this.audioElement.currentTime
  }

  getDuration(): number {
    return Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0
  }

  on<EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.audioElement.pause()
    this.audioElement.removeAttribute('src')
    this.audioElement.load()
    this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.audioElement.removeEventListener('progress', this.handleProgress)
    this.audioElement.removeEventListener('ended', this.handleEnded)
    this.audioElement.removeEventListener('error', this.handleError)
    this.events.clear()
    void this.activeSource?.close()
    this.activeSource = undefined
  }

  private readonly handleTimeUpdate = (): void => {
    this.events.emit('timeupdate', {
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
    })
  }

  private readonly handleProgress = (): void => {
    const buffered = this.audioElement.buffered

    if (buffered.length === 0) {
      return
    }

    this.events.emit('bufferupdate', {
      bufferedStart: buffered.start(0),
      bufferedEnd: buffered.end(buffered.length - 1),
    })
  }

  private readonly handleEnded = (): void => {
    this.events.emit('ended', undefined)
  }

  private readonly handleError = (): void => {
    this.events.emit('error', new GAudioError('BACKEND_ERROR', 'Audio element reported a playback error'))
  }
}
```

- [ ] **Step 2: Export `MediaElementBackend` from `src/index.ts`**

```ts
export { MediaElementBackend } from './backend/MediaElementBackend'
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/EventEmitter'
export { HttpAudioSource } from './source/HttpAudioSource'
export type { AudioBackend, AudioBackendEvents } from './backend/AudioBackend'
export type { AudioSource, AudioSourceKind, AudioStreamHandle } from './source/AudioSource'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/backend/MediaElementBackend.ts src/index.ts
git commit -m "feat: add media element audio backend"
```

### Task 6: Main Audio Player

**Files:**
- Create: `src/player/AudioPlayer.ts`
- Create: `src/player/AudioPlayer.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/player/AudioPlayer.ts`**

```ts
import type { AudioBackend } from '../backend/AudioBackend'
import type { AudioSource } from '../source/AudioSource'
import type { AudioPlayerEvents, AudioPlayerOptions, PlaybackState } from '../types'
import { MediaElementBackend } from '../backend/MediaElementBackend'
import { GAudioError } from '../errors/errors'
import { EventEmitter } from '../events/EventEmitter'
import { HttpAudioSource } from '../source/HttpAudioSource'

export class AudioPlayer {
  private readonly events = new EventEmitter<AudioPlayerEvents>()
  private readonly backend: AudioBackend
  private source?: AudioSource
  private state: PlaybackState = 'idle'

  constructor(options: AudioPlayerOptions = {}, backend: AudioBackend = new MediaElementBackend()) {
    this.backend = backend
    this.source = options.source ? new HttpAudioSource(options.source) : undefined

    this.backend.on('timeupdate', timeUpdate => {
      this.events.emit('timeupdate', timeUpdate)
    })

    this.backend.on('bufferupdate', bufferUpdate => {
      this.events.emit('bufferupdate', bufferUpdate)
    })

    this.backend.on('ended', () => {
      this.setState('ended')
      this.events.emit('ended', undefined)
    })

    this.backend.on('error', error => {
      this.setState('error')
      this.events.emit('error', error)
    })
  }

  getState(): PlaybackState {
    return this.state
  }

  getCurrentTime(): number {
    return this.backend.getCurrentTime()
  }

  getDuration(): number {
    return this.backend.getDuration()
  }

  setSource(source: string | AudioSource): void {
    this.source = typeof source === 'string' ? new HttpAudioSource(source) : source
    this.setState('idle')
  }

  async load(): Promise<void> {
    if (!this.source) {
      const error = new GAudioError('SOURCE_UNAVAILABLE', 'Audio source is required before loading')
      this.setState('error')
      this.events.emit('error', error)
      throw error
    }

    this.setState('loading')
    await this.backend.load(this.source)
    this.setState('ready')
  }

  async play(): Promise<void> {
    if (this.state === 'idle') {
      await this.load()
    }

    await this.backend.play()
    this.setState('playing')
  }

  pause(): void {
    this.backend.pause()
    this.setState('paused')
  }

  stop(): void {
    this.backend.stop()
    this.setState('idle')
  }

  async seek(seconds: number): Promise<void> {
    await this.backend.seek(seconds)
  }

  setVolume(volume: number): void {
    this.backend.setVolume(volume)
  }

  setPlaybackRate(rate: number): void {
    this.backend.setPlaybackRate(rate)
  }

  on<EventName extends keyof AudioPlayerEvents>(
    eventName: EventName,
    handler: (payload: AudioPlayerEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.backend.dispose()
    this.events.clear()
    this.source = undefined
    this.state = 'idle'
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) {
      return
    }

    this.state = state
    this.events.emit('statechange', state)
  }
}
```

- [ ] **Step 2: Create `src/player/AudioPlayer.test.ts`**

```ts
import type { AudioBackend, AudioBackendEvents } from '../backend/AudioBackend'
import type { AudioSource } from '../source/AudioSource'
import { describe, expect, it } from 'vitest'
import { EventEmitter } from '../events/EventEmitter'
import { AudioPlayer } from './AudioPlayer'

class FakeAudioBackend implements AudioBackend {
  private readonly events = new EventEmitter<AudioBackendEvents>()
  private currentTime = 0
  private duration = 120
  readonly loadedSources: AudioSource[] = []
  isPlaying = false
  volume = 1
  playbackRate = 1

  async load(source: AudioSource): Promise<void> {
    this.loadedSources.push(source)
  }

  async play(): Promise<void> {
    this.isPlaying = true
  }

  pause(): void {
    this.isPlaying = false
  }

  stop(): void {
    this.currentTime = 0
    this.isPlaying = false
  }

  async seek(seconds: number): Promise<void> {
    this.currentTime = seconds
  }

  setVolume(volume: number): void {
    this.volume = volume
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return this.duration
  }

  on<EventName extends keyof AudioBackendEvents>(
    eventName: EventName,
    handler: (payload: AudioBackendEvents[EventName]) => void,
  ): () => void {
    return this.events.on(eventName, handler)
  }

  dispose(): void {
    this.events.clear()
  }
}

describe('AudioPlayer', () => {
  it('loads a URL source and reports ready state', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, backend)
    const states: string[] = []

    player.on('statechange', state => {
      states.push(state)
    })

    await player.load()

    expect(backend.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
  })

  it('loads automatically before first play', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, backend)

    await player.play()

    expect(backend.loadedSources).toHaveLength(1)
    expect(backend.isPlaying).toBe(true)
    expect(player.getState()).toBe('playing')
  })

  it('throws a typed error when no source is available', async () => {
    const backend = new FakeAudioBackend()
    const player = new AudioPlayer({}, backend)

    await expect(player.load()).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(player.getState()).toBe('error')
  })
})
```

- [ ] **Step 3: Export `AudioPlayer` from `src/index.ts`**

```ts
export { MediaElementBackend } from './backend/MediaElementBackend'
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/EventEmitter'
export { AudioPlayer } from './player/AudioPlayer'
export { HttpAudioSource } from './source/HttpAudioSource'
export type { AudioBackend, AudioBackendEvents } from './backend/AudioBackend'
export type { AudioSource, AudioSourceKind, AudioStreamHandle } from './source/AudioSource'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm test src/player/AudioPlayer.test.ts`

Expected: PASS with all player state tests.

- [ ] **Step 5: Commit**

```bash
git add src/player/AudioPlayer.ts src/player/AudioPlayer.test.ts src/index.ts
git commit -m "feat: add main audio player"
```

### Task 7: Audio Analyzer

**Files:**
- Create: `src/analysis/AudioAnalyzer.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/analysis/AudioAnalyzer.ts`**

```ts
// @env browser

import type { FrequencyDataOptions, WaveformDataOptions } from '../types'

export class AudioAnalyzer {
  private readonly analyserNode: AnalyserNode

  constructor(audioContext: AudioContext, sourceNode: AudioNode, fftSize = 2048) {
    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = fftSize
    sourceNode.connect(this.analyserNode)
  }

  connect(destinationNode: AudioNode): void {
    this.analyserNode.connect(destinationNode)
  }

  getFrequencyData(options: FrequencyDataOptions = {}): Uint8Array {
    const dataLength = options.binCount ?? this.analyserNode.frequencyBinCount
    const frequencyData = new Uint8Array(dataLength)
    this.analyserNode.getByteFrequencyData(frequencyData)
    return frequencyData
  }

  getWaveformData(options: WaveformDataOptions = {}): Uint8Array {
    const dataLength = options.sampleCount ?? this.analyserNode.fftSize
    const waveformData = new Uint8Array(dataLength)
    this.analyserNode.getByteTimeDomainData(waveformData)
    return waveformData
  }

  dispose(): void {
    this.analyserNode.disconnect()
  }
}
```

- [ ] **Step 2: Export `AudioAnalyzer` from `src/index.ts`**

```ts
export { AudioAnalyzer } from './analysis/AudioAnalyzer'
export { MediaElementBackend } from './backend/MediaElementBackend'
export { GAudioError } from './errors/errors'
export { EventEmitter } from './events/EventEmitter'
export { AudioPlayer } from './player/AudioPlayer'
export { HttpAudioSource } from './source/HttpAudioSource'
export type { AudioBackend, AudioBackendEvents } from './backend/AudioBackend'
export type { AudioSource, AudioSourceKind, AudioStreamHandle } from './source/AudioSource'
export type {
  AudioPlayerEvents,
  AudioPlayerOptions,
  BufferUpdate,
  FrequencyDataOptions,
  GAudioErrorCode,
  PlaybackState,
  PreloadMode,
  TimeUpdate,
  WaveformDataOptions,
} from './types'
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/analysis/AudioAnalyzer.ts src/index.ts
git commit -m "feat: add web audio analyzer"
```

### Task 8: README and Full Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```md
# gaudio

A browser-first TypeScript audio streaming library.

## Install

```bash
pnpm add gaudio
```

## Quick Start

```ts
import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: 'https://example.com/audio.mp3',
  preload: 'auto',
})

player.on('statechange', state => {
  console.log(state)
})

await player.load()
await player.play()

player.setVolume(0.8)
await player.seek(30)
```

## Version 1 Scope

- Browser URL audio playback.
- Typed playback events.
- Basic playback controls.
- Stable error codes.
- Web Audio frequency and waveform access.

## Version 1 Limits

- HLS and DASH are not implemented in the first version.
- DRM and transcoding are outside the package scope.
- Custom codec decoding can be added later through a dedicated backend.
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: PASS for errors, event emitter, and player tests.

- [ ] **Step 5: Run build**

Run: `pnpm build`

Expected: PASS and `dist/index.js`, `dist/index.cjs`, and `dist/index.d.ts` are generated.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add audio library usage guide"
```

## Verification Matrix

- Executed after Task 2: `pnpm test src/errors/errors.test.ts`
- Executed after Task 3: `pnpm test src/events/EventEmitter.test.ts`
- Executed after Task 4: `pnpm typecheck`
- Executed after Task 5: `pnpm typecheck`
- Executed after Task 6: `pnpm test src/player/AudioPlayer.test.ts`
- Executed after Task 7: `pnpm typecheck`
- Executed after Task 8: `pnpm lint`
- Executed after Task 8: `pnpm typecheck`
- Executed after Task 8: `pnpm test`
- Executed after Task 8: `pnpm build`

## Future Expansion

- Add a `SegmentLoader` for HTTP Range requests and retry behavior.
- Add an MSE backend for controlled stream buffering.
- Add HLS adapter after the backend contract proves stable.
- Add `AudioWorklet` processors for custom DSP.
- Add Playwright browser integration tests for real media behavior.

## Self-Review

- Spec coverage: The plan covers tooling, public API, playback state, typed events, URL source playback, browser backend, analysis, tests, and docs.
- Placeholder scan: The plan contains no `TBD`, no unexpanded implementation steps, and no missing test commands.
- Type consistency: `AudioPlayer`, `AudioBackend`, `AudioSource`, `AudioPlayerEvents`, and `GAudioError` names are used consistently across tasks.
