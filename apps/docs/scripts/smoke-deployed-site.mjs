import process from 'node:process'
import { fileURLToPath } from 'node:url'

const defaultRetryDelaysMs = [0, 1_000, 2_000, 4_000, 8_000, 15_000]
const redirectStatuses = new Set([301, 302, 303, 307, 308])
const transientStatuses = new Set([404, 408, 425, 429, 500, 502, 503, 504])
const requestTimeoutMs = 15_000
const maximumRedirects = 5

class SmokeFailure extends Error {
  constructor(message, isRetriable = true) {
    super(message)
    this.name = 'SmokeFailure'
    this.isRetriable = isRetriable
  }
}

function deploymentRoot(pageUrl) {
  let siteRoot

  try {
    siteRoot = new URL(pageUrl)
  }
  catch {
    throw new SmokeFailure(`Invalid deployment URL: ${pageUrl}`, false)
  }

  if (!['http:', 'https:'].includes(siteRoot.protocol)) {
    throw new SmokeFailure(`Deployment URL must use HTTP or HTTPS: ${pageUrl}`, false)
  }

  if (siteRoot.username !== '' || siteRoot.password !== '') {
    throw new SmokeFailure('Deployment URL must not contain credentials.', false)
  }

  siteRoot.hash = ''
  siteRoot.search = ''

  if (!siteRoot.pathname.endsWith('/')) {
    siteRoot.pathname = `${siteRoot.pathname}/`
  }

  return siteRoot
}

function retryDelays() {
  const configuredDelays = process.env.GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS

  if (!configuredDelays) {
    return defaultRetryDelaysMs
  }

  const delays = configuredDelays.split(',').map(delay => Number(delay))

  // AI modified: tests can remove backoff without weakening the fixed production workflow defaults.
  if (delays.length === 0 || delays.length > 10 || delays.some(delay => !Number.isInteger(delay) || delay < 0 || delay > 60_000)) {
    throw new SmokeFailure('GAUDIO_DOCS_SMOKE_RETRY_DELAYS_MS must contain 1-10 comma-separated integers from 0 to 60000.', false)
  }

  return delays
}

function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

function isWithinDeployment(nextUrl, siteRoot) {
  return nextUrl.origin === siteRoot.origin
    && nextUrl.pathname.startsWith(siteRoot.pathname)
}

async function cancelResponse(response) {
  if (response.body && !response.bodyUsed) {
    await response.body.cancel().catch(() => {})
  }
}

async function sameSiteFetch(requestUrl, requestInit, siteRoot) {
  let currentUrl = requestUrl

  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      ...requestInit,
      redirect: 'manual',
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    if (!redirectStatuses.has(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    await cancelResponse(response)

    if (!location) {
      throw new SmokeFailure(`${currentUrl.href} returned ${response.status} without a Location header.`)
    }

    const nextUrl = new URL(location, currentUrl)

    // AI modified: deployment checks never follow a redirect outside the published Pages origin and base path.
    if (!isWithinDeployment(nextUrl, siteRoot)) {
      throw new SmokeFailure(`${currentUrl.href} redirected outside ${siteRoot.href}: ${nextUrl.href}`, false)
    }

    currentUrl = nextUrl
  }

  throw new SmokeFailure(`${requestUrl.href} exceeded ${maximumRedirects} redirects.`)
}

function mediaType(response) {
  return response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
}

function expectStatus(response, expectedStatus, label) {
  if (response.status !== expectedStatus) {
    const isRetriable = transientStatuses.has(response.status)
    throw new SmokeFailure(`${label} returned HTTP ${response.status}; expected ${expectedStatus}.`, isRetriable)
  }
}

function expectMediaType(response, acceptedMediaTypes, label) {
  const receivedMediaType = mediaType(response)

  if (!acceptedMediaTypes.includes(receivedMediaType)) {
    throw new SmokeFailure(`${label} returned Content-Type ${receivedMediaType || '(missing)'}; expected one of ${acceptedMediaTypes.join(', ')}.`)
  }
}

function byteRange(rangeHeader, label) {
  const rangeMatch = /^bytes=(\d+)-(\d+)$/i.exec(rangeHeader)

  if (!rangeMatch) {
    throw new SmokeFailure(`${label} uses unsupported Range ${rangeHeader}.`, false)
  }

  const rangeStart = Number(rangeMatch[1])
  const rangeEnd = Number(rangeMatch[2])

  if (!Number.isSafeInteger(rangeStart) || !Number.isSafeInteger(rangeEnd) || rangeEnd < rangeStart) {
    throw new SmokeFailure(`${label} uses invalid Range ${rangeHeader}.`, false)
  }

  return { rangeEnd, rangeStart }
}

function returnedByteRange(contentRange, requestedRange, label) {
  const contentRangeMatch = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange)

  if (!contentRangeMatch) {
    throw new SmokeFailure(`${label} returned invalid Content-Range ${contentRange || '(missing)'}.`)
  }

  const rangeStart = Number(contentRangeMatch[1])
  const rangeEnd = Number(contentRangeMatch[2])
  const totalBytes = contentRangeMatch[3] === '*' ? undefined : Number(contentRangeMatch[3])
  const hasSafeNumbers = Number.isSafeInteger(rangeStart)
    && Number.isSafeInteger(rangeEnd)
    && (totalBytes === undefined || Number.isSafeInteger(totalBytes))
  const isWithinRequest = rangeStart === requestedRange.rangeStart
    && rangeEnd >= rangeStart
    && rangeEnd <= requestedRange.rangeEnd
  const hasValidTotal = totalBytes === undefined || totalBytes > rangeEnd

  if (!hasSafeNumbers || !isWithinRequest || !hasValidTotal) {
    throw new SmokeFailure(`${label} returned Content-Range ${contentRange} outside requested bytes ${requestedRange.rangeStart}-${requestedRange.rangeEnd}.`)
  }

  return { rangeEnd, rangeStart }
}

