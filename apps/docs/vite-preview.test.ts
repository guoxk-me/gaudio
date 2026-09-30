import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  documentationCleanPageMiddleware,
  documentationNotFoundMiddleware,
  documentationNotFoundPreview,
} from './vite.preview.config.ts'

const outputDirectories: string[] = []

interface PreviewRequestOptions {
  accept?: string
  fetchDestination?: string
  method?: string
  url: string
}

interface PreviewRequestSnapshot {
  body?: string
  headers: Map<string, number | string>
  isContinued: boolean
  statusCode: number
}

async function previewOutput(): Promise<{ notFoundHtml: string, outputDirectory: string }> {
  const outputDirectory = await mkdtemp(resolve(tmpdir(), 'gaudio-vite-preview-'))
  const notFoundHtml = '<!doctype html><html><body><div id="app"></div></body></html>'
  outputDirectories.push(outputDirectory)

  await mkdir(resolve(outputDirectory, 'guide/getting-started'), { recursive: true })
  await Promise.all([
    writeFile(resolve(outputDirectory, 'index.html'), '<!doctype html><html><body>home</body></html>'),
    writeFile(resolve(outputDirectory, '404.html'), notFoundHtml),
    writeFile(resolve(outputDirectory, 'guide/getting-started.html'), '<!doctype html><html><body>guide</body></html>'),
    writeFile(resolve(outputDirectory, 'guide/getting-started/index.html'), '<!doctype html><html><body>clean guide</body></html>'),
    writeFile(resolve(outputDirectory, '中文.html'), '<!doctype html><html><body>localized</body></html>'),
    writeFile(resolve(outputDirectory, 'application.js'), 'export {}'),
  ])

  return { notFoundHtml, outputDirectory }
}

function requestPreview(
  middleware: ReturnType<typeof documentationNotFoundMiddleware>,
  options: PreviewRequestOptions,
): PreviewRequestSnapshot {
  let body: string | undefined
  let isContinued = false
  const headers = new Map<string, number | string>()
  const response = {
    statusCode: 200,
    end(responseBody?: string) {
      body = responseBody
    },
    setHeader(name: string, headerValue: number | string) {
      headers.set(name.toLowerCase(), headerValue)
    },
  }

  middleware({
    headers: {
      ...(options.accept === undefined ? {} : { accept: options.accept }),
      ...(options.fetchDestination === undefined ? {} : { 'sec-fetch-dest': options.fetchDestination }),
    },
    method: options.method ?? 'GET',
    url: options.url,
  }, response, () => {
    isContinued = true
  })

  return {
    body,
    headers,
    isContinued,
    statusCode: response.statusCode,
  }
}

afterEach(async () => {
  await Promise.all(outputDirectories.splice(0).map(outputDirectory => (
    rm(outputDirectory, { force: true, recursive: true })
  )))
})

describe('optimized documentation preview routing', () => {
  it('serves a clean directory index before Vite can select its compatibility redirect', async () => {
    const { outputDirectory } = await previewOutput()
    const requestSnapshot = requestPreview(
      documentationCleanPageMiddleware(outputDirectory),
      { accept: 'text/html', url: '/gaudio/guide/getting-started' },
    )

    expect(requestSnapshot.statusCode).toBe(200)
    expect(requestSnapshot.body).toContain('clean guide')
    expect(requestSnapshot.isContinued).toBe(false)
  })

  it.each([undefined, '', '*/*', 'text/html', 'text/html,application/xhtml+xml'])(
    'serves the Nuxt 404 artifact for an unknown GET with Accept %j',
    async (accept) => {
      const { notFoundHtml, outputDirectory } = await previewOutput()
      const requestSnapshot = requestPreview(
        documentationNotFoundMiddleware(outputDirectory, notFoundHtml),
        { accept, url: '/missing-page' },
      )

      expect(requestSnapshot).toEqual({
        body: notFoundHtml,
        headers: new Map<string, number | string>([
          ['cache-control', 'no-cache'],
          ['content-length', Buffer.byteLength(notFoundHtml)],
          ['content-type', 'text/html; charset=utf-8'],
        ]),
        isContinued: false,
        statusCode: 404,
      })
    },
  )

  it('returns GET-equivalent headers without a body for an unknown HEAD request', async () => {
    const { notFoundHtml, outputDirectory } = await previewOutput()
    const requestSnapshot = requestPreview(
      documentationNotFoundMiddleware(outputDirectory, notFoundHtml),
      { accept: '*/*', method: 'HEAD', url: '/missing-page' },
    )

    expect(requestSnapshot.statusCode).toBe(404)
    expect(requestSnapshot.body).toBeUndefined()
    expect(requestSnapshot.headers.get('content-length')).toBe(Buffer.byteLength(notFoundHtml))
    expect(requestSnapshot.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it.each([
    '/index.html',
    '/guide/getting-started.html',
    '/%E4%B8%AD%E6%96%87.html',
    '/404.html',
  ])('leaves the generated page %s to Vite', async (url) => {
    const { notFoundHtml, outputDirectory } = await previewOutput()
    const requestSnapshot = requestPreview(
      documentationNotFoundMiddleware(outputDirectory, notFoundHtml),
      { accept: 'text/html', url },
    )

    expect(requestSnapshot.isContinued).toBe(true)
    expect(requestSnapshot.statusCode).toBe(200)
    expect(requestSnapshot.headers).toEqual(new Map())
  })

  it.each([
    { accept: 'text/html', method: 'POST', url: '/missing-page' },
    { accept: 'application/javascript', method: 'GET', url: '/missing.js' },
    { accept: '*/*', fetchDestination: 'script', method: 'GET', url: '/missing.js' },
    { accept: '*/*', method: 'GET', url: '/favicon.ico' },
  ])('leaves the non-document request $method $url to Vite', async (requestOptions) => {
    const { notFoundHtml, outputDirectory } = await previewOutput()
    const requestSnapshot = requestPreview(
      documentationNotFoundMiddleware(outputDirectory, notFoundHtml),
      requestOptions,
    )

    expect(requestSnapshot.isContinued).toBe(true)
    expect(requestSnapshot.statusCode).toBe(200)
  })

  it.each([
    '/bad%E0%A4%A',
    '/bad%00.html',
    '/..%2Foutside.html',
  ])('safely serves 404 for malformed or escaping path %s', async (url) => {
    const { notFoundHtml, outputDirectory } = await previewOutput()
    const requestSnapshot = requestPreview(
      documentationNotFoundMiddleware(outputDirectory, notFoundHtml),
      { accept: 'text/html', url },
    )

    expect(requestSnapshot.statusCode).toBe(404)
    expect(requestSnapshot.body).toBe(notFoundHtml)
  })

  it('registers after Vite internals so the configured base keeps ownership of outside-base requests', async () => {
    const { outputDirectory } = await previewOutput()
    const registeredMiddlewares: unknown[] = []
    const previewPlugin = documentationNotFoundPreview(outputDirectory)
    const configurePreviewServer = previewPlugin.configurePreviewServer

    if (typeof configurePreviewServer !== 'function') {
      throw new TypeError('Preview plugin did not expose a configurePreviewServer hook.')
    }

    const postHook: unknown = Reflect.apply(configurePreviewServer, {}, [{
      middlewares: {
        use(middleware: unknown) {
          registeredMiddlewares.push(middleware)
        },
      },
    }])

    expect(registeredMiddlewares).toHaveLength(1)
    expect(typeof postHook).toBe('function')

    if (typeof postHook === 'function') {
      await Reflect.apply(postHook, {}, [])
    }

    expect(registeredMiddlewares).toHaveLength(2)
  })
})
