<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import { AudioAnalyzer } from 'gaudio'
import { computed, onUnmounted, shallowRef, useTemplateRef } from 'vue'

type AudioContextConstructor = typeof AudioContext

interface WebAudioWindow extends Window {
  webkitAudioContext?: AudioContextConstructor
}

interface VisualizerSession {
  audioContext: AudioContext
  analyzer: AudioAnalyzer
  oscillator: OscillatorNode
  gain: GainNode
  animationId: number
  startedAt: number
}

const props = defineProps<{
  text: DemoText
}>()

const spectrumCanvas = useTemplateRef<HTMLCanvasElement>('spectrumCanvas')
const isVisualizing = shallowRef(false)
const visualizerStatus = shallowRef('idle')
const visualizerPeakLabel = shallowRef('none')
const visualizerEnergyLabel = shallowRef('0%')
const visualizerButtonLabel = computed(() => isVisualizing.value ? props.text.visualizer.stop : props.text.visualizer.start)

let visualizerSession: VisualizerSession | undefined

function audioContextClass(): AudioContextConstructor | undefined {
  return window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext
}

function canvasContext(): CanvasRenderingContext2D | undefined {
  return spectrumCanvas.value?.getContext('2d') ?? undefined
}

function canvasSize(canvas: HTMLCanvasElement): { width: number, height: number } {
  const canvasBounds = canvas.getBoundingClientRect()
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(320, Math.floor(canvasBounds.width * pixelRatio))
  const height = Math.max(220, Math.floor(canvasBounds.height * pixelRatio))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  return { width, height }
}

function paintSpectrum(session: VisualizerSession): void {
  if (visualizerSession !== session) {
    return
  }

  const canvas = spectrumCanvas.value
  const context = canvasContext()

  if (!canvas || !context) {
    session.animationId = window.requestAnimationFrame(() => paintSpectrum(session))
    return
  }

  const { width, height } = canvasSize(canvas)
  const elapsedMilliseconds = performance.now() - session.startedAt
  const frequencySamples = session.analyzer.getFrequencyData({ binCount: 96 })
  const waveformSamples = session.analyzer.getWaveformData({ sampleCount: 160 })
  const peakSample = frequencySamples.reduce((peak, sample) => Math.max(peak, sample), 0)
  const peakIndex = frequencySamples.findIndex(sample => sample === peakSample)
  const averageEnergy = frequencySamples.reduce((sum, sample) => sum + sample, 0) / frequencySamples.length
  const peakFrequency = Math.round((peakIndex / frequencySamples.length) * (session.audioContext.sampleRate / 2))

  session.oscillator.frequency.setTargetAtTime(
    220 + Math.sin(elapsedMilliseconds / 520) * 90 + Math.cos(elapsedMilliseconds / 870) * 45,
    session.audioContext.currentTime,
    0.04,
  )

  visualizerPeakLabel.value = `${peakFrequency} Hz`
  visualizerEnergyLabel.value = `${Math.round((averageEnergy / 255) * 100)}%`

  const backgroundGradient = context.createLinearGradient(0, 0, width, height)
  backgroundGradient.addColorStop(0, '#071018')
  backgroundGradient.addColorStop(0.45, '#101827')
  backgroundGradient.addColorStop(1, '#180b16')
  context.fillStyle = backgroundGradient
  context.fillRect(0, 0, width, height)

  const barWidth = width / frequencySamples.length
  frequencySamples.forEach((sample, index) => {
    const magnitude = sample / 255
    const barHeight = Math.max(4, magnitude * height * 0.58)
    const xPosition = index * barWidth
    const yPosition = height - barHeight
    const hue = 178 + magnitude * 130 + Math.sin((index + elapsedMilliseconds / 80) / 8) * 24

    context.fillStyle = `hsl(${hue}, 78%, ${48 + magnitude * 20}%)`
    context.fillRect(xPosition, yPosition, Math.max(2, barWidth - 2), barHeight)
  })

  const centerX = width / 2
  const centerY = height * 0.43
  const innerRadius = Math.min(width, height) * 0.15
  frequencySamples.forEach((sample, index) => {
    if (index % 3 !== 0) {
      return
    }

    const magnitude = sample / 255
    const angle = (index / frequencySamples.length) * Math.PI * 2 + elapsedMilliseconds / 2200
    const startRadius = innerRadius + magnitude * 10
    const endRadius = innerRadius + 24 + magnitude * 86

    context.strokeStyle = `rgba(245, 158, 11, ${0.18 + magnitude * 0.52})`
    context.lineWidth = 1 + magnitude * 3
    context.beginPath()
    context.moveTo(centerX + Math.cos(angle) * startRadius, centerY + Math.sin(angle) * startRadius)
    context.lineTo(centerX + Math.cos(angle) * endRadius, centerY + Math.sin(angle) * endRadius)
    context.stroke()
  })

  context.strokeStyle = '#f43f5e'
  context.lineWidth = 3
  context.beginPath()
  waveformSamples.forEach((sample, index) => {
    const xPosition = (index / (waveformSamples.length - 1)) * width
    const yPosition = height * 0.48 + ((sample - 128) / 128) * height * 0.18

    if (index === 0) {
      context.moveTo(xPosition, yPosition)
      return
    }

    context.lineTo(xPosition, yPosition)
  })
  context.stroke()

  session.animationId = window.requestAnimationFrame(() => paintSpectrum(session))
}