async function checkResponse(check, siteRoot) {
  const requestUrl = new URL(check.path, siteRoot)

  if (!isWithinDeployment(requestUrl, siteRoot)) {
    throw new SmokeFailure(`${check.label} escaped the deployment site: ${requestUrl.href}`, false)
  }

  const response = await sameSiteFetch(requestUrl, {
    headers: {
      'Accept': check.accept,
      'Cache-Control': 'no-cache',
      ...(check.range ? { Range: check.range } : {}),
    },
  }, siteRoot)

  try {
    expectStatus(response, check.status, check.label)
    expectMediaType(response, check.mediaTypes, check.label)
    let responseRange

    if (check.range) {
      const requestedRange = byteRange(check.range, check.label)
      responseRange = returnedByteRange(response.headers.get('content-range') ?? '', requestedRange, check.label)
    }

    // AI modified: textual compliance records and manifests validate content, while binary probes validate bytes directly.
    if (check.bodyPattern || check.bodyIncludes) {
      const responseBody = await response.text()

      if (check.bodyPattern && !check.bodyPattern.test(responseBody)) {
        throw new SmokeFailure(`${check.label} response body did not match ${check.bodyPattern}.`)
      }

      for (const expectedText of check.bodyIncludes ?? []) {
        if (!responseBody.includes(expectedText)) {
          throw new SmokeFailure(`${check.label} response body did not include ${expectedText}.`)
        }
      }
    }
    else {
      const responseBytes = await response.arrayBuffer()

      if (responseBytes.byteLength === 0) {
        throw new SmokeFailure(`${check.label} returned an empty binary body.`)
      }

      // AI modified: a syntactically valid 206 must contain exactly the bytes its Content-Range claims.
      if (responseRange && responseBytes.byteLength !== responseRange.rangeEnd - responseRange.rangeStart + 1) {
        throw new SmokeFailure(`${check.label} returned ${responseBytes.byteLength} bytes for Content-Range bytes ${responseRange.rangeStart}-${responseRange.rangeEnd}.`)
      }
    }
  }
  finally {
    await cancelResponse(response)
  }
}

async function checkWithRetry(check, siteRoot, delays) {
  let lastFailure

  for (let attemptIndex = 0; attemptIndex < delays.length; attemptIndex += 1) {
    if (delays[attemptIndex] > 0) {
      await wait(delays[attemptIndex])
    }

    try {
      await checkResponse(check, siteRoot)
      return
    }
    catch (error) {
      lastFailure = error
      const isRetriable = !(error instanceof SmokeFailure) || error.isRetriable

      if (!isRetriable || attemptIndex === delays.length - 1) {
        throw error
      }

      const failureMessage = error instanceof Error ? error.message : String(error)
      console.warn(`[deployed-smoke] ${check.label} attempt ${attemptIndex + 1} failed: ${failureMessage}`)
    }
  }

  throw lastFailure
}

