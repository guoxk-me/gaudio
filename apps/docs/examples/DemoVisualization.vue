<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'

interface CanvasDimensions {
  width: number
  height: number
}

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const analyzerCanvas = useTemplateRef<HTMLCanvasElement>('analyzerCanvas')
const analyzerStatus = shallowRef('waiting for player analyzer')
const analyzerPeakLabel = shallowRef('none')
const analyzerEnergyLabel = shallowRef('0%')

const analyzerSummary = computed(() => [
  { label: props.text.visualizer.status, value: analyzerStatus.value },
  { label: props.text.visualizer.peak, value: analyzerPeakLabel.value },
  { label: props.text.visualizer.energy, value: analyzerEnergyLabel.value },
])

let animationId = 0

function canvasDimensions(canvas: HTMLCanvasElement): CanvasDimensions {
  const canvasBounds = canvas.getBoundingClientRect()
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(420, Math.floor(canvasBounds.width * pixelRatio))
  const height = Math.max(260, Math.floor(canvasBounds.height * pixelRatio))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  return { width, height }
}

function canvasContext(): CanvasRenderingContext2D | undefined {
  return analyzerCanvas.value?.getContext('2d') ?? undefined
}

function paintAnalyzerBackground(context: CanvasRenderingContext2D, dimensions: CanvasDimensions): void {
  const { width, height } = dimensions

  context.fillStyle = '#0b0f0e'
  context.fillRect(0, 0, width, height)

  context.strokeStyle = 'rgba(166, 156, 132, 0.12)'
  context.lineWidth = 1

  for (let row = 1; row < 6; row += 1) {
    const yPosition = (height / 6) * row
    context.beginPath()
    context.moveTo(0, yPosition)
    context.lineTo(width, yPosition)
    context.stroke()
  }

  for (let column = 1; column < 10; column += 1) {
    const xPosition = (width / 10) * column
    context.beginPath()
    context.moveTo(xPosition, height * 0.3)
    context.lineTo(xPosition, height)
    context.stroke()
  }
}

function paintIdleAnalyzer(context: CanvasRenderingContext2D, dimensions: CanvasDimensions): void {
  const { width, height } = dimensions

  paintAnalyzerBackground(context, dimensions)

  context.strokeStyle = 'rgba(217, 154, 66, 0.24)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, height * 0.3)
  context.lineTo(width, height * 0.3)
  context.stroke()

  context.fillStyle = 'rgba(216, 209, 192, 0.62)'
  context.font = `${Math.max(12, Math.round(width / 90))}px ui-monospace, SFMono-Regular, Consolas, monospace`
  context.fillText('Analyzer waiting for loaded player audio', 22, height * 0.48)

  analyzerStatus.value = 'waiting'
  analyzerPeakLabel.value = 'none'
  analyzerEnergyLabel.value = '0%'
}

function paintWaveform(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, waveformSamples: Uint8Array): void {
  const { width, height } = dimensions
  const waveformTop = height * 0.08
  const waveformHeight = height * 0.34
  const centerY = waveformTop + waveformHeight * 0.52

  context.strokeStyle = '#b67a2d'
  context.lineWidth = 1.6
  context.beginPath()

  waveformSamples.forEach((sample, index) => {
    const xPosition = (index / (waveformSamples.length - 1)) * (width * 0.86)
    const yPosition = centerY + ((sample - 128) / 128) * waveformHeight * 0.42

    if (index === 0) {
      context.moveTo(xPosition, yPosition)
      return
    }

    context.lineTo(xPosition, yPosition)
  })

  context.stroke()
}

function paintSpectrum(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, frequencySamples: Uint8Array): void {
  const { width, height } = dimensions
  const spectrumTop = height * 0.48
  const spectrumHeight = height * 0.42
  const spectrumWidth = width * 0.86
  const barWidth = spectrumWidth / frequencySamples.length

  frequencySamples.forEach((sample, index) => {
    const magnitude = sample / 255
    const barHeight = Math.max(1, magnitude * spectrumHeight)
    const xPosition = index * barWidth
    const yPosition = spectrumTop + spectrumHeight - barHeight
    const hueMix = Math.min(1, Math.max(0, magnitude))

    context.fillStyle = `rgba(${104 + hueMix * 46}, ${123 + hueMix * 54}, ${80 + hueMix * 34}, ${0.38 + hueMix * 0.5})`
    context.fillRect(xPosition, yPosition, Math.max(1, barWidth - 2), barHeight)
  })
}

