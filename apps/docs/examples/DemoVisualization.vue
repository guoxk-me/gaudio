<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

interface CanvasDimensions {
  width: number
  height: number
}

interface AnalyzerPalette {
  canvas: string
  grid: string
  soft: string
  line: string
  meterLow: string
  meterMid: string
  meterHigh: string
  text: string
}

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const analyzerCanvas = useTemplateRef<HTMLCanvasElement>('analyzerCanvas')
const analyzerStatus = shallowRef(props.text.visualizer.stopped)
const analyzerPeakLabel = shallowRef(props.text.visualizer.none)
const analyzerEnergyLabel = shallowRef('0%')

const analyzerSummary = computed(() => [
  { label: props.text.visualizer.status, value: analyzerStatus.value },
  { label: props.text.visualizer.peak, value: analyzerPeakLabel.value },
  { label: props.text.visualizer.energy, value: analyzerEnergyLabel.value },
])

let animationId = 0
let canvasDimensionsCache: CanvasDimensions | undefined
let analyzerPaletteCache: AnalyzerPalette | undefined
let isCanvasVisible = false
let isDocumentVisible = true
let shouldReduceMotion = false
let lastSummaryUpdate = 0
let intersectionObserver: IntersectionObserver | undefined
let themeObserver: MutationObserver | undefined
let motionPreference: MediaQueryList | undefined

function cssVariableColor(canvas: HTMLCanvasElement, name: string, fallbackColor: string): string {
  return getComputedStyle(canvas.closest('.gaudio-studio') ?? canvas).getPropertyValue(name).trim() || fallbackColor
}

function analyzerPalette(canvas: HTMLCanvasElement): AnalyzerPalette {
  return {
    canvas: cssVariableColor(canvas, '--gaudio-studio-canvas', '#edf6fa'),
    grid: cssVariableColor(canvas, '--gaudio-studio-canvas-grid', 'rgba(8, 35, 60, 0.14)'),
    soft: cssVariableColor(canvas, '--gaudio-studio-canvas-soft', 'rgba(0, 109, 151, 0.22)'),
    line: cssVariableColor(canvas, '--gaudio-studio-canvas-line', '#007f9a'),
    meterLow: cssVariableColor(canvas, '--gaudio-studio-canvas-meter-low', '#b9dfe8'),
    meterMid: cssVariableColor(canvas, '--gaudio-studio-canvas-meter-mid', '#2f98ad'),
    meterHigh: cssVariableColor(canvas, '--gaudio-studio-canvas-meter-high', '#005f86'),
    text: cssVariableColor(canvas, '--gaudio-studio-text-muted', '#496879'),
  }
}

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

function refreshCanvasPresentation(): void {
  const canvas = analyzerCanvas.value

  if (!canvas) {
    return
  }

  // AI modified: expensive layout and style reads now run only after resize or theme changes.
  canvasDimensionsCache = canvasDimensions(canvas)
  analyzerPaletteCache = analyzerPalette(canvas)
}

function paintAnalyzerBackground(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, palette: AnalyzerPalette): void {
  const { width, height } = dimensions

  // AI modified: canvas colors now follow the surrounding demo theme instead of a fixed dark console.
  context.fillStyle = palette.canvas
  context.fillRect(0, 0, width, height)

  context.strokeStyle = palette.grid
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

function paintIdleAnalyzer(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, palette: AnalyzerPalette): void {
  const { width, height } = dimensions

  paintAnalyzerBackground(context, dimensions, palette)

  context.strokeStyle = palette.soft
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, height * 0.3)
  context.lineTo(width, height * 0.3)
  context.stroke()

  context.fillStyle = palette.text
  context.font = `${Math.max(12, Math.round(width / 90))}px ui-monospace, SFMono-Regular, Consolas, monospace`
  context.fillText(props.text.visualizer.waitingCanvas, 22, height * 0.48)

  analyzerStatus.value = props.text.visualizer.stopped
  analyzerPeakLabel.value = props.text.visualizer.none
  analyzerEnergyLabel.value = '0%'
}