const deployedChecks = [
  {
    accept: 'text/html',
    bodyPattern: /<html\b/i,
    label: 'documentation home',
    mediaTypes: ['text/html', 'application/xhtml+xml'],
    path: '',
    status: 200,
  },
  {
    accept: 'text/html',
    bodyPattern: /<html\b/i,
    label: 'English getting-started page',
    mediaTypes: ['text/html', 'application/xhtml+xml'],
    path: 'guide/getting-started',
    status: 200,
  },
  {
    accept: 'text/html',
    bodyPattern: /<html\b/i,
    label: 'Chinese documentation home',
    mediaTypes: ['text/html', 'application/xhtml+xml'],
    path: 'zh/',
    status: 200,
  },
  {
    accept: 'text/html',
    bodyPattern: /<html\b/i,
    label: 'API reference',
    mediaTypes: ['text/html', 'application/xhtml+xml'],
    path: 'api/',
    status: 200,
  },
  {
    accept: 'text/html',
    bodyPattern: /<html\b/i,
    // AI modified: only the deployed origin can prove that an unknown documentation path retains HTTP 404 semantics.
    label: 'unknown documentation path',
    mediaTypes: ['text/html', 'application/xhtml+xml'],
    path: '__gaudio-smoke-missing-route__',
    status: 404,
  },
  {
    accept: 'text/plain, application/octet-stream',
    bodyIncludes: [
      'GAudio documentation third-party licenses',
      'dashjs@',
      'hls.js@',
      'nuxt@',
      '@nuxt/content@',
    ],
    // AI modified: the deployed site must expose the generated attribution record, not only bundle it locally.
    label: 'third-party license record',
    mediaTypes: ['text/plain', 'application/octet-stream'],
    path: 'THIRD_PARTY_LICENSES.txt',
    status: 200,
  },
  {
    accept: 'audio/mpeg',
    label: 'MP3 demo asset range',
    mediaTypes: ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'],
    path: 'audio/mp3/signal-bloom.mp3',
    range: 'bytes=0-1023',
    status: 206,
  },
  {
    accept: 'application/vnd.apple.mpegurl, application/x-mpegurl, audio/mpegurl, audio/x-mpegurl',
    bodyPattern: /^\s*#EXTM3U\b/,
    label: 'HLS demo manifest',
    mediaTypes: ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'],
    path: 'audio/hls/signal-bloom.m3u8',
    status: 200,
  },
  {
    accept: 'video/mp2t, audio/mp2t, video/mpeg, audio/mpeg, application/octet-stream',
    // AI modified: probe a real transport segment so a healthy playlist cannot mask missing media files.
    label: 'HLS transport-stream segment range',
    mediaTypes: ['video/mp2t', 'audio/mp2t', 'video/mpeg', 'audio/mpeg', 'application/octet-stream'],
    path: 'audio/hls/signal-bloom-96k_000.ts',
    range: 'bytes=0-1023',
    status: 206,
  },
  {
    accept: 'application/dash+xml, application/xml, text/xml',
    bodyPattern: /<MPD\b/i,
    label: 'DASH demo manifest',
    mediaTypes: ['application/dash+xml', 'application/xml', 'text/xml'],
    path: 'audio/dash/signal-bloom.mpd',
    status: 200,
  },
  {
    accept: 'audio/iso.segment, video/iso.segment, audio/mp4, video/mp4, application/mp4, application/octet-stream',
    // AI modified: DASH initialization and media objects must both survive Pages MIME and Range handling.
    label: 'DASH initialization segment range',
    mediaTypes: ['audio/iso.segment', 'video/iso.segment', 'audio/mp4', 'video/mp4', 'application/mp4', 'application/octet-stream'],
    path: 'audio/dash/signal-bloom-init-1.m4s',
    range: 'bytes=0-1023',
    status: 206,
  },
  {
    accept: 'audio/iso.segment, video/iso.segment, audio/mp4, video/mp4, application/mp4, application/octet-stream',
    label: 'DASH media segment range',
    mediaTypes: ['audio/iso.segment', 'video/iso.segment', 'audio/mp4', 'video/mp4', 'application/mp4', 'application/octet-stream'],
    path: 'audio/dash/signal-bloom-segment-1-00001.m4s',
    range: 'bytes=0-1023',
    status: 206,
  },
]

export async function smokeDeployedSite(pageUrl) {
  const siteRoot = deploymentRoot(pageUrl)
  const delays = retryDelays()

  // AI modified: run independent edge checks together so CDN propagation retries stay bounded.
  await Promise.all(deployedChecks.map(check => checkWithRetry(check, siteRoot, delays)))

  return {
    checkedEndpointCount: deployedChecks.length,
    siteRoot: siteRoot.href,
  }
}

async function main() {
  const pageUrl = process.argv[2]

  if (!pageUrl) {
    throw new SmokeFailure('Usage: node apps/docs/scripts/smoke-deployed-site.mjs <deployment-page-url>', false)
  }

  const smokeSummary = await smokeDeployedSite(pageUrl)
  console.log(`Deployed documentation smoke passed: ${smokeSummary.checkedEndpointCount} endpoints at ${smokeSummary.siteRoot}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
