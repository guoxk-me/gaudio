import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'

const packageRoot = resolve(import.meta.dirname, '..')
const distRoot = resolve(packageRoot, 'dist')
const sampleRate = 16_000
const sampleCount = sampleRate * 4
// AI modified: deterministic decoded audio exposes CORS silence without remote fixtures or microphone access.
const audioFixture = Buffer.alloc(44 + sampleCount * 2)
audioFixture.write('RIFF', 0)
audioFixture.writeUInt32LE(audioFixture.length - 8, 4)
audioFixture.write('WAVEfmt ', 8)
audioFixture.writeUInt32LE(16, 16)
audioFixture.writeUInt16LE(1, 20)
audioFixture.writeUInt16LE(1, 22)
audioFixture.writeUInt32LE(sampleRate, 24)
audioFixture.writeUInt32LE(sampleRate * 2, 28)
audioFixture.writeUInt16LE(2, 32)
audioFixture.writeUInt16LE(16, 34)
audioFixture.write('data', 36)
audioFixture.writeUInt32LE(sampleCount * 2, 40)
for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
  audioFixture.writeInt16LE(Math.round(Math.sin(sampleIndex * 2 * Math.PI * 440 / sampleRate) * 12_000), 44 + sampleIndex * 2)
}

interface PlaybackEvidence {
  error?: string
  peak: number
  currentTime: number
  state: string
}

const mediaRequests: Array<{ mode?: string, origin?: string, cookie?: string, scenario: string | null }> = []
let browserServer: Server
let mediaServer: Server
let browserOrigin: string
let mediaOrigin: string

test.beforeAll(async () => {
  mediaServer = createServer((request, response) => {
    const scenario = new URL(request.url ?? '/', 'http://fixture.invalid').searchParams.get('mode')
    mediaRequests.push({ mode: request.headers['sec-fetch-mode'], origin: request.headers.origin, cookie: request.headers.cookie, scenario })
    if (scenario === 'credentials' && !request.headers.cookie?.includes('gaudio-fixture=allowed')) {
      response.writeHead(401)
      response.end()
      return
    }
    response.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': audioFixture.length,
      ...(scenario !== 'plain'
        ? { 'Access-Control-Allow-Origin': browserOrigin, 'Access-Control-Allow-Credentials': 'true' }
        : {}),
    })
    response.end(audioFixture)
  })
  await new Promise<void>(resolveListening => mediaServer.listen(0, '127.0.0.1', resolveListening))
  mediaOrigin = `http://127.0.0.1:${(mediaServer.address() as AddressInfo).port}`

  browserServer = createServer(async (request, response) => {
    try {
      const requestedUrl = new URL(request.url ?? '/', 'http://fixture.invalid')
      if (requestedUrl.pathname.startsWith('/dist/')) {
        const requestedPath = resolve(packageRoot, requestedUrl.pathname.slice(1))
        if (!requestedPath.startsWith(`${distRoot}${sep}`)) {
          response.writeHead(403)
          response.end()
          return
        }
        const sourceCode = await readFile(requestedPath)
        response.writeHead(200, { 'Content-Type': 'text/javascript' })
        response.end(sourceCode)
        return
      }
      if (requestedUrl.pathname === '/redirect.wav') {
        response.writeHead(302, { Location: `${mediaOrigin}/audio.wav?mode=redirect` })
        response.end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(`<!doctype html><title>Media request policy</title>
        <button id="play">Play audio</button><pre id="evidence">Pending</pre>
        <script type="module">
          import { AudioPlayer } from '/dist/index.js'
          document.querySelector('#play').onclick = async () => {
            const mode = new URL(location.href).searchParams.get('mode')
            const player = new AudioPlayer({
              source: mode === 'redirect' ? '/redirect.wav' : '${mediaOrigin}/audio.wav?mode=' + mode,
              analyzer: mode !== 'plain',
              ...(mode === 'credentials' ? { crossOrigin: 'use-credentials' } : {}),
            })
            let evidence
            try {
              await player.load()
              await player.play()
              let peak = 0
              for (let frame = 0; frame < 120; frame++) {
                await new Promise(requestAnimationFrame)
                const samples = player.getAnalyzer()?.getWaveformData()
                if (samples) peak = Math.max(...samples.map(sample => Math.abs(sample - 128)))
                if (peak > 10 || (mode === 'plain' && player.getCurrentTime() > 0.05)) break
              }
              evidence = { peak, currentTime: player.getCurrentTime(), state: player.getState() }
            } catch (error) {
              evidence = { error: String(error), peak: 0, currentTime: player.getCurrentTime(), state: player.getState() }
            } finally {
              await player.dispose()
            }
            window.playbackEvidence = evidence
            document.querySelector('#evidence').textContent = JSON.stringify(evidence)
          }
        </script>`)
    }
    catch {
      response.writeHead(500)
      response.end()
    }
  })
  await new Promise<void>(resolveListening => browserServer.listen(0, '127.0.0.1', resolveListening))
  browserOrigin = `http://127.0.0.1:${(browserServer.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await Promise.all([browserServer, mediaServer].filter(Boolean).map(server => new Promise<void>((resolveClosed, rejectClosed) => {
    server.close(error => error ? rejectClosed(error) : resolveClosed())
  })))
})

for (const mode of ['anonymous', 'credentials', 'redirect'] as const) {
  test(`decoded cross-origin analysis stays audible with ${mode} requests`, async ({ page, context }) => {
    if (mode === 'credentials') {
      await context.addCookies([{ name: 'gaudio-fixture', value: 'allowed', url: mediaOrigin }])
    }
    await page.goto(`${browserOrigin}/?mode=${mode}`)
    await page.getByRole('button', { name: 'Play audio' }).click()
    await page.waitForFunction(() => Reflect.get(window, 'playbackEvidence') !== undefined)
    const evidence = await page.evaluate(() => Reflect.get(window, 'playbackEvidence') as PlaybackEvidence)

    expect(evidence.error).toBeUndefined()
    expect(evidence.peak).toBeGreaterThan(10)
    expect(evidence.state).toBe('playing')
    const scenarioRequests = mediaRequests.filter(request => request.scenario === mode)
    expect(scenarioRequests.length).toBeGreaterThan(0)
    // AI modified: WebKit range probes omit Fetch Metadata headers, but CORS requests still carry Origin.
    for (const mediaRequest of scenarioRequests) {
      expect(mediaRequest.origin).toBe(browserOrigin)
      if (mediaRequest.mode !== undefined) {
        expect(mediaRequest.mode).toBe('cors')
      }
    }
    if (mode === 'credentials') {
      expect(scenarioRequests.every(request => request.cookie?.includes('gaudio-fixture=allowed'))).toBe(true)
    }
  })
}

test('plain playback still accepts cross-origin media without CORS response headers', async ({ page }) => {
  await page.goto(`${browserOrigin}/?mode=plain`)
  await page.getByRole('button', { name: 'Play audio' }).click()
  await page.waitForFunction(() => Reflect.get(window, 'playbackEvidence') !== undefined)
  const evidence = await page.evaluate(() => Reflect.get(window, 'playbackEvidence') as PlaybackEvidence)

  expect(evidence.error).toBeUndefined()
  expect(evidence.currentTime).toBeGreaterThan(0)
  expect(evidence.state).toBe('playing')
  expect(mediaRequests.find(request => request.scenario === 'plain')?.mode).toBe('no-cors')
})
