import type { AudioAnalyzer } from '../analysis/audio-analyzer'
import type { AudioEngine } from '../engine/audio-engine'
import type { AudioEngineAdapter } from '../engine/audio-engine-adapter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAudioError } from '../errors/errors'
import { FakeAudioEngine } from '../test-support/fake-audio-engine'
import { AudioPlayer } from './audio-player'

class FakeHlsAdapter implements AudioEngineAdapter {
  readonly protocol = 'hls'
  createCalls = 0

  constructor(private readonly engine: AudioEngine) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return true
  }
}

class FakeDashAdapter implements AudioEngineAdapter {
  readonly protocol = 'dash'
  createCalls = 0

  constructor(private readonly engine: AudioEngine) {}

  createEngine(): AudioEngine {
    this.createCalls += 1
    return this.engine
  }

  isSupported(): boolean {
    return true
  }
}

class FakeAnalyzer {
  disposeCalls = 0

  connect(): void {}

  getFrequencyData(): Uint8Array {
    return new Uint8Array()
  }

  getWaveformData(): Uint8Array {
    return new Uint8Array()
  }

  dispose(): void {
    this.disposeCalls += 1
  }
}

class AnalyzerAudioEngine extends FakeAudioEngine {
  readonly analyzers: FakeAnalyzer[] = []
  readonly analyzerFftSizes: Array<number | undefined> = []

  createAnalyzer(options: { fftSize?: number } = {}): AudioAnalyzer {
    const analyzer = new FakeAnalyzer()
    this.analyzers.push(analyzer)
    this.analyzerFftSizes.push(options.fftSize)
    return analyzer as unknown as AudioAnalyzer
  }
}

class FakeMediaMetadata implements MediaMetadata {
  album: string
  artist: string
  artwork: MediaImage[]
  title: string

  constructor(init: MediaMetadataInit = {}) {
    this.album = init.album ?? ''
    this.artist = init.artist ?? ''
    this.artwork = init.artwork ? [...init.artwork] : []
    this.title = init.title ?? ''
  }
}

class FakeMediaSession implements MediaSession {
  metadata: MediaMetadata | null = null
  playbackState: MediaSessionPlaybackState = 'none'
  readonly actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler>()
  positionState?: MediaPositionState

  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
    if (handler) {
      this.actionHandlers.set(action, handler)
      return
    }

    this.actionHandlers.delete(action)
  }

  async setCameraActive(): Promise<void> {}

  async setMicrophoneActive(): Promise<void> {}

  setPositionState(state?: MediaPositionState): void {
    this.positionState = state
  }

  runAction(action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}): void {
    this.actionHandlers.get(action)?.({
      action,
      ...details,
    })
  }
}

