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
