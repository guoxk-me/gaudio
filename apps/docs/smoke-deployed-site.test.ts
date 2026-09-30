import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

const previousRetryDelays = process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS
const smokeModuleUrl = new URL('./scripts/smoke-deployed-site.mjs', import.meta.url).href

interface SmokeSummary {
  checkedEndpointCount: number
  siteRoot: string
}

interface SmokeModule {
  smokeDeployedSite: (pageUrl: string) => Promise<SmokeSummary>
}

interface FixtureOptions {
  isContentRangeMissing?: boolean
  isContentRangeOutsideRequest?: boolean
  isContentRangeStartOffset?: boolean
  isCrossOriginRedirect?: boolean
  isInitialHomeUnavailable?: boolean
  isLicenseRecordIncomplete?: boolean
  isRangeBodyLengthIncorrect?: boolean
  isUnknownRouteSuccessful?: boolean
}

interface RecordedRequest {
  headers: Headers
  url: URL
}

interface StubbedSite {
  homeRequestCount: () => number
  requests: RecordedRequest[]
}

async function runDeployedSmoke(pageUrl: string): Promise<SmokeSummary> {
  const smokeModule = await import(smokeModuleUrl) as SmokeModule
  return smokeModule.smokeDeployedSite(pageUrl)
}

function binaryResponse(mediaType: string, contentRange = 'bytes 0-1023/4096', bodyLength = 1024): Response {
  return new Response(new Uint8Array(bodyLength), {
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Type': mediaType,
      ...(contentRange ? { 'Content-Range': contentRange } : {}),
    },
    status: 206,
  })
}

function stubDeployedSite(options: FixtureOptions = {}): StubbedSite {
  let homeRequestCount = 0
  const requests: RecordedRequest[] = []

  // AI modified: model the deployed HTTP contract in memory so tests never bind a local port.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, requestInit?: RequestInit) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input.toString())
    const requestHeaders = new Headers(input instanceof Request ? input.headers : requestInit?.headers)
    requests.push({ headers: requestHeaders, url: requestUrl })

    if (requestUrl.pathname === '/review/' && options.isCrossOriginRedirect) {
      return Response.redirect('https://example.com/outside-review/', 302)
    }

    if (requestUrl.pathname === '/review/') {
      homeRequestCount += 1

      if (options.isInitialHomeUnavailable && homeRequestCount === 1) {
        return new Response('edge is still publishing', {
          headers: { 'Content-Type': 'text/plain' },
          status: 503,
        })
      }
    }

    if ([
      '/review/',
      '/review/api/',
      '/review/guide/getting-started',
      '/review/zh/',
    ].includes(requestUrl.pathname)) {
      return new Response('<!doctype html><html lang="en"><body>fixture</body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 200,
      })
    }

    if (requestUrl.pathname === '/review/__gaudio-smoke-missing-route__') {
      return new Response('<!doctype html><html lang="en"><body>not found</body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: options.isUnknownRouteSuccessful ? 200 : 404,
      })
    }

    if (requestUrl.pathname === '/review/THIRD_PARTY_LICENSES.txt') {
      return new Response(`GAudio documentation third-party licenses
Package: dashjs@5.2.0
Package: hls.js@1.6.16
${options.isLicenseRecordIncomplete ? '' : 'Package: nuxt@4.5.2\nPackage: @nuxt/content@3.15.2'}
`, {
        // AI modified: exercise the generic binary MIME GitHub Pages may use for generated text assets.
        headers: { 'Content-Type': 'application/octet-stream' },
        status: 200,
      })
    }

    if (requestUrl.pathname === '/review/audio/mp3/signal-bloom.mp3') {
      const contentRange = options.isContentRangeMissing
        ? ''
        : options.isContentRangeOutsideRequest
          ? 'bytes 0-2047/4096'
          : options.isContentRangeStartOffset
            ? 'bytes 100-1023/4096'
            : 'bytes 0-1023/4096'
      return binaryResponse('audio/mp3', contentRange, options.isRangeBodyLengthIncorrect ? 4 : 1024)
    }

    if (requestUrl.pathname === '/review/audio/hls/signal-bloom.m3u8') {
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', {
        headers: { 'Content-Type': 'audio/x-mpegurl; charset=utf-8' },
        status: 200,
      })
    }

    if (requestUrl.pathname === '/review/audio/hls/signal-bloom-96k_000.ts') {
      return binaryResponse('video/mp2t')
    }

    if (requestUrl.pathname === '/review/audio/dash/signal-bloom.mpd') {
      return new Response('<?xml version="1.0"?><MPD></MPD>', {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        status: 200,
      })
    }

    if (requestUrl.pathname === '/review/audio/dash/signal-bloom-init-1.m4s') {
      return binaryResponse('application/octet-stream')
    }

    if (requestUrl.pathname === '/review/audio/dash/signal-bloom-segment-1-00001.m4s') {
      return binaryResponse('audio/mp4')
    }

    return new Response('not found', {
      headers: { 'Content-Type': 'text/plain' },
      status: 404,
    })
  }))

  return {
    homeRequestCount: () => homeRequestCount,
    requests,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()

  if (previousRetryDelays === undefined) {
    delete process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS
  }
  else {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = previousRetryDelays
  }
})

