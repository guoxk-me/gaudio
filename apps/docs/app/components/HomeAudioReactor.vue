<script setup lang="ts">
import type { SonicCoreRenderer } from './home-sonic-core'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { createSonicCore } from './home-sonic-core'

const props = withDefaults(defineProps<{
  isPlaying: boolean
  readSpectrum: () => Uint8Array
  sourceKind?: 'native' | 'hls' | 'dash'
}>(), {
  sourceKind: 'native',
})

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const isRendered = shallowRef(false)
const quietSpectrum = new Uint8Array(0)
let requestRender: (() => void) | undefined
let dispose: (() => void) | undefined

watch(() => [props.isPlaying, props.sourceKind], () => requestRender?.())

function spectrumEnergy(spectrum: Uint8Array, startIndex: number, endIndex: number): number {
  const bandEnd = Math.min(spectrum.length, endIndex)
  let total = 0
  for (let index = startIndex; index < bandEnd; index += 1)
    total += spectrum[index] ?? 0
  return bandEnd > startIndex ? total / ((bandEnd - startIndex) * 255) : 0
}

onMounted(() => {
  const templateCanvas = canvas.value
  if (!templateCanvas)
    return
  const canvasElement: HTMLCanvasElement = templateCanvas

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const compactViewport = window.matchMedia('(max-width: 640px)')
  let renderer: SonicCoreRenderer | undefined
  let animationFrame = 0
  let isVisible = false
  let previousTime = 0
  let sceneTime = 0
  let bass = 0
  let middle = 0
  let treble = 0
  let bassAverage = 0
  let peakTime = -2000
  let orbitAngle = props.sourceKind === 'hls' ? 0.35 : props.sourceKind === 'dash' ? -0.35 : 0
  let pointerX = 0
  let pointerY = 0
  let pointerTargetX = 0
  let pointerTargetY = 0

  function stopRendering(): void {
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
    previousTime = 0
  }

  function render(now: number, isStateChange = false): void {
    animationFrame = 0
    if (!renderer || !isVisible || document.hidden)
      return

    const frameInterval = props.isPlaying ? (compactViewport.matches ? 1000 / 30 : 1000 / 50) : 1000 / 15
    if (!isStateChange && previousTime && now - previousTime < frameInterval) {
      animationFrame = requestAnimationFrame(render)
      return
    }

    const elapsed = Math.min(previousTime ? now - previousTime : frameInterval, 100)
    previousTime = now
    const easing = 1 - Math.exp(-elapsed / 120)
    const spectrum = props.isPlaying && !reducedMotion.matches ? props.readSpectrum() : quietSpectrum
    const bassTarget = spectrumEnergy(spectrum, 1, 9)
    bass += (bassTarget - bass) * easing
    middle += (spectrumEnergy(spectrum, 9, 90) - middle) * easing
    treble += (spectrumEnergy(spectrum, 90, 320) - treble) * easing
    bassAverage += (bassTarget - bassAverage) * (1 - Math.exp(-elapsed / 800))
    if (bassTarget > Math.max(0.28, bassAverage * 1.2) && now - peakTime > 550)
      peakTime = now

    const targetAngle = props.sourceKind === 'hls' ? 0.35 : props.sourceKind === 'dash' ? -0.35 : 0
    orbitAngle += (targetAngle - orbitAngle) * (reducedMotion.matches ? 1 : easing)
    pointerX += (pointerTargetX - pointerX) * easing
    pointerY += (pointerTargetY - pointerY) * easing
    if (!reducedMotion.matches)
      sceneTime += elapsed / 1000 * (props.isPlaying ? 1 : 0.25)

    renderer.draw({
      time: reducedMotion.matches ? 0 : sceneTime,
      bass: reducedMotion.matches ? 0 : bass,
      middle: reducedMotion.matches ? 0 : middle,
      treble: reducedMotion.matches ? 0 : treble,
      pulseAge: reducedMotion.matches ? 1 : Math.min(1, (now - peakTime) / 850),
      orbitAngle,
      pointerX: reducedMotion.matches ? 0 : pointerX,
      pointerY: reducedMotion.matches ? 0 : pointerY,
      isDark: document.documentElement.classList.contains('dark'),
      isCompact: compactViewport.matches,
    })
    isRendered.value = true

    // AI modified: reduced motion draws explicit state changes only, and hidden scenes do no GPU work.
    if (!reducedMotion.matches)
      animationFrame = requestAnimationFrame(render)
  }

  function refreshScene(): void {
    stopRendering()
    render(performance.now(), true)
  }

  function resizeCanvas(): void {
    const pixelRatio = Math.min(window.devicePixelRatio, compactViewport.matches ? 1 : 1.25)
    const width = Math.max(1, Math.round(canvasElement.clientWidth * pixelRatio))
    const height = Math.max(1, Math.round(canvasElement.clientHeight * pixelRatio))
    if (canvasElement.width !== width || canvasElement.height !== height) {
      canvasElement.width = width
      canvasElement.height = height
    }
    refreshScene()
  }

  function startRenderer(): void {
    renderer?.destroy()
    renderer = undefined
    isRendered.value = false
    try {
      renderer = createSonicCore(canvasElement)
    }
    catch {
      // AI modified: unsupported drivers and shader failures retain the static brand silhouette.
      isRendered.value = false
    }
    resizeCanvas()
  }

  function loseContext(event: Event): void {
    event.preventDefault()
    stopRendering()
    renderer?.destroy()
    renderer = undefined
    isRendered.value = false
  }

  function movePointer(event: PointerEvent): void {
    if (reducedMotion.matches || event.pointerType === 'touch')
      return
    const bounds = canvasElement.getBoundingClientRect()
    pointerTargetX = (event.clientX - bounds.left) / bounds.width * 2 - 1
    pointerTargetY = 1 - (event.clientY - bounds.top) / bounds.height * 2
  }

  function resetPointer(): void {
    pointerTargetX = 0
    pointerTargetY = 0
  }

  const resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(canvasElement)
  const themeObserver = new MutationObserver(refreshScene)
  themeObserver.observe(document.documentElement, { attributeFilter: ['class'] })
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    isVisible = entry?.isIntersecting ?? false
    refreshScene()
  }, { threshold: 0.01 })
  visibilityObserver.observe(canvasElement)
  document.addEventListener('visibilitychange', refreshScene)
  reducedMotion.addEventListener('change', refreshScene)
  compactViewport.addEventListener('change', resizeCanvas)
  canvasElement.addEventListener('pointermove', movePointer)
  canvasElement.addEventListener('pointerleave', resetPointer)
  canvasElement.addEventListener('webglcontextlost', loseContext)
  canvasElement.addEventListener('webglcontextrestored', startRenderer)
  requestRender = refreshScene
  startRenderer()

  dispose = () => {
    stopRendering()
    renderer?.destroy()
    resizeObserver.disconnect()
    themeObserver.disconnect()
    visibilityObserver.disconnect()
    document.removeEventListener('visibilitychange', refreshScene)
    reducedMotion.removeEventListener('change', refreshScene)
    compactViewport.removeEventListener('change', resizeCanvas)
    canvasElement.removeEventListener('pointermove', movePointer)
    canvasElement.removeEventListener('pointerleave', resetPointer)
    canvasElement.removeEventListener('webglcontextlost', loseContext)
    canvasElement.removeEventListener('webglcontextrestored', startRenderer)
  }
})

