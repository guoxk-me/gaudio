import { AudioPlayer } from 'gaudio'

// AI modified: keep the 32-band baseline driven by real audio.
const canvas = document.querySelector('canvas')
const errorLabel = document.querySelector('#error')
const playButton = document.querySelector('#play')
const playbackLabel = document.querySelector('#playback-state')
const motionButton = document.querySelector('#motion')
const volumeControl = document.querySelector('#volume')
const sampleSelect = document.querySelector('#track-select')
const titles = { 'aurora-loop': 'Aurora Loop', 'city-lantern': 'City Lantern', 'signal-bloom': 'Signal Bloom', 'warm-current': 'Warm Current' }
const player = new AudioPlayer({
  source: '../apps/docs/public/audio/mp3/aurora-loop.mp3',
  analyzer: { fftSize: 2048 },
  volume: 0.6,
  loop: true,
})
let hasReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
let isDisposed = false
let frameRequest = 0
let isVisible = true
let isPlaying = false
let isChangingSource = false

function showPlayback() {
  const state = player.getState()
  isPlaying = !player.isPaused()
  playbackLabel.textContent = state
  playButton.textContent = isPlaying ? '暂停' : '播放'
}

player.on('statechange', showPlayback)
player.on('error', (failure) => {
  errorLabel.textContent = failure.message
})
playButton.addEventListener('click', async () => {
  if (isChangingSource)
    return
  errorLabel.textContent = ''
  try {
    if (player.isPaused())
      await player.play()
    else
      player.pause()
    showPlayback()
  }
  catch (failure) { errorLabel.textContent = failure.message }
})
volumeControl.addEventListener('input', () => player.setVolume(Number(volumeControl.value)))
sampleSelect.addEventListener('change', async () => {
  isChangingSource = true
  playButton.disabled = true
  try {
    const shouldResume = !player.isPaused()
    player.setSource(`../apps/docs/public/audio/mp3/${sampleSelect.value}.mp3`)
    document.querySelector('#track-title').textContent = titles[sampleSelect.value]
    document.querySelector('.cover').src = `../apps/docs/public/cover/${sampleSelect.value}.png`
    document.querySelector('.cover').alt = `${titles[sampleSelect.value]} 封面`
    if (shouldResume)
      await player.play()
    showPlayback()
  }
  catch (failure) { errorLabel.textContent = failure.message }
  finally {
    isChangingSource = false
    playButton.disabled = false
  }
})

function showMotion() {
  motionButton.setAttribute('aria-pressed', String(hasReducedMotion))
  motionButton.textContent = hasReducedMotion ? '恢复动态' : '减少动态'
}
motionButton.addEventListener('click', () => {
  hasReducedMotion = !hasReducedMotion
  showMotion()
})
showMotion()
// AI modified: old study links now resolve to the single agreed basic treatment.
const prototypeUrl = new URL(location.href)
prototypeUrl.searchParams.delete('variant')
history.replaceState(null, '', prototypeUrl)

function startSpectrum() {
  try {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context)
      throw new Error('当前浏览器无法显示频谱。')
    const bands = new Float32Array(32)
    const visibleBands = new Float32Array(32)
    let lastFrame = performance.now()
    let lastReadout = lastFrame
    let frameDuration = 16
    let maximum = 0
    function drawBars() {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ratio = canvas.width / width
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.shadowBlur = 0
      context.fillStyle = '#141019'
      context.fillRect(0, 0, width, height)
      const inset = width < 600 ? 22 : 44
      const gap = width < 600 ? 4 : 7
      const barWidth = (width - inset * 2 - gap * 31) / 32
      const baseline = height - 34
      const availableHeight = height - 106
      for (let band = 0; band < 32; band++) {
        const strength = Math.min(1, Math.max(0, visibleBands[band] / 255))
        const barHeight = Math.max(3, strength * availableHeight)
        // AI modified: brightness and a small halo share the smoothed amplitude, fading together on pause.
        context.fillStyle = `hsl(266 76% ${42 + 43 * strength}%)`
        context.shadowColor = `rgba(157, 99, 255, ${0.42 * strength ** 1.5})`
        context.shadowBlur = 12 * strength * ratio
        context.beginPath()
        context.roundRect(inset + band * (barWidth + gap), baseline - barHeight, barWidth, barHeight, 2)
        context.fill()
      }
      context.shadowBlur = 0
    }
    const resize = new ResizeObserver(() => {
      const ratio = Math.min(devicePixelRatio, 2)
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      drawBars()
    })
    resize.observe(canvas)
    function scheduleRendering() {
      cancelAnimationFrame(frameRequest)
      if (!document.hidden && isVisible && !isDisposed) {
        lastFrame = performance.now()
        frameRequest = requestAnimationFrame(render)
      }
    }
    const visibility = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting
      scheduleRendering()
    })
    visibility.observe(canvas)
    document.addEventListener('visibilitychange', scheduleRendering)
    function render(now) {
      frameRequest = requestAnimationFrame(render)
      const elapsed = Math.min(now - lastFrame, 100)
      if (elapsed < 15)
        return
      lastFrame = now
      if (document.hidden || !isVisible)
        return
      frameDuration += (elapsed - frameDuration) * 0.06
      const frequencies = isPlaying ? player.getAnalyzer()?.getFrequencyData({ binCount: 1024 }) : undefined
      maximum = 0
      for (let band = 0; band < 32; band++) {
        // AI modified: logarithmic frequency windows keep bass detail visible without simulated beats.
        const low = Math.max(1, Math.floor(1.8 * 400 ** (band / 32)))
        const high = Math.min(1023, Math.max(low + 1, Math.floor(1.8 * 400 ** ((band + 1) / 32))))
        let sum = 0
        for (let bin = low; bin < high; bin++) sum += frequencies?.[bin] ?? 0
        const target = sum / (high - low)
        const response = 1 - Math.exp(-elapsed / (target > bands[band] ? 35 : 180))
        bands[band] += (target - bands[band]) * response
        maximum = Math.max(maximum, bands[band])
      }
      if (!hasReducedMotion || !isPlaying) {
        visibleBands.set(bands)
      }
      drawBars()
      if (now - lastReadout > 180) {
        document.querySelector('#fft-readout').textContent = String(Math.round(maximum))
        document.querySelector('#bass-readout').textContent = String(Math.round(bands.slice(0, 10).reduce((sum, frequency) => sum + frequency, 0) / 10))
        document.querySelector('#frame-readout').textContent = `${Math.round(frameDuration)} ms`
        document.querySelector('#time').textContent = `0:0${Math.floor(player.getCurrentTime())} / 0:08`
        lastReadout = now
      }
    }
    frameRequest = requestAnimationFrame(render)
    window.addEventListener('pagehide', () => {
      isDisposed = true
      cancelAnimationFrame(frameRequest)
      resize.disconnect()
      visibility.disconnect()
      document.removeEventListener('visibilitychange', scheduleRendering)
      void player.dispose()
    }, { once: true })
  }
  catch (failure) {
    if (!isDisposed)
      errorLabel.textContent = failure.message
  }
}
startSpectrum()
