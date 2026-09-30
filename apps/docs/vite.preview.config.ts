import type { IncomingHttpHeaders } from 'node:http'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { defineConfig } from 'vite'
import { docsBase } from './lib/docs-base.ts'

const docsOutput = resolve(import.meta.dirname, '.output/public')

interface DocumentationPreviewRequest {
  headers: IncomingHttpHeaders
  method?: string
  url?: string
}

interface DocumentationPreviewResponse {
  end: (body?: string) => void
  setHeader: (name: string, value: number | string) => void
  statusCode: number
}

// AI modified: keep preview routing executable in tests without binding a local server.
export function documentationNotFoundMiddleware(outputDirectory: string, notFoundHtml: string) {
  return (
    request: DocumentationPreviewRequest,
    response: DocumentationPreviewResponse,
    next: () => void,
  ): void => {
    const acceptHeader = request.headers.accept
    const fetchDestination = request.headers['sec-fetch-dest']
    const isDocumentDestination = fetchDestination === undefined
      || fetchDestination === ''
      || ['document', 'fencedframe', 'frame', 'iframe'].includes(fetchDestination)
    const canAcceptHtml = acceptHeader?.includes('text/html') === true
      || (isDocumentDestination && (
        acceptHeader === undefined
        || acceptHeader === ''
        || acceptHeader.includes('*/*')
      ))

    if (!['GET', 'HEAD'].includes(request.method ?? '') || !canAcceptHtml || request.url === '/favicon.ico') {
      next()
      return
    }

    let requestPath: string | undefined

    try {
      requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://preview.local').pathname)
    }
    catch {
      requestPath = undefined
    }

    let isGeneratedPage = false

    if (requestPath !== undefined) {
      const requestedOutput = resolve(outputDirectory, `.${requestPath}`)

      try {
        isGeneratedPage = requestedOutput.startsWith(`${outputDirectory}${sep}`)
          && statSync(requestedOutput, { throwIfNoEntry: false })?.isFile() === true
      }
      catch {
        isGeneratedPage = false
      }
    }

    if (isGeneratedPage) {
      next()
      return
    }

    response.statusCode = 404
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Content-Length', Buffer.byteLength(notFoundHtml))
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(request.method === 'HEAD' ? undefined : notFoundHtml)
  }
}

// AI modified: clean Nuxt routes must win over same-name .html compatibility redirects in Vite's MPA preview.
export function documentationCleanPageMiddleware(outputDirectory: string) {
  return (
    request: DocumentationPreviewRequest,
    response: DocumentationPreviewResponse,
    next: () => void,
  ): void => {
    const acceptHeader = request.headers.accept
    const fetchDestination = request.headers['sec-fetch-dest']
    const canAcceptHtml = acceptHeader?.includes('text/html') === true
      || ((fetchDestination === undefined || fetchDestination === '' || fetchDestination === 'document')
        && (acceptHeader === undefined || acceptHeader === '' || acceptHeader.includes('*/*')))

    if (!['GET', 'HEAD'].includes(request.method ?? '') || !canAcceptHtml) {
      next()
      return
    }

    let requestPath: string | undefined

    try {
      requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://preview.local').pathname)
    }
    catch {
      requestPath = undefined
    }

    const docsBaseWithoutSlash = docsBase.slice(0, -1)
    if (requestPath === undefined || (requestPath !== docsBaseWithoutSlash && !requestPath.startsWith(docsBase))) {
      next()
      return
    }

    const routePath = requestPath === docsBaseWithoutSlash
      ? ''
      : requestPath.slice(docsBase.length).replace(/\/$/, '')
    const cleanPageFile = resolve(outputDirectory, routePath, 'index.html')
    const isCleanPage = cleanPageFile.startsWith(`${outputDirectory}${sep}`)
      && statSync(cleanPageFile, { throwIfNoEntry: false })?.isFile() === true

    if (!isCleanPage) {
      next()
      return
    }

    const pageHtml = readFileSync(cleanPageFile, 'utf8')
    response.statusCode = 200
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Content-Length', Buffer.byteLength(pageHtml))
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(request.method === 'HEAD' ? undefined : pageHtml)
  }
}

// AI modified: preview unknown pages from Nuxt's generated 404 document instead of serving an unrelated route.
export function documentationNotFoundPreview(outputDirectory = docsOutput): Plugin {
  return {
    name: 'gaudio-documentation-not-found-preview',
    configurePreviewServer(server) {
      server.middlewares.use(documentationCleanPageMiddleware(outputDirectory))

      return () => {
        const notFoundHtml = readFileSync(resolve(outputDirectory, '404.html'), 'utf8')

        server.middlewares.use(documentationNotFoundMiddleware(outputDirectory, notFoundHtml))
      }
    },
  }
}

export default defineConfig({
  // AI modified: MPA fallback leaves unknown paths available for the generated 404 middleware.
  appType: 'mpa',
  base: docsBase,
  plugins: [documentationNotFoundPreview()],
  build: {
    // AI modified: Vite previews the exact Nuxt static artifact already checked for deployment.
    outDir: docsOutput,
  },
  preview: {
    // AI modified: E2E preview access stays on loopback and uses a strict, isolated port.
    host: '127.0.0.1',
    strictPort: true,
  },
})