function paintWaveform(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, waveformSamples: Uint8Array, palette: AnalyzerPalette): void {
  const { width, height } = dimensions
  const waveformTop = height * 0.08
  const waveformHeight = height * 0.34
  const centerY = waveformTop + waveformHeight * 0.52

  context.strokeStyle = palette.line
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

function paintSpectrum(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, frequencySamples: Uint8Array, palette: AnalyzerPalette): void {
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
    context.fillStyle = magnitude > 0.66 ? palette.meterHigh : magnitude > 0.32 ? palette.meterMid : palette.meterLow
    context.globalAlpha = 0.34 + magnitude * 0.48
    context.fillRect(xPosition, yPosition, Math.max(1, barWidth - 2), barHeight)
    context.globalAlpha = 1
  })
}

function paintLevelMeters(context: CanvasRenderingContext2D, dimensions: CanvasDimensions, waveformSamples: Uint8Array, palette: AnalyzerPalette): void {
  const { width, height } = dimensions
  const meterLeft = width * 0.91
  const meterTop = height * 0.18
  const meterWidth = Math.max(8, width * 0.012)
  const meterHeight = height * 0.7
  const midpoint = Math.floor(waveformSamples.length / 2)
  const leftEnergy = waveformSamples.slice(0, midpoint).reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / midpoint
  const rightEnergy = waveformSamples.slice(midpoint).reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / midpoint
  const levels = [Math.min(1, leftEnergy / 64), Math.min(1, rightEnergy / 64)]

  context.fillStyle = palette.text
  context.font = `${Math.max(10, Math.round(width / 110))}px ui-monospace, SFMono-Regular, Consolas, monospace`
  context.fillText('L', meterLeft, meterTop - 12)
  context.fillText('R', meterLeft + meterWidth * 2.3, meterTop - 12)

  levels.forEach((level, meterIndex) => {
    const xPosition = meterLeft + meterIndex * meterWidth * 2.3
    const litHeight = meterHeight * level

    context.fillStyle = palette.soft
    context.fillRect(xPosition, meterTop, meterWidth, meterHeight)

    const gradient = context.createLinearGradient(0, meterTop + meterHeight, 0, meterTop)
    gradient.addColorStop(0, palette.meterLow)
    gradient.addColorStop(0.72, palette.meterMid)
    gradient.addColorStop(1, palette.meterHigh)
    context.fillStyle = gradient
    context.fillRect(xPosition, meterTop + meterHeight - litHeight, meterWidth, litHeight)

    context.strokeStyle = palette.canvas
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

function isAnalyzerAnimating(): boolean {
  return isCanvasVisible
    && isDocumentVisible
    && !shouldReduceMotion
    && !props.demo.isPaused.value
    && props.demo.playerAnalyzer() !== undefined
}

function requestAnalyzerFrame(): void {
  if (animationId !== 0 || !isCanvasVisible || !isDocumentVisible) {
    return
  }

  animationId = window.requestAnimationFrame(paintAnalyzerFrame)
}

function paintAnalyzerFrame(timestamp = 0): void {
  animationId = 0
  const canvas = analyzerCanvas.value
  const context = canvasContext()

  if (!canvas || !context) {
    return
  }

  if (!canvasDimensionsCache || !analyzerPaletteCache) {
    refreshCanvasPresentation()
  }

  const dimensions = canvasDimensionsCache
  const palette = analyzerPaletteCache

  if (!dimensions || !palette) {
    return
  }

  const analyzer = props.demo.playerAnalyzer()

  if (!analyzer) {
    paintIdleAnalyzer(context, dimensions, palette)
    return
  }

  const frequencySamples = analyzer.getFrequencyData({ binCount: 128 })
  const waveformSamples = analyzer.getWaveformData({ sampleCount: 256 })
  const peakSample = frequencySamples.reduce((peak, sample) => Math.max(peak, sample), 0)
  const peakIndex = frequencySamples.findIndex(sample => sample === peakSample)
  const averageEnergy = frequencySamples.reduce((sum, sample) => sum + sample, 0) / frequencySamples.length
  const peakFrequency = Math.round((peakIndex / frequencySamples.length) * 20000)

  paintAnalyzerBackground(context, dimensions, palette)
  paintWaveform(context, dimensions, waveformSamples, palette)
  paintSpectrum(context, dimensions, frequencySamples, palette)
  paintLevelMeters(context, dimensions, waveformSamples, palette)

  if (timestamp - lastSummaryUpdate >= 250 || !isAnalyzerAnimating()) {
    // AI modified: reactive status writes are throttled while canvas painting remains smooth.
    analyzerStatus.value = props.demo.isPaused.value || shouldReduceMotion
      ? props.text.visualizer.ready
      : props.text.visualizer.running
    analyzerPeakLabel.value = peakSample === 0 ? props.text.visualizer.none : `${peakFrequency} Hz`
    analyzerEnergyLabel.value = `${Math.round((averageEnergy / 255) * 100)}%`
    lastSummaryUpdate = timestamp
  }

  if (isAnalyzerAnimating()) {
    requestAnalyzerFrame()
  }
}

onMounted(() => {
  const canvas = analyzerCanvas.value

  if (!canvas) {
    return
  }

  isDocumentVisible = document.visibilityState === 'visible'
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  shouldReduceMotion = motionPreference.matches

  intersectionObserver = new IntersectionObserver(([entry]) => {
    isCanvasVisible = entry?.isIntersecting === true

    if (!isCanvasVisible && animationId !== 0) {
      window.cancelAnimationFrame(animationId)
      animationId = 0
      return
    }

    requestAnalyzerFrame()
  })
  intersectionObserver.observe(canvas)

  // AI modified: window resize avoids WebKit's canvas ResizeObserver feedback loop.
  window.addEventListener('resize', handleCanvasResize, { passive: true })

  themeObserver = new MutationObserver(() => {
    analyzerPaletteCache = undefined
    requestAnalyzerFrame()
  })
  themeObserver.observe(document.documentElement, { attributeFilter: ['class'], attributes: true })

  motionPreference.addEventListener('change', handleMotionPreferenceChange)
  document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
  refreshCanvasPresentation()
})

onUnmounted(() => {
  if (animationId !== 0) {
    window.cancelAnimationFrame(animationId)
  }

  intersectionObserver?.disconnect()
  themeObserver?.disconnect()
  motionPreference?.removeEventListener('change', handleMotionPreferenceChange)
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
  window.removeEventListener('resize', handleCanvasResize)
})

function handleCanvasResize(): void {
  refreshCanvasPresentation()
  requestAnalyzerFrame()
}

function handleMotionPreferenceChange(event: MediaQueryListEvent): void {
  shouldReduceMotion = event.matches

  if (shouldReduceMotion && animationId !== 0) {
    window.cancelAnimationFrame(animationId)
    animationId = 0
  }

  requestAnalyzerFrame()
}

function handleDocumentVisibilityChange(): void {
  isDocumentVisible = document.visibilityState === 'visible'

  if (!isDocumentVisible && animationId !== 0) {
    window.cancelAnimationFrame(animationId)
    animationId = 0
    return
  }

  requestAnalyzerFrame()
}

watch([props.demo.isPaused, props.demo.playerState], () => {
  requestAnalyzerFrame()
}, { flush: 'post' })
</script>

<template>
  <section class="gaudio-studio__surface overflow-hidden rounded-lg" :aria-label="text.visualizer.ariaLabel">
    <div class="flex gap-4 border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase" style="border-color: var(--gaudio-studio-border)">
      <strong style="color: var(--gaudio-studio-accent)">{{ text.visualizer.waveform }}</strong>
      <span style="color: var(--gaudio-studio-text-muted)">{{ text.visualizer.bars }}</span>
      <span style="color: var(--gaudio-studio-text-muted)">{{ text.visualizer.radial }}</span>
    </div>

    <canvas
      ref="analyzerCanvas"
      class="gaudio-studio__canvas h-[9.5rem] w-full md:h-[11rem]"
      width="920"
      height="320"
      role="img"
      :aria-label="text.visualizer.description"
    >
      {{ text.visualizer.description }}
    </canvas>

    <dl class="grid grid-cols-3 border-t" style="border-color: var(--gaudio-studio-border)">
      <div
        v-for="(summary, index) in analyzerSummary"
        :key="summary.label"
        class="flex flex-col gap-1 p-2.5"
        :class="index > 0 ? 'border-l' : ''"
        :style="index > 0 ? { borderColor: 'var(--gaudio-studio-border)' } : undefined"
      >
        <dt class="text-[11px] font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
          {{ summary.label }}
        </dt>
        <dd class="font-mono text-xs" style="color: var(--gaudio-studio-text)">
          {{ summary.value }}
        </dd>
      </div>
    </dl>
  </section>
</template>