async function waitForMediaSessionAction(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('audioPlayer', () => {
  it('applies media options and exposes engine capabilities', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      preload: 'auto',
      autoplay: true,
      muted: true,
      loop: true,
      volume: 0.6,
      playbackRate: 1.5,
      preservesPitch: false,
    }, engine)

    expect(player.getPreload()).toBe('auto')
    expect(player.getAutoplay()).toBe(true)
    expect(player.getVolume()).toBe(0.6)
    expect(player.isMuted()).toBe(true)
    expect(player.isLooping()).toBe(true)
    expect(player.getPlaybackRate()).toBe(1.5)
    expect(player.getPreservesPitch()).toBe(false)
    expect(player.getBufferedRanges()).toEqual([{ start: 0, end: 30 }])
    expect(player.getSeekableRanges()).toEqual([{ start: 0, end: 120 }])
    expect(player.getPlayedRanges()).toEqual([{ start: 5, end: 25 }])
    expect(player.canPlayType('audio/mpeg')).toBe('probably')
  })

  it('updates autoplay and pitch preservation at runtime', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setAutoplay(true)
    player.setPreservesPitch(false)

    expect(player.getAutoplay()).toBe(true)
    expect(player.getPreservesPitch()).toBe(false)
  })

  it('creates a configured analyzer after a source loads', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        fftSize: 1024,
      },
    }, engine)

    expect(player.getAnalyzer()).toBeUndefined()

    await player.load()

    expect(player.getAnalyzer()).toBe(engine.analyzers[0])
    expect(engine.analyzerFftSizes).toEqual([1024])
  })

  it('uses the default analyzer configuration for boolean analyzer options', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: true,
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBe(engine.analyzers[0])
    expect(engine.analyzerFftSizes).toEqual([2048])
  })

  it('supports custom analyzer factories for injected engines', async () => {
    const engine = new FakeAudioEngine()
    const analyzer = new FakeAnalyzer()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        fftSize: 512,
        createAnalyzer: (context) => {
          expect(context.engine).toBe(engine)
          expect(context.fftSize).toBe(512)
          return analyzer as unknown as AudioAnalyzer
        },
      },
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBe(analyzer)
  })

  it('releases player analyzers when sources change or the player is disposed', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/first.mp3',
      analyzer: true,
    }, engine)

    await player.load()
    const firstAnalyzer = engine.analyzers[0]

    player.setSource('https://example.com/second.mp3')

    expect(firstAnalyzer.disposeCalls).toBe(1)
    expect(player.getAnalyzer()).toBeUndefined()

    await player.load()
    const secondAnalyzer = engine.analyzers[1]
    player.dispose()

    expect(secondAnalyzer.disposeCalls).toBe(1)
  })

  it('does not create analyzer when analyzer options are disabled', async () => {
    const engine = new AnalyzerAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      analyzer: {
        enabled: false,
      },
    }, engine)

    await player.load()

    expect(player.getAnalyzer()).toBeUndefined()
    expect(engine.analyzers).toHaveLength(0)
  })

  it('publishes Media Session metadata, playback state, and position when enabled', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      source: 'https://example.com/audio.mp3',
      mediaSession: {
        metadata: {
          title: 'Episode 1',
          artist: 'GAudio',
          album: 'Browser Integration',
          artwork: [
            { src: 'https://example.com/cover.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      },
    }, engine)

    expect(player.getMediaSessionMetadata()).toMatchObject({
      title: 'Episode 1',
      artist: 'GAudio',
      album: 'Browser Integration',
    })
    expect(mediaSession.metadata).toMatchObject({
      title: 'Episode 1',
      artist: 'GAudio',
      album: 'Browser Integration',
      artwork: [
        { src: 'https://example.com/cover.png', sizes: '512x512', type: 'image/png' },
      ],
    })
    expect(mediaSession.playbackState).toBe('none')

    await player.load()

    expect(mediaSession.playbackState).toBe('paused')
    expect(mediaSession.positionState).toEqual({
      duration: 120,
      playbackRate: 1,
      position: 0,
    })

    engine.currentTime = 25
    engine.emit('timeupdate', { currentTime: 25, duration: 120 })
    engine.emit('playing', undefined)

    expect(mediaSession.playbackState).toBe('playing')
    expect(mediaSession.positionState).toEqual({
      duration: 120,
      playbackRate: 1,
      position: 25,
    })

    engine.emit('pause', undefined)
    player.dispose()

    expect(mediaSession.playbackState).toBe('none')
    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.actionHandlers.size).toBe(0)
  })

  it('updates Media Session metadata from playlist tracks and default metadata', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      mediaSession: {
        metadata: {
          title: 'Default title',
          artist: 'Default artist',
        },
      },
    }, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/first.mp3',
        metadata: {
          title: 'First track',
          artist: 'GAudio',
        },
      },
      {
        source: 'https://example.com/second.mp3',
        metadata: {
          title: 'Second track',
          artist: 'GAudio',
        },
      },
    ])

    expect(mediaSession.metadata).toMatchObject({ title: 'First track' })

    await player.next()

    expect(mediaSession.metadata).toMatchObject({ title: 'Second track' })

    player.setPlaylist([])

    expect(mediaSession.metadata).toMatchObject({ title: 'Default title' })

    player.setMediaSessionMetadata({
      title: 'Direct source title',
      artist: 'Direct source artist',
    })

    expect(mediaSession.metadata).toMatchObject({ title: 'Direct source title' })
  })

  it('handles Media Session system media actions through the player API', async () => {
    const mediaSession = new FakeMediaSession()
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({
      mediaSession: {
        seekOffset: 15,
      },
    }, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])
    await player.load()

    mediaSession.runAction('play')
    await waitForMediaSessionAction()

    expect(engine.playCalls).toBe(1)

    mediaSession.runAction('pause')

    expect(engine.isPlaying).toBe(false)

    engine.currentTime = 20
    mediaSession.runAction('seekforward')
    await waitForMediaSessionAction()

    expect(engine.currentTime).toBe(35)

    mediaSession.runAction('seekbackward', { seekOffset: 50 })
    await waitForMediaSessionAction()

    expect(engine.currentTime).toBe(0)

    mediaSession.runAction('seekto', { seekTime: 44, fastSeek: true })
    await waitForMediaSessionAction()

    expect(engine.fastSeekCalls).toEqual([44])
    expect(engine.currentTime).toBe(44)

    mediaSession.runAction('nexttrack')
    await waitForMediaSessionAction()

    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.playCalls).toBe(2)

    mediaSession.runAction('previoustrack')
    await waitForMediaSessionAction()

    expect(player.getPlaylistIndex()).toBe(0)
    expect(engine.playCalls).toBe(3)
  })

  it('disables engine-native autoplay so player orchestration remains observable', () => {
    const engine = new FakeAudioEngine()
    engine.setAutoplay(true)

    const player = new AudioPlayer({ autoplay: true }, engine)

    expect(player.getAutoplay()).toBe(true)
    expect(engine.getAutoplay()).toBe(false)
  })

  it('fast seeks through the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await player.fastSeek(24)

    expect(engine.fastSeekCalls).toEqual([24])
    expect(player.getCurrentTime()).toBe(24)
  })

  it('loads a URL source and reports ready state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const states: string[] = []

    player.on('statechange', (state) => {
      states.push(state)
    })

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(player.getState()).toBe('ready')
    expect(states).toEqual(['loading', 'ready'])
  })

  it('routes source descriptions through registered adapters', async () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(engine)
    const player = new AudioPlayer({ adapters: [adapter] })

    player.setSource({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
    await player.load()

    expect(adapter.createCalls).toBe(1)
    expect(engine.loadedSources[0]).toMatchObject({
      url: 'https://example.com/stream?id=1',
      protocol: 'hls',
    })
  })

  it('switches between HLS and DASH sources through the registered adapters', async () => {
    const hlsEngine = new FakeAudioEngine()
    const dashEngine = new FakeAudioEngine()
    const hlsAdapter = new FakeHlsAdapter(hlsEngine)
    const dashAdapter = new FakeDashAdapter(dashEngine)
    const player = new AudioPlayer({ adapters: [hlsAdapter, dashAdapter] })

    player.setSource({ url: 'https://example.com/audio.m3u8', protocol: 'hls' })
    await player.load()
    player.setSource({ url: 'https://example.com/audio.mpd', protocol: 'dash' })
    await player.load()

    expect(hlsAdapter.createCalls).toBe(1)
    expect(dashAdapter.createCalls).toBe(1)
    expect(hlsEngine.loadedSources).toHaveLength(1)
    expect(dashEngine.loadedSources).toHaveLength(1)
    expect(hlsEngine.isUnloaded).toBe(true)
    expect(hlsEngine.disposeCalls).toBe(1)
    expect(player.getState()).toBe('ready')
  })

  it('rejects adapters combined with an explicit custom engine', () => {
    const engine = new FakeAudioEngine()
    const adapter = new FakeHlsAdapter(new FakeAudioEngine())

    expect(() => new AudioPlayer({ adapters: [adapter] }, engine)).toThrow(TypeError)
  })

  it('releases adapter ownership when player construction fails', () => {
    const adapter = new FakeHlsAdapter(new FakeAudioEngine())

    expect(() => new AudioPlayer({ adapters: [adapter], volume: 2 })).toThrow(RangeError)

    const player = new AudioPlayer({ adapters: [adapter] })
    player.dispose()
  })

  it('forwards adaptive events and uses the error event for fatal state changes', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const implementations: string[] = []
    const streamErrors: boolean[] = []

    player.on('adaptivechange', ({ implementation }) => implementations.push(implementation))
    player.on('streamerror', ({ isFatal }) => streamErrors.push(isFatal))

    engine.emit('adaptivechange', { protocol: 'hls', implementation: 'hls.js' })
    engine.emit('streamerror', {
      protocol: 'hls',
      implementation: 'hls.js',
      category: 'segment',
      isFatal: true,
    })

    expect(player.getState()).toBe('idle')

    engine.emit('error', new GAudioError('SEGMENT_ERROR', 'Segment loading failed'))

    expect(implementations).toEqual(['hls.js'])
    expect(streamErrors).toEqual([true])
    expect(player.getState()).toBe('error')
  })

  it('starts playback after loading when autoplay is enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)

    await player.load()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(1)
  })

  it('does not duplicate playback when play loads with autoplay enabled', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)

    await player.play()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(1)
  })

  it('keeps the loaded source available after autoplay is blocked', async () => {
    const engine = new FakeAudioEngine()
    engine.playError = new GAudioError('PLAYBACK_BLOCKED', 'Browser blocked audio playback')
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3', autoplay: true }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    expect(player.getState()).toBe('error')
    expect(errors).toHaveLength(1)

    engine.playError = undefined
    await player.play()

    expect(engine.loadedSources).toHaveLength(1)
    expect(engine.playCalls).toBe(2)
  })

  it('rejects invalid numeric controls before mutating the engine', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    expect(() => player.setVolume(Number.NaN)).toThrow(RangeError)
    expect(() => player.setVolume(1.1)).toThrow(RangeError)
    expect(() => player.setPlaybackRate(0)).toThrow(RangeError)
    await expect(player.seek(-1)).rejects.toThrow(RangeError)
    await expect(player.fastSeek(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)

    expect(engine.volume).toBe(1)
    expect(engine.playbackRate).toBe(1)
    expect(player.getCurrentTime()).toBe(0)
    expect(engine.fastSeekCalls).toEqual([])
  })

  it('uses engine lifecycle events as the playback state source', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    await player.play()
    expect(player.getState()).toBe('ready')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    engine.emit('waiting', undefined)
    expect(player.getState()).toBe('buffering')

    engine.emit('playing', undefined)
    expect(player.getState()).toBe('playing')

    engine.emit('pause', undefined)
    expect(player.getState()).toBe('paused')
  })

  it('forwards typed lifecycle events', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const receivedEvents: string[] = []

    player.on('seeking', ({ currentTime }) => receivedEvents.push(`seeking:${currentTime}`))
    player.on('volumechange', ({ volume, isMuted }) => receivedEvents.push(`volume:${volume}:${isMuted}`))
    player.on('ratechange', ({ playbackRate }) => receivedEvents.push(`rate:${playbackRate}`))

    engine.emit('seeking', { currentTime: 12, duration: 120 })
    engine.emit('volumechange', { volume: 0.5, isMuted: true })
    engine.emit('ratechange', { playbackRate: 1.25 })

    expect(receivedEvents).toEqual(['seeking:12', 'volume:0.5:true', 'rate:1.25'])
  })

  it('returns the current source object', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/audio.mp3',
      kind: 'url',
    })

    player.setSource({
      url: 'https://example.com/stream.m3u8',
      protocol: 'hls',
    })

    expect(player.getSource()).toMatchObject({
      url: 'https://example.com/stream.m3u8',
      protocol: 'hls',
    })
  })

  it('reports adapter MIME support before an adaptive source is loaded', () => {
    const hlsAdapter = new FakeHlsAdapter(new FakeAudioEngine())
    const dashAdapter = new FakeDashAdapter(new FakeAudioEngine())
    const player = new AudioPlayer({ adapters: [hlsAdapter, dashAdapter] })

    expect(player.canPlayType('application/vnd.apple.mpegurl')).toBe('probably')
    expect(player.canPlayType('application/dash+xml')).toBe('probably')
    expect(player.canPlayType('audio/unknown')).toBe('')
  })

  it('exposes active adaptive playback and unified quality selection', async () => {
    const engine = new FakeAudioEngine()
    engine.activeAdaptivePlayback = { protocol: 'hls', implementation: 'hls.js' }
    engine.adaptiveVariants.push(
      { id: 'low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    )
    const player = new AudioPlayer({}, engine)

    expect(player.getActiveAdaptivePlayback()).toEqual({ protocol: 'hls', implementation: 'hls.js' })
    expect(player.getAdaptiveVariants()).toEqual([
      { id: 'low', bitrate: 64_000, codecs: 'mp4a.40.2' },
      { id: 'high', bitrate: 192_000, codecs: 'mp4a.40.2' },
    ])
    expect(player.getAdaptiveQualitySelection()).toBe('auto')

    await player.setAdaptiveQuality('high')

    expect(player.getAdaptiveQualitySelection()).toBe('high')
  })

  it('supports one-time player event listeners', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const states: string[] = []

    player.once('statechange', state => states.push(state))

    engine.emit('playing', undefined)
    engine.emit('pause', undefined)

    expect(states).toEqual(['playing'])
  })

  it('removes player listeners by event name or all at once', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)
    const states: string[] = []
    const playEvents: string[] = []

    player.on('statechange', state => states.push(state))
    player.on('play', () => playEvents.push('play'))

    player.removeAllListeners('statechange')
    engine.emit('playing', undefined)
    engine.emit('play', undefined)

    expect(states).toEqual([])
    expect(playEvents).toEqual(['play'])

    player.removeAllListeners()
    engine.emit('play', undefined)

    expect(playEvents).toEqual(['play'])
  })

  it('stops at ready without loading the source again', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    await player.load()
    engine.emit('playing', undefined)
    player.stop()
    await player.play()

    expect(player.getState()).toBe('ready')
    expect(engine.loadedSources).toHaveLength(1)
  })

  it('remains idle when stopped before a source is loaded', () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)

    player.stop()

    expect(player.getState()).toBe('idle')
  })

  it('unloads the active engine when the source changes', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({ source: 'https://example.com/first.mp3' }, engine)

    await player.load()
    player.setSource('https://example.com/second.mp3')

    expect(engine.isUnloaded).toBe(true)
    expect(player.getState()).toBe('idle')
  })

  it('throws a typed error when no source is available', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    await expect(player.load()).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(player.getState()).toBe('error')
  })

  it('does not publish aborted loads as player errors', async () => {
    class AbortingEngine extends FakeAudioEngine {
      override async load(): Promise<void> {
        throw new GAudioError('LOAD_ABORTED', 'Superseded by a newer source')
      }
    }

    const engine = new AbortingEngine()
    const player = new AudioPlayer({ source: 'https://example.com/audio.mp3' }, engine)
    const errors: GAudioError[] = []
    player.on('error', error => errors.push(error))

    await expect(player.load()).rejects.toMatchObject({ code: 'LOAD_ABORTED' })

    expect(errors).toEqual([])
    expect(player.getState()).toBe('idle')
  })

  it('selects playlist tracks with next and previous', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
      { source: 'https://example.com/third.mp3' },
    ])

    expect(player.getPlaylistIndex()).toBe(0)
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/first.mp3' })

    await player.load()
    await player.next()
    await player.previous()

    expect(player.getPlaylist().map(track => track.source)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
      'https://example.com/third.mp3',
    ])
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
      'https://example.com/first.mp3',
    ])
    expect(player.getPlaylistIndex()).toBe(0)
  })

  it('continues with the next playlist track after playback ends', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      { source: 'https://example.com/first.mp3' },
      { source: 'https://example.com/second.mp3' },
    ])

    await player.load()
    engine.emit('ended', undefined)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(player.getPlaylistIndex()).toBe(1)
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/first.mp3',
      'https://example.com/second.mp3',
    ])
    expect(engine.playCalls).toBe(1)
  })

  it('loads a playlist fallback source when the primary source fails', async () => {
    class FallbackAudioEngine extends FakeAudioEngine {
      override async load(source: Parameters<FakeAudioEngine['load']>[0]): Promise<void> {
        await super.load(source)

        if (source.url === 'https://example.com/primary.mp3') {
          throw new GAudioError('NETWORK_ERROR', 'Primary source failed')
        }
      }
    }

    const engine = new FallbackAudioEngine()
    const player = new AudioPlayer({}, engine)
    const errors: GAudioError[] = []

    player.on('error', error => errors.push(error))
    player.setPlaylist([
      {
        source: 'https://example.com/primary.mp3',
        fallbackSources: ['https://example.com/fallback.mp3'],
      },
    ])

    await player.load()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/primary.mp3',
      'https://example.com/fallback.mp3',
    ])
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/fallback.mp3' })
    expect(player.getPlaylistIndex()).toBe(0)
    expect(errors).toEqual([])
  })

  it('selects the default audio track for a playlist track', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/episode.zh-CN.m4a',
        defaultAudioTrackId: 'en',
        audioTracks: [
          {
            id: 'zh-CN',
            label: '简体中文',
            language: 'zh-CN',
            source: 'https://example.com/episode.zh-CN.m4a',
          },
          {
            id: 'en',
            label: 'English',
            language: 'en',
            source: 'https://example.com/episode.en.m4a',
          },
        ],
      },
    ])

    expect(player.getAudioTracks().map(audioTrack => audioTrack.id)).toEqual(['zh-CN', 'en'])
    expect(player.getSelectedAudioTrack()).toMatchObject({ id: 'en', language: 'en' })
    expect(player.getSource()).toMatchObject({ url: 'https://example.com/episode.en.m4a' })

    await player.load()

    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.en.m4a',
    ])
  })

  it('switches audio tracks while preserving time and playback state', async () => {
    const engine = new FakeAudioEngine()
    const player = new AudioPlayer({}, engine)

    player.setPlaylist([
      {
        source: 'https://example.com/episode.zh-CN.m4a',
        audioTracks: [
          {
            id: 'zh-CN',
            label: '简体中文',
            language: 'zh-CN',
            source: 'https://example.com/episode.zh-CN.m4a',
          },
          {
            id: 'ko',
            label: '한국어',
            language: 'ko',
            source: 'https://example.com/episode.ko.m4a',
          },
        ],
      },
    ])

    await player.load()
    await player.play()
    await player.seek(42)

    await player.selectAudioTrack('ko')

    expect(player.getSelectedAudioTrack()).toMatchObject({ id: 'ko' })
    expect(engine.loadedSources.map(source => source.url)).toEqual([
      'https://example.com/episode.zh-CN.m4a',
      'https://example.com/episode.ko.m4a',
    ])
    expect(player.getCurrentTime()).toBe(42)
    expect(engine.playCalls).toBe(2)
  })
})
