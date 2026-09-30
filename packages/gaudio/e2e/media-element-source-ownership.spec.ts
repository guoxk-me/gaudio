import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'

const packageRoot = resolve(import.meta.dirname, '..')
const distRoot = resolve(packageRoot, 'dist')
const audioFixture = Buffer.from(
  'UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA',
  'base64',
)

interface SourceOwnershipResult {
  currentSrc: string
  errorMessage?: string
  errorName?: string
  markupAfter: string
  markupBefore: string
}

let browserServer: Server
let browserOrigin: string

test.beforeAll(async () => {
  // AI modified: a focused local server loads the real package build in Chromium without coupling to the docs app.
  browserServer = createServer(async (request, response) => {
    try {
      if (request.url === '/audio.wav') {
        response.writeHead(200, {
          'Content-Length': audioFixture.length,
          'Content-Type': 'audio/wav',
        })
        response.end(audioFixture)
        return
      }

      if (request.url?.startsWith('/dist/')) {
        const requestedPath = resolve(packageRoot, request.url.slice(1))
        if (requestedPath !== distRoot && !requestedPath.startsWith(`${distRoot}${sep}`)) {
          response.writeHead(403)
          response.end()
          return
        }
        const packageFile = await readFile(requestedPath)
        response.writeHead(200, {
          'Content-Length': packageFile.length,
          'Content-Type': extname(requestedPath) === '.js' ? 'text/javascript' : 'application/octet-stream',
        })
        response.end(packageFile)
        return
      }

      if (request.url === '/') {
        const browserDocument = Buffer.from(`<!doctype html>
          <audio id="audio"><source src="/audio.wav" type="audio/wav"></audio>
          <script type="module">
            import { MediaElementAudioEngine } from '/dist/index.js'

            const audioElement = document.querySelector('#audio')
            const markupBefore = audioElement.innerHTML
            audioElement.load()
            await new Promise((resolve, reject) => {
              if (audioElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
                resolve()
                return
              }
              audioElement.addEventListener('loadedmetadata', resolve, { once: true })
              audioElement.addEventListener('error', () => reject(new Error('fixture failed to load')), { once: true })
            })

            let ownershipError
            try {
              new MediaElementAudioEngine(audioElement)
            }
            catch (error) {
              ownershipError = error
            }

            window.sourceOwnershipResult = {
              currentSrc: audioElement.currentSrc,
              errorMessage: ownershipError?.message,
              errorName: ownershipError?.name,
              markupAfter: audioElement.innerHTML,
              markupBefore,
            }
          </script>`)
        response.writeHead(200, {
          'Content-Length': browserDocument.length,
          'Content-Type': 'text/html',
        })
        response.end(browserDocument)
        return
      }

      response.writeHead(404)
      response.end()
    }
    catch {
      response.writeHead(500)
      response.end()
    }
  })

  await new Promise<void>(resolveListening => browserServer.listen(0, '127.0.0.1', resolveListening))
  const address = browserServer.address() as AddressInfo
  browserOrigin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, rejectClosed) => {
    browserServer.close(error => error ? rejectClosed(error) : resolveClosed())
  })
})

test('rejects browser-owned child sources without changing caller markup', async ({ page }) => {
  await page.goto(browserOrigin)
  await page.waitForFunction(() => Reflect.get(window, 'sourceOwnershipResult') !== undefined)

  const ownershipResult = await page.evaluate(
    () => Reflect.get(window, 'sourceOwnershipResult') as SourceOwnershipResult,
  )

  expect(ownershipResult).toEqual({
    currentSrc: `${browserOrigin}/audio.wav`,
    errorMessage: 'MediaElementAudioEngine requires an audio element without child <source> elements; pass sources through AudioPlayer or load() instead',
    errorName: 'TypeError',
    markupAfter: '<source src="/audio.wav" type="audio/wav">',
    markupBefore: '<source src="/audio.wav" type="audio/wav">',
  })
})
