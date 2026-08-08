import { describe, expect, it } from 'vitest'
import { AudioAnalyzer } from './audio-analyzer'

class FakeAnalyserNode {
  fftSize = 2048
  readonly connectedNodes: AudioNode[] = []
  isDisconnected = false
  disconnectCalls = 0
  disconnectError?: Error

  get frequencyBinCount(): number {
    return this.fftSize / 2
  }

  connect(destinationNode: AudioNode): AudioNode {
    this.connectedNodes.push(destinationNode)
    return destinationNode
  }

  disconnect(): void {
    this.disconnectCalls += 1
    if (this.disconnectError) {
      throw this.disconnectError
    }
    this.isDisconnected = true
  }

  getByteFrequencyData(frequencyData: Uint8Array): void {
    for (let index = 0; index < frequencyData.length; index += 1) {
      frequencyData[index] = index + 10
    }
  }

  getByteTimeDomainData(waveformData: Uint8Array): void {
    for (let index = 0; index < waveformData.length; index += 1) {
      waveformData[index] = 128 + index
    }
  }
}

class FakeAudioContext {
  constructor(private readonly analyserNode: FakeAnalyserNode) {}

  createAnalyser(): AnalyserNode {
    return this.analyserNode as unknown as AnalyserNode
  }
}

class FakeAudioNode {
  readonly connectedNodes: AudioNode[] = []
  readonly disconnectedNodes: AudioNode[] = []
  disconnectCalls = 0
  disconnectError?: Error

  connect(destinationNode: AudioNode): AudioNode {
    this.connectedNodes.push(destinationNode)
    return destinationNode
  }

  disconnect(destinationNode: AudioNode): void {
    this.disconnectCalls += 1
    if (this.disconnectError) {
      throw this.disconnectError
    }
    if (this.disconnectedNodes.includes(destinationNode)) {
      throw new DOMException('Connection is already disconnected', 'InvalidAccessError')
    }
    this.disconnectedNodes.push(destinationNode)
  }
}

describe('audioAnalyzer', () => {
  it('creates an analyser node and connects it to the source signal', () => {
    const analyserNode = new FakeAnalyserNode()
    const audioContext = new FakeAudioContext(analyserNode)
    const sourceNode = new FakeAudioNode()

    const analyzer = new AudioAnalyzer(
      audioContext as unknown as AudioContext,
      sourceNode as unknown as AudioNode,
      1024,
    )

    expect(analyserNode.fftSize).toBe(1024)
    expect(sourceNode.connectedNodes).toEqual([analyserNode])
    expect(analyzer.getFrequencyData({ binCount: 1 })).toEqual(new Uint8Array([10]))
  })

  it('returns frequency and waveform samples with default analyser lengths', () => {
    const analyserNode = new FakeAnalyserNode()
    const analyzer = new AudioAnalyzer(
      new FakeAudioContext(analyserNode) as unknown as AudioContext,
      new FakeAudioNode() as unknown as AudioNode,
      8,
    )

    expect([...analyzer.getFrequencyData()]).toEqual([10, 11, 12, 13])
    expect([...analyzer.getWaveformData()]).toEqual([128, 129, 130, 131, 132, 133, 134, 135])
  })

  it('returns requested sample counts and disconnects on dispose', () => {
    const analyserNode = new FakeAnalyserNode()
    const sourceNode = new FakeAudioNode()
    const analyzer = new AudioAnalyzer(
      new FakeAudioContext(analyserNode) as unknown as AudioContext,
      sourceNode as unknown as AudioNode,
    )
    const destinationNode = new FakeAudioNode()

    analyzer.connect(destinationNode as unknown as AudioNode)
    analyzer.dispose()
    analyzer.dispose()

    expect([...analyzer.getFrequencyData({ binCount: 3 })]).toEqual([10, 11, 12])
    expect([...analyzer.getWaveformData({ sampleCount: 3 })]).toEqual([128, 129, 130])
    expect(analyserNode.connectedNodes).toEqual([destinationNode])
    expect(sourceNode.disconnectedNodes).toEqual([analyserNode])
    expect(analyserNode.isDisconnected).toBe(true)
    expect(analyserNode.disconnectCalls).toBe(1)
  })

  it('finishes analyzer cleanup when the source disconnect fails and never retries disposal', () => {
    const analyserNode = new FakeAnalyserNode()
    const sourceNode = new FakeAudioNode()
    const disconnectError = new DOMException('Source disconnect failed', 'InvalidAccessError')
    sourceNode.disconnectError = disconnectError
    const analyzer = new AudioAnalyzer(
      new FakeAudioContext(analyserNode) as unknown as AudioContext,
      sourceNode as unknown as AudioNode,
    )

    expect(() => analyzer.dispose()).not.toThrow()
    expect(analyserNode.isDisconnected).toBe(true)
    expect(sourceNode.disconnectCalls).toBe(1)
    expect(analyserNode.disconnectCalls).toBe(1)

    expect(() => analyzer.dispose()).not.toThrow()
    expect(sourceNode.disconnectCalls).toBe(1)
    expect(analyserNode.disconnectCalls).toBe(1)
  })

  it('keeps source cleanup complete when analyzer output disconnection fails', () => {
    const analyserNode = new FakeAnalyserNode()
    analyserNode.disconnectError = new DOMException('Analyzer disconnect failed', 'InvalidAccessError')
    const sourceNode = new FakeAudioNode()
    const analyzer = new AudioAnalyzer(
      new FakeAudioContext(analyserNode) as unknown as AudioContext,
      sourceNode as unknown as AudioNode,
    )

    expect(() => analyzer.dispose()).not.toThrow()
    expect(sourceNode.disconnectedNodes).toEqual([analyserNode])
    expect(sourceNode.disconnectCalls).toBe(1)
    expect(analyserNode.disconnectCalls).toBe(1)
  })

  it('rejects new output connections after disposal with a stable engine error', () => {
    const analyserNode = new FakeAnalyserNode()
    const analyzer = new AudioAnalyzer(
      new FakeAudioContext(analyserNode) as unknown as AudioContext,
      new FakeAudioNode() as unknown as AudioNode,
    )

    analyzer.dispose()

    let connectionError: unknown
    try {
      analyzer.connect(new FakeAudioNode() as unknown as AudioNode)
    }
    catch (error) {
      connectionError = error
    }
    expect(connectionError).toMatchObject({ code: 'ENGINE_ERROR' })
  })
})
