// @env browser

import type { FrequencyDataOptions, WaveformDataOptions } from '../types'

/** Provides byte-based frequency and waveform samples from a Web Audio graph. */
export class AudioAnalyzer {
  private readonly analyserNode: AnalyserNode

  /**
   * Creates and connects an analyzer node to an existing source node.
   *
   * @param audioContext Context used to create the analyzer node.
   * @param sourceNode Node whose audio signal should be analyzed.
   * @param fftSize FFT window size supported by [AnalyserNode.fftSize](https://developer.mozilla.org/docs/Web/API/AnalyserNode/fftSize).
   * @defaultValue `2048`
   * @throws A DOM exception when `fftSize` is outside the browser-supported range or is not a power of two.
   */
  constructor(audioContext: AudioContext, sourceNode: AudioNode, fftSize = 2048) {
    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = fftSize
    sourceNode.connect(this.analyserNode)
  }

  /**
   * Connects analyzed audio to another Web Audio node.
   *
   * @param destinationNode Node that should receive the analyzer output.
   */
  connect(destinationNode: AudioNode): void {
    this.analyserNode.connect(destinationNode)
  }

  /**
   * Reads the current frequency spectrum as unsigned byte magnitudes.
   *
   * @param options Controls the number of returned frequency bins.
   * @returns A new byte array containing values from `0` to `255`.
   */
  getFrequencyData(options: FrequencyDataOptions = {}): Uint8Array {
    const dataLength = options.binCount ?? this.analyserNode.frequencyBinCount
    const frequencyData = new Uint8Array(dataLength)
    this.analyserNode.getByteFrequencyData(frequencyData)
    return frequencyData
  }

  /**
   * Reads the current time-domain waveform as unsigned byte samples.
   *
   * @param options Controls the number of returned waveform samples.
   * @returns A new byte array centered around `128`.
   */
  getWaveformData(options: WaveformDataOptions = {}): Uint8Array {
    const dataLength = options.sampleCount ?? this.analyserNode.fftSize
    const waveformData = new Uint8Array(dataLength)
    this.analyserNode.getByteTimeDomainData(waveformData)
    return waveformData
  }

  /** Disconnects the internal analyzer node from all destinations. */
  dispose(): void {
    this.analyserNode.disconnect()
  }
}