// AI modified: add a browser-only AudioAnalyzer canvas without depending on AudioPlayer internals.
async function startVisualization(): Promise<void> {
  if (visualizerSession) {
    return
  }

  const AudioContextClass = audioContextClass()

  if (!AudioContextClass) {
    visualizerStatus.value = props.text.visualizer.unavailable
    return
  }

  const audioContext = new AudioContextClass()
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const analyzer = new AudioAnalyzer(audioContext, oscillator, 2048)

  gain.gain.value = 0
  oscillator.type = 'sawtooth'
  oscillator.frequency.value = 220
  analyzer.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start()

  visualizerSession = {
    audioContext,
    analyzer,
    oscillator,
    gain,
    animationId: 0,
    startedAt: performance.now(),
  }

  try {
    await audioContext.resume()
    isVisualizing.value = true
    visualizerStatus.value = props.text.visualizer.running
    paintSpectrum(visualizerSession)
  }
  catch (error) {
    visualizerStatus.value = error instanceof Error ? error.message : props.text.visualizer.unavailable
    await stopVisualization()
  }
}

async function stopVisualization(): Promise<void> {
  const activeSession = visualizerSession

  if (!activeSession) {
    return
  }

  visualizerSession = undefined
  window.cancelAnimationFrame(activeSession.animationId)

  try {
    activeSession.oscillator.stop()
  }
  catch {}

  activeSession.analyzer.dispose()
  activeSession.gain.disconnect()

  if (activeSession.audioContext.state !== 'closed') {
    await activeSession.audioContext.close()
  }

  isVisualizing.value = false
  visualizerStatus.value = props.text.visualizer.stopped
}

function toggleVisualization(): void {
  if (isVisualizing.value) {
    void stopVisualization()
    return
  }

  void startVisualization()
}

onUnmounted(() => {
  void stopVisualization()
})
</script>

<template>
  <section class="visualizer" :aria-label="text.visualizer.ariaLabel">
    <div class="visualizer__header">
      <div>
        <h2>{{ text.visualizer.title }}</h2>
        <p>{{ text.visualizer.description }}</p>
      </div>
      <button type="button" @click="toggleVisualization">
        {{ visualizerButtonLabel }}
      </button>
    </div>

    <canvas ref="spectrumCanvas" class="visualizer__canvas" width="960" height="360" />

    <dl class="visualizer__stats">
      <div>
        <dt>{{ text.visualizer.status }}</dt>
        <dd>{{ visualizerStatus }}</dd>
      </div>
      <div>
        <dt>{{ text.visualizer.peak }}</dt>
        <dd>{{ visualizerPeakLabel }}</dd>
      </div>
      <div>
        <dt>{{ text.visualizer.energy }}</dt>
        <dd>{{ visualizerEnergyLabel }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.visualizer {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.visualizer__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.visualizer h2,
.visualizer p {
  margin: 0;
}

.visualizer p {
  color: var(--vp-c-text-2);
}

.visualizer button {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--vp-c-brand-1);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.visualizer__canvas {
  width: 100%;
  height: 260px;
  border-radius: 8px;
  background: #071018;
}

.visualizer__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.visualizer__stats div {
  display: grid;
  gap: 2px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px;
  background: var(--vp-c-bg);
}

.visualizer__stats dt {
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.visualizer__stats dd {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .visualizer__header {
    display: grid;
  }

  .visualizer__canvas {
    height: 220px;
  }

  .visualizer__stats {
    grid-template-columns: 1fr;
  }
}
</style>