onUnmounted(() => {
  requestRender = undefined
  dispose?.()
})
</script>

<template>
  <div class="home-reactor" aria-hidden="true" :data-renderer="isRendered ? 'webgl' : 'static'">
    <div class="sonic-core__fallback" :class="{ 'sonic-core__fallback--hidden': isRendered }">
      <span class="sonic-core__sphere" />
      <span class="sonic-core__orbit" />
      <span class="sonic-core__aura" />
    </div>
    <canvas ref="canvas" class="sonic-core__canvas" :class="{ 'sonic-core__canvas--ready': isRendered }" />
  </div>
</template>

<style scoped>
.home-reactor {
  position: relative;
  width: 100%;
  height: 248px;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
  background: #f6f4fd;
}

.sonic-core__canvas,
.sonic-core__fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.sonic-core__canvas {
  display: block;
  opacity: 0;
  transition: opacity 250ms ease;
}

.sonic-core__canvas--ready { opacity: 1; }
.sonic-core__fallback--hidden { visibility: hidden; }

.sonic-core__fallback {
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at center, #e5dcfa 0, #f6f4fd 67%);
}

.sonic-core__sphere {
  width: 126px;
  height: 130px;
  z-index: 1;
  border: 1px solid #c6b3f9;
  border-radius: 47% 53% 48% 52% / 53% 48% 52% 47%;
  background: radial-gradient(circle at 30% 25%, #f0e8ff 0, #aa8ada 22%, #8968c7 49%, #7953bb 70%, #c6a6f9 100%);
  box-shadow: inset -8px -6px 20px #e9d8ff80, inset 5px 2px 13px #fff6, 0 0 40px #a680e525;
}

.sonic-core__orbit {
  position: absolute;
  width: 215px;
  height: 85px;
  z-index: 2;
  border: 1.5px solid #b6a0e3;
  border-top-color: #d5c4f3;
  border-radius: 50%;
  transform: rotate(-22deg);
  box-shadow: 0 0 7px #b391eb40;
}

.sonic-core__aura {
  position: absolute;
  width: 245px;
  height: 170px;
  border: 1px solid #a284cf18;
  border-radius: 50%;
  transform: rotate(-22deg);
}

:global(.dark) .home-reactor { background: #0d0b14; }
:global(.dark) .sonic-core__fallback { background: radial-gradient(ellipse at center, #261639 0, #0d0b14 67%); }
:global(.dark) .sonic-core__sphere {
  border-color: #8861c7;
  background: radial-gradient(circle at 30% 25%, #e5d5ff 0, #a886df 19%, #603492 49%, #412168 70%, #ab83ee 100%);
  box-shadow: inset -8px -6px 20px #b48beb60, inset 5px 2px 13px #fff3, 0 0 40px #a680e51a;
}
:global(.dark) .sonic-core__orbit { border-color: #8d6dc0; border-top-color: #c3a8eb; }

@media (max-width: 640px) {
  .home-reactor { height: 220px; }
}

@media (prefers-reduced-motion: reduce) {
  .sonic-core__canvas { transition: none; }
}
</style>