describe('deployed documentation smoke', () => {
  it('runs after Vercel deployment with only read access', async () => {
    const documentationWorkflow = await readFile(resolve(import.meta.dirname, '../../.github/workflows/docs.yml'), 'utf8')
    const deployJobIndex = documentationWorkflow.indexOf('  deploy:')
    const smokeJobIndex = documentationWorkflow.indexOf('  smoke:')
    const smokeJob = documentationWorkflow.slice(smokeJobIndex)

    // AI modified: keep the real-origin probe downstream of deploy and isolated from Vercel credentials.
    expect(smokeJobIndex).toBeGreaterThan(deployJobIndex)
    expect(documentationWorkflow).toMatch(/deployment_url: \$\{\{ steps\.deploy_production\.outputs\.deployment_url/)
    expect(smokeJob).toContain('needs: deploy')
    expect(smokeJob).toContain('contents: read')
    expect(smokeJob).toContain('node apps/docs/scripts/smoke-deployed-site.mjs "$DEPLOYED_PAGE_URL"')
    expect(smokeJob).toMatch(/DEPLOYED_PAGE_URL: \$\{\{ needs\.deploy\.outputs\.deployment_url \}\}/)
    expect(smokeJob).not.toContain('pages: write')
    expect(smokeJob).not.toContain('id-token: write')
    expect(smokeJob).not.toContain('secrets.')
  })

  it('checks localized pages and ranged adaptive segments while retrying a transient edge response', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0,0'
    const fixtureSite = stubDeployedSite({ isInitialHomeUnavailable: true })

    const smokeSummary = await runDeployedSmoke('https://docs.example.test/review')
    const requestedPaths = new Set(fixtureSite.requests.map(request => request.url.pathname))
    const binaryPaths = [
      '/review/audio/mp3/signal-bloom.mp3',
      '/review/audio/hls/signal-bloom-96k_000.ts',
      '/review/audio/dash/signal-bloom-init-1.m4s',
      '/review/audio/dash/signal-bloom-segment-1-00001.m4s',
    ]

    expect(smokeSummary).toEqual({
      checkedEndpointCount: 12,
      siteRoot: 'https://docs.example.test/review/',
    })
    expect(fixtureSite.homeRequestCount()).toBe(2)
    expect(requestedPaths).toEqual(new Set([
      '/review/',
      '/review/api/',
      '/review/guide/getting-started',
      '/review/zh/',
      '/review/__gaudio-smoke-missing-route__',
      '/review/THIRD_PARTY_LICENSES.txt',
      '/review/audio/mp3/signal-bloom.mp3',
      '/review/audio/hls/signal-bloom.m3u8',
      '/review/audio/hls/signal-bloom-96k_000.ts',
      '/review/audio/dash/signal-bloom.mpd',
      '/review/audio/dash/signal-bloom-init-1.m4s',
      '/review/audio/dash/signal-bloom-segment-1-00001.m4s',
    ]))

    for (const binaryPath of binaryPaths) {
      const binaryRequest = fixtureSite.requests.find(request => request.url.pathname === binaryPath)
      expect(binaryRequest?.headers.get('range')).toBe('bytes=0-1023')
    }
  })

  it('rejects an MP3 range response without Content-Range', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isContentRangeMissing: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('MP3 demo asset range returned invalid Content-Range (missing)')
  })

  it('rejects a Content-Range larger than the requested byte window', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isContentRangeOutsideRequest: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('Content-Range bytes 0-2047/4096 outside requested bytes 0-1023')
  })

  it('rejects a partial response that starts after the requested first byte', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isContentRangeStartOffset: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('Content-Range bytes 100-1023/4096 outside requested bytes 0-1023')
  })

  it('rejects a binary body shorter than its declared Content-Range', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isRangeBodyLengthIncorrect: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('returned 4 bytes for Content-Range bytes 0-1023')
  })

  it('rejects an incomplete third-party attribution record', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isLicenseRecordIncomplete: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('third-party license record response body did not include nuxt@')
  })

  it('rejects a deployed SPA fallback that turns an unknown route into HTTP 200', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isUnknownRouteSuccessful: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('unknown documentation path returned HTTP 200; expected 404')
  })

  it('does not follow a redirect outside the deployment origin', async () => {
    process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS = '0'
    stubDeployedSite({ isCrossOriginRedirect: true })
    const smokeCheck = runDeployedSmoke('https://docs.example.test/review/')

    await expect(smokeCheck).rejects.toThrow('redirected outside')
  })
})
