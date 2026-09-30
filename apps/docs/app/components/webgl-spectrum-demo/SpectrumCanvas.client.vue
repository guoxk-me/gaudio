<script setup lang="ts">
import type { SpectrumSceneMode, WebglSpectrumRenderer } from './webgl-spectrum-renderer'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  isPlaying: boolean
  mode: SpectrumSceneMode
  progress: number
  readSpectrum: () => Uint8Array | undefined
}>()

const emit = defineEmits<{
  ready: []
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const renderError = shallowRef<string | undefined>()
let spectrumRenderer: WebglSpectrumRenderer | undefined
let resizeObserver: ResizeObserver | undefined
let motionPreference: MediaQueryList | undefined

function resizeCanvas(): void {
  const canvasElement = canvas.value

  if (!canvasElement || !spectrumRenderer) {
    return
  }

  const bounds = canvasElement.getBoundingClientRect()
  spectrumRenderer.resize(bounds.width, bounds.height, window.devicePixelRatio || 1)
}

function updateMotionPreference(): void {
  spectrumRenderer?.setReducedMotion(motionPreference?.matches ?? false)
}

function onPointerMove(event: PointerEvent): void {
  const bounds = event.currentTarget instanceof HTMLCanvasElement
    ? event.currentTarget.getBoundingClientRect()
    : undefined

  if (!bounds) {
    return
  }

  const pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  const pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1
  spectrumRenderer?.setPointer(pointerX, pointerY)
}

function resetPointer(): void {
  spectrumRenderer?.setPointer(0, 0)
}

watch(() => props.mode, mode => spectrumRenderer?.setMode(mode))
watch(() => props.isPlaying, isPlaying => spectrumRenderer?.setPlayback(isPlaying), { immediate: true })
watch(() => props.progress, progress => spectrumRenderer?.setProgress(progress), { immediate: true })

onMounted(async () => {
  const canvasElement = canvas.value

  if (!canvasElement) {
    return
  }

  try {
    // AI modified: the heavy WebGL runtime is client-only and begins after the comparison stage mounts.
    const { WebglSpectrumRenderer: Renderer } = await import('./webgl-spectrum-renderer')
    spectrumRenderer = new Renderer(canvasElement, props.mode)
    spectrumRenderer.setPlayback(props.isPlaying)
    spectrumRenderer.setProgress(props.progress)
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvasElement)
    motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionPreference.addEventListener('change', updateMotionPreference)
    updateMotionPreference()
    resizeCanvas()
    spectrumRenderer.start(props.readSpectrum)
    emit('ready')
  }
  catch (error) {
    renderError.value = error instanceof Error ? error.message : 'WebGL is not available in this browser.'
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  motionPreference?.removeEventListener('change', updateMotionPreference)
  spectrumRenderer?.dispose()
  spectrumRenderer = undefined
})
</script>

<template>
  <div class="spectrum-canvas-shell">
    <canvas
      ref="canvas"
      class="spectrum-canvas"
      aria-hidden="true"
      @pointermove="onPointerMove"
      @pointerleave="resetPointer"
    />
    <div v-if="renderError" class="spectrum-canvas-fallback" role="status">
      <strong>WebGL preview unavailable</strong>
      <span>{{ renderError }}</span>
    </div>
  </div>
</template>

<style scoped>
.spectrum-canvas-shell,
.spectrum-canvas {
  width: 100%;
  height: 100%;
}

.spectrum-canvas-shell {
  position: relative;
  overflow: hidden;
}

.spectrum-canvas {
  display: block;
  touch-action: pan-y;
}

.spectrum-canvas-fallback {
  display: grid;
  position: absolute;
  inset: 0;
  place-content: center;
  gap: 6px;
  padding: 24px;
  color: #4c1d95;
  background: #f5f3ff;
  text-align: center;
}

.spectrum-canvas-fallback span {
  color: #6f6b75;
  font-size: 14px;
}
</style>