function paintLevelMeters(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, waveformSamples: Uint8Array): void {
  const { width, height } = dimensions
  const meterLeft = width * 0.91
  const meterTop = height * 0.18
  const meterWidth = Math.max(8, width * 0.012)
  const meterHeight = height * 0.7
  const midpoint = Math.floor(waveformSamples.length / 2)
  const leftEnergy = waveformSamples.slice(0, midpoint).reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / midpoint
  const rightEnergy = waveformSamples.slice(midpoint).reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / midpoint
  const levels = [Math.min(1, leftEnergy / 64), Math.min(1, rightEnergy / 64)]

  context.fillStyle = 'rgba(166, 156, 132, 0.72)'
  context.font = `${Math.max(10, Math.round(width / 110))}px ui-monospace, SFMono-Regular, Consolas, monospace`
  context.fillText('L', meterLeft, meterTop - 12)
  context.fillText('R', meterLeft + meterWidth * 2.3, meterTop - 12)

  levels.forEach((level, meterIndex) => {
    const xPosition = meterLeft + meterIndex * meterWidth * 2.3
    const litHeight = meterHeight * level

    context.fillStyle = 'rgba(48, 53, 47, 0.84)'
    context.fillRect(xPosition, meterTop, meterWidth, meterHeight)

    const gradient = context.createLinearGradient(0, meterTop + meterHeight, 0, meterTop)
    gradient.addColorStop(0, '#7fac62')
    gradient.addColorStop(0.72, '#d9a242')
    gradient.addColorStop(1, '#c35f3b')
    context.fillStyle = gradient
    context.fillRect(xPosition, meterTop + meterHeight - litHeight, meterWidth, litHeight)

    context.strokeStyle = '#0b0f0e'
    context.lineWidth = 2
    for (let segment = 1; segment < 18; segment += 1) {
      const yPosition = meterTop + (meterHeight / 18) * segment
      context.beginPath()
      context.moveTo(xPosition, yPosition)
      context.lineTo(xPosition + meterWidth, yPosition)
      context.stroke()
    }
  })
}

function paintAnalyzerFrame(): void {
  const canvas = analyzerCanvas.value
  const context = canvasContext()

  if (!canvas || !context) {
    animationId = window.requestAnimationFrame(paintAnalyzerFrame)
    return
  }

  const dimensions = canvasDimensions(canvas)
  const analyzer = props.demo.playerAnalyzer()

  if (!analyzer) {
    paintIdleAnalyzer(context, dimensions)
    animationId = window.requestAnimationFrame(paintAnalyzerFrame)
    return
  }

  const frequencySamples = analyzer.getFrequencyData({ binCount: 128 })
  const waveformSamples = analyzer.getWaveformData({ sampleCount: 256 })
  const peakSample = frequencySamples.reduce((peak, sample) => Math.max(peak, sample), 0)
  const peakIndex = frequencySamples.findIndex(sample => sample === peakSample)
  const averageEnergy = frequencySamples.reduce((sum, sample) => sum + sample, 0) / frequencySamples.length
  const peakFrequency = Math.round((peakIndex / frequencySamples.length) * 20000)

  paintAnalyzerBackground(context, dimensions)
  paintWaveform(context, dimensions, waveformSamples)
  paintSpectrum(context, dimensions, frequencySamples)
  paintLevelMeters(context, dimensions, waveformSamples)

  // AI modified: analyzer visualization now reflects the active AudioPlayer signal instead of a synthetic oscillator.
  analyzerStatus.value = props.demo.isPaused.value ? 'ready' : 'live from player'
  analyzerPeakLabel.value = peakSample === 0 ? 'none' : `${peakFrequency} Hz`
  analyzerEnergyLabel.value = `${Math.round((averageEnergy / 255) * 100)}%`
  animationId = window.requestAnimationFrame(paintAnalyzerFrame)
}

onMounted(() => {
  animationId = window.requestAnimationFrame(paintAnalyzerFrame)
})

onUnmounted(() => {
  window.cancelAnimationFrame(animationId)
})
</script>

<template>
  <section class="analyzer-console" :aria-label="text.visualizer.ariaLabel">
    <div class="analyzer-console__tabs" aria-hidden="true">
      <strong>{{ text.visualizer.waveform }}</strong>
      <span>{{ text.visualizer.bars }}</span>
    </div>

    <canvas ref="analyzerCanvas" class="analyzer-console__canvas" width="920" height="320" />

    <dl class="analyzer-console__summary">
      <div v-for="summary in analyzerSummary" :key="summary.label">
        <dt>{{ summary.label }}</dt>
        <dd>{{ summary.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.analyzer-console {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  background: var(--demo-panel);
}

.analyzer-console__tabs {
  display: flex;
  gap: 22px;
  align-items: center;
  border-bottom: 1px solid var(--demo-line);
  padding: 12px 16px 10px;
  color: var(--demo-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.analyzer-console__tabs strong {
  color: var(--demo-amber);
}

.analyzer-console__canvas {
  width: 100%;
  height: 286px;
  background: var(--demo-canvas);
}

.analyzer-console__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid var(--demo-line);
}

.analyzer-console__summary div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 11px 14px;
}

.analyzer-console__summary div + div {
  border-left: 1px solid var(--demo-line);
}

.analyzer-console__summary dt {
  color: var(--demo-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.analyzer-console__summary dd {
  margin: 0;
  color: var(--demo-text);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .analyzer-console__canvas {
    height: 220px;
  }

  .analyzer-console__summary {
    grid-template-columns: 1fr;
  }

  .analyzer-console__summary div + div {
    border-top: 1px solid var(--demo-line);
    border-left: 0;
  }
}
</style>
