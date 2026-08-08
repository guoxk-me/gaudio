import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { docsBase, docsRoute } from '../lib/docs-base.ts'

interface PageDiagnostics {
  consoleErrors: {
    columnNumber: number
    lineNumber: number
    text: string
    url: string
  }[]
  confirmedNotFoundDocumentUrls: Set<string>
  runtimeErrors: string[]
}

interface DocumentationRoute {
  path: string
  readySelector: string
}

const diagnosticsByPage = new WeakMap<Page, PageDiagnostics>()
const escapedDocsBase = docsBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const docsBaseUrlPattern = new RegExp(`${escapedDocsBase}$`)
const documentationRoutes: DocumentationRoute[] = [
  { path: docsBase, readySelector: '.home-mini-player' },
  { path: docsRoute('guide/getting-started'), readySelector: '.vp-doc' },
  { path: docsRoute('examples/'), readySelector: '.gaudio-studio' },
  { path: docsRoute('api/'), readySelector: '.vp-doc' },
  { path: docsRoute('zh/'), readySelector: '.home-mini-player' },
  { path: docsRoute('zh/guide/getting-started'), readySelector: '.vp-doc' },
  { path: docsRoute('zh/examples/'), readySelector: '.gaudio-studio' },
  { path: docsRoute('zh/api/'), readySelector: '.vp-doc' },
]

test.beforeEach(async ({ page }) => {
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    confirmedNotFoundDocumentUrls: new Set(),
    runtimeErrors: [],
  }

  diagnosticsByPage.set(page, diagnostics)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const messageLocation = message.location()

      diagnostics.consoleErrors.push({
        columnNumber: messageLocation.columnNumber,
        lineNumber: messageLocation.lineNumber,
        text: message.text(),
        url: messageLocation.url,
      })
    }
  })
  page.on('pageerror', (error) => {
    // AI modified: retain browser stacks so vendor-specific failures identify the unsupported operation.
    diagnostics.runtimeErrors.push(error.stack ?? error.message)
  })
  page.on('response', (response) => {
    // AI modified: console allowances require a browser-confirmed document 404, not only a matching message.
    if (response.status() === 404 && response.request().resourceType() === 'document') {
      diagnostics.confirmedNotFoundDocumentUrls.add(response.url())
    }
  })
})

test.afterEach(async ({ page }) => {
  const diagnostics = diagnosticsByPage.get(page)
  const consumedNotFoundConsoleUrls = new Set<string>()
  const unexpectedConsoleErrors = diagnostics?.consoleErrors.filter((consoleError) => {
    // AI modified: each confirmed document 404 may explain only one browser-owned line-zero console entry.
    const isExpectedNotFoundMessage = consoleError.text
      === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
    const isExpectedNotFoundNavigation = diagnostics.confirmedNotFoundDocumentUrls.has(consoleError.url)
      && consoleError.lineNumber === 0
      && consoleError.columnNumber === 0
      && isExpectedNotFoundMessage
      && !consumedNotFoundConsoleUrls.has(consoleError.url)

    if (isExpectedNotFoundNavigation) {
      consumedNotFoundConsoleUrls.add(consoleError.url)
    }

    return !isExpectedNotFoundNavigation
  }) ?? []

  expect(diagnostics?.runtimeErrors ?? []).toEqual([])
  expect(unexpectedConsoleErrors).toEqual([])
})

async function expectAccessible(page: Page, selector: string): Promise<void> {
  const accessibilityReport = await new AxeBuilder({ page })
    .include(selector)
    .analyze()

  expect(
    accessibilityReport.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap(node => node.target),
    })),
  ).toEqual([])
}

async function openSettledDocumentationRoute(page: Page, documentationRoute: DocumentationRoute): Promise<void> {
  await page.goto(documentationRoute.path)
  await expect(page.locator(documentationRoute.readySelector)).toBeVisible()
  // AI modified: wait for VitePress's post-render appearance label before auditing the complete page.
  await expect(page.locator('.VPSwitchAppearance').first()).toHaveAttribute('title', /\S/)
}

test('complete documentation pages remain accessible without horizontal overflow', async ({ page }, testInfo) => {
  test.slow()

  for (const documentationRoute of documentationRoutes) {
    await openSettledDocumentationRoute(page, documentationRoute)
    const hasHorizontalOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > window.innerWidth + 1
    ))

    expect(
      hasHorizontalOverflow,
      `${testInfo.project.name} ${documentationRoute.path} has horizontal overflow`,
    ).toBe(false)
    await expectAccessible(page, 'body')
  }

  if (testInfo.project.name === 'chromium') {
    await page.emulateMedia({ colorScheme: 'dark' })

    for (const documentationRoute of documentationRoutes.slice(0, 4)) {
      await openSettledDocumentationRoute(page, documentationRoute)
      await expect(page.locator('html')).toHaveClass(/dark/)
      await expectAccessible(page, 'body')
    }

    await page.emulateMedia({ colorScheme: 'light' })
    await openSettledDocumentationRoute(page, documentationRoutes[1])
    const browserDocumentStartedAt = await page.evaluate(() => performance.timeOrigin)

    // AI modified: prove the home landmark survives client-side VitePress navigation without a reload.
    await page.getByRole('link', { name: 'GAudio', exact: true }).first().click()
    await expect(page).toHaveURL(docsBaseUrlPattern)
    await expect(page.locator('.VPHome[role="main"]')).toBeVisible()
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(browserDocumentStartedAt)
    await expectAccessible(page, 'body')

    // AI modified: home-to-document client navigation must restore the named document region without a reload.
    await page.getByRole('link', { name: 'Guide', exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${docsRoute('guide/getting-started')}$`))
    await expect(page.getByRole('region', { name: 'Page information' })).toBeVisible()
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(browserDocumentStartedAt)
    await expectAccessible(page, 'body')
  }
})

test('localized not-found pages expose one main landmark without leaking it into normal routes', async ({ page }) => {
  const notFoundRoutes = [
    {
      path: docsRoute('not-a-real-route'),
      title: 'PAGE NOT FOUND',
      homeLink: 'go to home',
      homePath: docsBase,
    },
    {
      path: docsRoute('zh/not-a-real-route'),
      title: '页面未找到',
      homeLink: '返回 GAudio 中文首页',
      homePath: docsRoute('zh/'),
    },
  ] as const

  for (const notFoundRoute of notFoundRoutes) {
    const notFoundResponse = await page.goto(notFoundRoute.path)

    expect(notFoundResponse?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: notFoundRoute.title })).toBeVisible()
    await expect(page.locator('#VPContent')).toHaveAttribute('role', 'main')
    await expect(page.locator('main, [role="main"]')).toHaveCount(1)

    const hasHorizontalOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > window.innerWidth + 1
    ))

    expect(hasHorizontalOverflow, `${notFoundRoute.path} has horizontal overflow`).toBe(false)
    await expectAccessible(page, 'body')

    // AI modified: client navigation must release the persistent 404 role before the home landmark is exposed.
    await page.getByRole('link', { name: notFoundRoute.homeLink }).click()
    await expect(page).toHaveURL(new RegExp(`${notFoundRoute.homePath}$`))
    await expect(page.locator('#VPContent')).not.toHaveAttribute('role', 'main')
    await expect(page.locator('main, [role="main"]')).toHaveCount(1)
    // AI modified: settle the lazy home module before the next document navigation can abort its import.
    await expect(page.locator('.home-mini-player')).toBeVisible()
  }
})

test('interactive audio demo exposes keyboard-accessible playback controls', async ({ page }, testInfo) => {
  await page.goto(docsRoute('examples/'))

  await expect(page.getByRole('heading', { name: 'Interactive Demo' })).toBeVisible()
  const audioControls = page.getByRole('region', { name: 'Audio player controls' })
  const sampleCatalog = page.getByRole('region', { name: 'Sample track catalog' })

  await expect(audioControls).toBeVisible()
  const auroraTrackButton = sampleCatalog.getByRole('button', { name: /Aurora Loop/ })
  const signalTrackButton = sampleCatalog.getByRole('button', { name: /Signal Bloom/ })
  const formatControls = sampleCatalog.getByRole('group', { name: 'Format' })

  await expect(signalTrackButton).toBeVisible()
  await expect(auroraTrackButton).toHaveAttribute('aria-current', 'true')
  await expect(formatControls.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(audioControls.getByRole('button', { name: 'Play' })).toBeEnabled()
  const analyzerRegion = page.getByRole('region', { name: 'Audio analyzer visualization' })
  await expect(analyzerRegion).toBeVisible()
  await expect(analyzerRegion.getByRole('img')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start visualizer' })).toHaveCount(0)

  const seekSlider = audioControls.getByRole('slider', { name: 'Seek' })
  await expect(seekSlider).toBeVisible()
  await seekSlider.focus()
  await seekSlider.press('ArrowRight')
  await expect(seekSlider).toHaveAttribute('aria-valuenow', '1')

  await page.getByRole('tab', { name: 'Source' }).click()
  const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
  await expect(sourcePanel.getByRole('button', { name: 'Load source' })).toBeVisible()
  await expect(sourcePanel.getByLabel('Protocol')).toBeVisible()
  await expect(sourcePanel.getByText('Audio quality')).toBeVisible()

  if (testInfo.project.name === 'mobile-chromium') {
    const mobileNavigationButton = page.getByRole('button', { name: 'mobile navigation' })
    await expect(mobileNavigationButton).toBeVisible()
    await mobileNavigationButton.click()
    const mobileNavigation = page.locator('#VPNavScreen')
    await expect(mobileNavigation.getByRole('link', { name: 'Examples', exact: true })).toBeVisible()
    await expect(mobileNavigation.getByRole('link', { name: 'API', exact: true })).toBeVisible()
    await mobileNavigationButton.click()
  }
  else {
    const isHeaderAboveDemo = await page.evaluate(() => {
      const examplesLink = Array.from(document.querySelectorAll('.VPNav a'))
        .find(link => link.textContent?.includes('Examples'))

      if (!examplesLink) {
        return false
      }

      const headerLinkBounds = examplesLink.getBoundingClientRect()
      const topElement = document.elementFromPoint(
        headerLinkBounds.left + headerLinkBounds.width / 2,
        headerLinkBounds.top + headerLinkBounds.height / 2,
      )

      return topElement?.closest('.VPNav') !== null
    })

    expect(isHeaderAboveDemo).toBe(true)
  }

  await signalTrackButton.click()
  await expect(signalTrackButton).toHaveAttribute('aria-current', 'true')
  await expect(auroraTrackButton).not.toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('heading', { name: 'Signal Bloom' })).toBeVisible()
  await audioControls.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Warm Current' })).toBeVisible()

  await page.getByRole('tab', { name: 'Live telemetry' }).click()
  await page.getByRole('tab', { name: 'API', exact: true }).click()
  const apiCoverageRegion = page.getByRole('region', { name: 'API coverage' })

  await expect(apiCoverageRegion).toHaveAttribute('tabindex', '0')
  await apiCoverageRegion.focus()
  await expect(apiCoverageRegion).toBeFocused()

  if (testInfo.project.name === 'mobile-chromium') {
    // AI modified: exercise the mobile-only overflow that requires a keyboard-scrollable region.
    expect(await apiCoverageRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  }

  await expectAccessible(page, '.gaudio-studio')
  await page.getByRole('tab', { name: 'Events' }).click()
  await expect(page.getByRole('complementary', { name: 'Player status and events' })).toContainText('statechange')

  const hasHorizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ))
  expect(hasHorizontalOverflow).toBe(false)
  await expectAccessible(page, '.gaudio-studio')
})

test('real media playback supports play, pause, resume, and stop', async ({ page }) => {
  await page.goto(docsRoute('examples/'))

  const audioControls = page.getByRole('region', { name: 'Audio player controls' })
  const seekSlider = audioControls.getByRole('slider', { name: 'Seek' })
  const playButton = audioControls.getByRole('button', { name: 'Play' })

  // AI modified: exercise decoded media time instead of only checking that transport controls render.
  await playButton.click()
  const pauseButton = audioControls.getByRole('button', { name: 'Pause' })
  await expect(pauseButton).toBeVisible()
  await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow'))).toBeGreaterThan(0)

  await pauseButton.click()
  await expect(playButton).toBeVisible()
  const pausedTime = Number(await seekSlider.getAttribute('aria-valuenow'))
  await page.waitForTimeout(250)
  expect(Number(await seekSlider.getAttribute('aria-valuenow'))).toBe(pausedTime)

  await playButton.click()
  await expect(pauseButton).toBeVisible()
  await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow'))).toBeGreaterThan(pausedTime)
  await audioControls.getByRole('button', { name: 'Stop' }).click()
  await expect(playButton).toBeVisible()
  await expect(seekSlider).toHaveAttribute('aria-valuenow', '0')
})

test('player analyzer preview captures a non-silent signal from decoded media', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The public analyzer path is browser-independent and uses Chromium for deterministic sample evidence.')
  await page.goto(docsRoute('examples/'))

  const audioControls = page.getByRole('region', { name: 'Audio player controls' })
  const seekSlider = audioControls.getByRole('slider', { name: 'Seek' })
  await audioControls.getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow'))).toBeGreaterThan(0)

  await page.getByRole('tab', { name: 'Live telemetry' }).click()
  await page.getByRole('tab', { name: 'API', exact: true }).click()
  const captureButton = page.getByRole('button', { name: 'Capture analyzer preview' })
  const frequencyRow = page.locator('dt').filter({ hasText: /^Frequency$/ }).locator('..')
  const waveformRow = page.locator('dt').filter({ hasText: /^Waveform$/ }).locator('..')

  await expect.poll(async () => {
    await expect(captureButton).toBeEnabled()
    await captureButton.click()
    const frequencySamples = (await frequencyRow.textContent())
      ?.match(/\d+/g)
      ?.map(Number) ?? []
    const waveformSamples = (await waveformRow.textContent())
      ?.match(/\d+/g)
      ?.map(Number) ?? []

    return frequencySamples.some(sample => sample > 0)
      || waveformSamples.some(sample => sample !== 128)
  }, {
    message: 'expected decoded player audio to produce non-silent analyzer samples',
    timeout: 5_000,
  }).toBe(true)
})

test('every source input mode loads and custom resources close on replacement', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Source construction is browser-independent and runs once against decoded Chromium media.')
  await page.goto(docsRoute('examples/'))

  const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
  const sourceMode = sourcePanel.getByLabel('Source mode')
  const loadSourceButton = sourcePanel.getByRole('button', { name: 'Load source' })
  const sourceModes = [
    { label: 'Source object', value: 'source-description' },
    { label: 'HttpAudioSource', value: 'http-source' },
    { label: 'BlobAudioSource', value: 'blob-source' },
    { label: 'Custom AudioSource', value: 'custom-source' },
  ] as const

  for (const sourceInputMode of sourceModes) {
    await sourceMode.click()
    await page.getByRole('option', { name: sourceInputMode.label, exact: true }).click()
    // AI modified: prove the selected mode reaches the load branch instead of accepting a URL-string false positive.
    await expect(sourceMode).toContainText(sourceInputMode.label)
    await loadSourceButton.click()
    await expect(loadSourceButton).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Live telemetry' }).click()
    await page.getByRole('tab', { name: 'Events' }).click()
    await expect(page.getByRole('complementary', { name: 'Player status and events' }))
      .toContainText(`loaded source via: ${sourceInputMode.label}`)
    await page.getByRole('tab', { name: 'Source' }).click()
  }

  await page.getByRole('tab', { name: 'Playlist & utilities' }).click()
  const playlistPanel = page.getByRole('tabpanel', { name: 'Playlist & utilities' })
  const sourceLifecycle = playlistPanel.getByText('Source lifecycle', { exact: true }).locator('..')
  await expect(sourceLifecycle).toContainText('open 1 / close 0')
  await page.getByRole('tab', { name: 'Source' }).click()
  await sourceMode.click()
  await page.getByRole('option', { name: 'URL string', exact: true }).click()
  await loadSourceButton.click()
  await expect(loadSourceButton).toBeEnabled()
  await page.getByRole('tab', { name: 'Playlist & utilities' }).click()
  await expect(sourceLifecycle).toContainText('open 1 / close 1')
})

test('adaptive manifests cannot use BlobAudioSource without an HTTP resolution base', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Source-mode constraints are browser-independent and run once.')
  await page.goto(docsRoute('examples/'))

  const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
  const sourceMode = sourcePanel.getByLabel('Source mode')
  const protocol = sourcePanel.getByLabel('Protocol')

  await sourceMode.click()
  await page.getByRole('option', { name: 'BlobAudioSource', exact: true }).click()
  await expect(sourceMode).toContainText('BlobAudioSource')

  await protocol.click()
  await page.getByRole('option', { name: 'HLS', exact: true }).click()

  // AI modified: selecting an adaptive protocol immediately restores an HTTP-backed source mode.
  await expect(sourceMode).toContainText('HttpAudioSource')
  await sourceMode.click()
  await expect(page.getByRole('option', { name: /BlobAudioSource.*single-file media only/ }))
    .toHaveAttribute('aria-disabled', 'true')
  // AI modified: close the portalled source-mode menu before interacting with the underlying protocol control.
  await page.keyboard.press('Escape')

  await protocol.click()
  await page.getByRole('option', { name: 'auto', exact: true }).click()
  await sourcePanel.getByLabel('Source URL').fill(docsRoute('audio/legacy-playlist.M3U?token=demo'))
  await sourceMode.click()
  // AI modified: URL inference must protect legacy .m3u manifests even without an explicit protocol.
  await expect(page.getByRole('option', { name: /BlobAudioSource.*single-file media only/ }))
    .toHaveAttribute('aria-disabled', 'true')
})

test('playlist preview exercises alternate audio and bidirectional navigation with valid resources', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Playlist API behavior is browser-independent and runs once against decoded Chromium media.')
  await page.goto(docsRoute('examples/'))

  await page.getByRole('tab', { name: 'Playlist & utilities' }).click()
  const playlistPanel = page.getByRole('tabpanel', { name: 'Playlist & utilities' })
  const playlistStatus = playlistPanel.getByText('Playlist and media session', { exact: true }).locator('..')
  const runPreviewButton = playlistPanel.getByRole('button', { name: 'Run playlist preview' })
  const alternateAudioButton = playlistPanel.getByRole('button', { name: 'Select alternate audio' })
  const previousTrackButton = playlistPanel.getByRole('button', { name: 'Previous playlist track' })
  const nextTrackButton = playlistPanel.getByRole('button', { name: 'Next playlist track' })

  await expect(alternateAudioButton).toBeDisabled()
  await expect(previousTrackButton).toBeDisabled()
  await expect(nextTrackButton).toBeDisabled()
  await runPreviewButton.click()
  await expect(runPreviewButton).toBeEnabled()
  await expect(playlistStatus).toContainText('2 tracks / index 0 / 2 audio tracks / selected main')
  await expect(alternateAudioButton).toBeEnabled()
  await expect(previousTrackButton).toBeDisabled()
  await expect(nextTrackButton).toBeEnabled()

  await alternateAudioButton.click()
  await expect(alternateAudioButton).toBeEnabled()
  await expect(playlistStatus).toContainText('selected alternate')

  await nextTrackButton.click()
  await expect(page.getByRole('heading', { name: 'Signal Bloom' })).toBeVisible()
  await expect(playlistStatus).toContainText('2 tracks / index 1 / 0 audio tracks / selected default')
  await expect(previousTrackButton).toBeEnabled()
  await expect(nextTrackButton).toBeDisabled()

  await previousTrackButton.click()
  await expect(page.getByRole('heading', { name: 'Aurora Loop' })).toBeVisible()
  await expect(playlistStatus).toContainText('2 tracks / index 0 / 2 audio tracks / selected main')
})

test('manual sources reconcile catalog and Media Session ownership', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'The responsive shell is covered separately; source ownership runs on each desktop engine.')

  // AI modified: request rewriting gives every browser an external-looking URL backed by valid local media.
  await page.route('**/manual-source.mp3', async (route) => {
    await route.continue({
      url: route.request().url().replace('/manual-source.mp3', '/aurora-loop.mp3'),
    })
  })
  await page.goto(docsRoute('examples/'))

  const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
  const loadSourceButton = sourcePanel.getByRole('button', { name: 'Load source' })
  const sampleCatalog = page.getByRole('region', { name: 'Sample track catalog' })
  const signalTrackButton = sampleCatalog.getByRole('button', { name: /Signal Bloom/ })
  const formatControls = sampleCatalog.getByRole('group', { name: 'Format' })

  await sourcePanel.getByLabel('Source URL').fill(docsRoute('audio/mp3/signal-bloom.mp3'))
  await loadSourceButton.click()
  await expect(loadSourceButton).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Signal Bloom' })).toBeVisible()
  await expect(signalTrackButton).toHaveAttribute('aria-current', 'true')
  await expect(formatControls.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('tab', { name: 'Playlist & utilities' }).click()
  const mediaSessionStatus = page.getByText('Media session', { exact: true }).locator('..')
  await expect(mediaSessionStatus).toContainText('Signal Bloom')

  await page.getByRole('tab', { name: 'Source' }).click()
  await sourcePanel.getByLabel('Source URL').fill(docsRoute('audio/mp3/manual-source.mp3'))
  await loadSourceButton.click()
  await expect(loadSourceButton).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Manual source' })).toBeVisible()
  await expect(sampleCatalog.locator('[aria-current="true"]')).toHaveCount(0)
  await expect(formatControls.getByRole('button', { pressed: true })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Playlist & utilities' }).click()
  await expect(mediaSessionStatus).toContainText('none')
})

test('failed source loads expose a synchronized retryable state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'The responsive shell is covered separately; failure recovery runs on each desktop engine.')

  await page.addInitScript(() => {
    const nativeLoad = HTMLMediaElement.prototype.load

    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value(this: HTMLMediaElement) {
        if (this.src.includes('/aurora-loop.mp3?fail-once=1')) {
          // AI modified: fail a still-selected catalog source to prove same-item retry remains available.
          queueMicrotask(() => this.dispatchEvent(new Event('error')))
          return
        }

        nativeLoad.call(this)
      },
    })
  })
  await page.goto(docsRoute('examples/'))

  const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
  const sourceInput = sourcePanel.getByLabel('Source URL')
  const loadSourceButton = sourcePanel.getByRole('button', { name: 'Load source' })

  await sourceInput.fill(docsRoute('audio/mp3/aurora-loop.mp3?fail-once=1'))
  await loadSourceButton.click()
  await expect(loadSourceButton).toBeEnabled()
  await expect(sourceInput).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('Source operation failed')
  await expect(page.getByRole('heading', { name: 'Aurora Loop' })).toBeVisible()
  await expect(page.locator('.gaudio-studio__time-label')).toHaveText(['0:00', '0:00'])
  const seekSlider = page.getByRole('region', { name: 'Audio player controls' })
    .getByRole('slider', { name: 'Seek' })
  await expect(seekSlider).toBeDisabled()

  await page.getByRole('tab', { name: 'Live telemetry' }).click()
  const stateStatus = page.getByText('State', { exact: true }).locator('..')
  await expect(stateStatus).toContainText('error')

  for (const rangeLabel of ['Buffered', 'Seekable', 'Played']) {
    await expect(page.getByText(rangeLabel, { exact: true }).locator('..')).toContainText('none')
  }

  const sampleCatalog = page.getByRole('region', { name: 'Sample track catalog' })
  const auroraTrackButton = sampleCatalog.getByRole('button', { name: /Aurora Loop/ })

  await expect(auroraTrackButton).toHaveAttribute('aria-current', 'true')
  await auroraTrackButton.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Aurora Loop' })).toBeVisible()
  await expect(auroraTrackButton).toHaveAttribute('aria-current', 'true')
  await expect(stateStatus).toContainText('ready')
  await expect(seekSlider).toBeEnabled()

  await page.getByRole('tab', { name: 'Source' }).click()
  await sourceInput.fill(docsRoute('audio/mp3/aurora-loop.mp3?fail-once=1'))
  await loadSourceButton.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(seekSlider).toBeDisabled()

  const mp3FormatButton = sampleCatalog.getByRole('group', { name: 'Format' })
    .getByRole('button', { name: 'MP3', exact: true })

  await expect(mp3FormatButton).toHaveAttribute('aria-pressed', 'true')
  await mp3FormatButton.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Aurora Loop' })).toBeVisible()
  await expect(seekSlider).toBeEnabled()
})

const adaptiveSources = [
  {
    label: 'HLS',
    implementation: 'hls / hls.js',
    mediaSegmentPathPatterns: [
      /\/signal-bloom-(?:48k|96k|128k)_000\.ts$/,
      /\/signal-bloom-(?:48k|96k|128k)_001\.ts$/,
    ],
    url: docsRoute('audio/hls/signal-bloom.m3u8'),
  },
  {
    label: 'DASH',
    implementation: 'dash / dash.js',
    mediaSegmentPathPatterns: [
      /\/signal-bloom-segment-[012]-00001\.m4s$/,
      /\/signal-bloom-segment-[012]-00002\.m4s$/,
    ],
    url: docsRoute('audio/dash/signal-bloom.mpd'),
  },
] as const

// AI modified: the eight-second adaptive fixtures change media segments at roughly half of the timeline.
const adaptiveSeekProgress = 38
const adaptiveSegmentBoundaryProgress = 50
const adaptiveCrossSegmentProgress = 55

for (const adaptiveSource of adaptiveSources) {
  test.describe(`${adaptiveSource.label} adapter`, () => {
    test(`explicit ${adaptiveSource.label} source reaches stable adaptive controls`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-chromium', 'Adaptive vendor behavior is covered on every desktop engine; mobile duplicates Chromium.')

      const successfulMediaSegmentPositions = new Set<number>()
      page.on('response', (response) => {
        if (!response.ok()) {
          return
        }

        const responsePath = new URL(response.url()).pathname
        adaptiveSource.mediaSegmentPathPatterns.forEach((mediaSegmentPathPattern, mediaSegmentPosition) => {
          if (mediaSegmentPathPattern.test(responsePath)) {
            successfulMediaSegmentPositions.add(mediaSegmentPosition)
          }
        })
      })

      await page.goto(docsRoute('examples/'))
      const sourcePanel = page.getByRole('tabpanel', { name: 'Source' })
      const loadSourceButton = sourcePanel.getByRole('button', { name: 'Load source' })

      await expect(loadSourceButton).toBeEnabled()
      await sourcePanel.getByLabel('Source URL').fill(adaptiveSource.url)
      await sourcePanel.getByLabel('Protocol').click()
      await page.getByRole('option', { name: adaptiveSource.label, exact: true }).click()
      await loadSourceButton.click()
      await expect(loadSourceButton).toBeEnabled()

      await page.getByRole('tab', { name: 'Live telemetry' }).click()
      const implementationStatus = page.getByText('Implementation', { exact: true }).locator('..')
      const manifestStatus = page.getByText('Manifest', { exact: true }).locator('..')
      await expect(implementationStatus).toContainText(adaptiveSource.implementation)
      await expect(manifestStatus).toContainText('kbps')

      await page.getByRole('tab', { name: 'Adaptive' }).click()
      const adaptiveControls = page.getByRole('group', { name: 'Adaptive bitrate controls' })
      const manualQualityOption = adaptiveControls.getByRole('button').filter({ hasText: /kbps/ }).first()
      await expect(manualQualityOption).toBeEnabled()
      await manualQualityOption.click()
      await expect(manualQualityOption).toHaveAttribute('data-state', 'on')

      // AI modified: exercise adaptive transport across pause, resume, seek, and the fixture's first segment boundary.
      const audioControls = page.getByRole('region', { name: 'Audio player controls' })
      const seekSlider = audioControls.getByRole('slider', { name: 'Seek' })
      const playButton = audioControls.getByRole('button', { name: 'Play' })
      const pauseButton = audioControls.getByRole('button', { name: 'Pause' })

      await playButton.click()
      await expect(pauseButton).toBeVisible()
      await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
      await pauseButton.click()
      await expect(playButton).toBeVisible()
      const pausedProgress = Number(await seekSlider.getAttribute('aria-valuenow'))

      await playButton.click()
      await expect(pauseButton).toBeVisible()
      await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow')), {
        message: `${adaptiveSource.label} playback should advance after resuming`,
      }).toBeGreaterThan(pausedProgress)
      await pauseButton.click()
      await expect(playButton).toBeVisible()

      const seekTrack = seekSlider.locator('xpath=ancestor::*[@data-slot="slider"][1]')
        .locator('[data-slot="slider-track"]')
      const seekTrackBounds = await seekTrack.boundingBox()
      if (!seekTrackBounds) {
        throw new Error(`${adaptiveSource.label} seek track has no rendered bounds`)
      }
      await seekTrack.click({
        position: {
          x: seekTrackBounds.width * (adaptiveSeekProgress / 100),
          y: seekTrackBounds.height / 2,
        },
      })
      await expect(seekSlider).toBeEnabled()
      await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow')), {
        message: `${adaptiveSource.label} seek should settle before the second media segment`,
      }).toBeGreaterThanOrEqual(adaptiveSeekProgress - 8)
      expect(Number(await seekSlider.getAttribute('aria-valuenow'))).toBeLessThan(adaptiveSegmentBoundaryProgress)

      await playButton.click()
      await expect(pauseButton).toBeVisible()
      await expect.poll(async () => Number(await seekSlider.getAttribute('aria-valuenow')), {
        message: `${adaptiveSource.label} playback should cross the first media segment boundary`,
      }).toBeGreaterThan(adaptiveCrossSegmentProgress)
      await pauseButton.click()
      await expect(playButton).toBeVisible()

      await expect.poll(() => successfulMediaSegmentPositions.size, {
        message: `${adaptiveSource.label} should serve the first two media segments`,
      }).toBe(adaptiveSource.mediaSegmentPathPatterns.length)

      await page.getByRole('tab', { name: 'Live telemetry' }).click()
      await expect(page.getByText('Segment', { exact: true }).locator('..')).toContainText(/loaded|loading/)

      // AI modified: loading a direct source must clear telemetry owned by the previous adaptive engine.
      await page.getByRole('tab', { name: 'Source' }).click()
      await sourcePanel.getByLabel('Source URL').fill(docsRoute('audio/mp3/signal-bloom.mp3'))
      await sourcePanel.getByLabel('Protocol').click()
      await page.getByRole('option', { name: 'auto', exact: true }).click()
      await loadSourceButton.click()
      await expect(loadSourceButton).toBeEnabled()
      await page.getByRole('tab', { name: 'Live telemetry' }).click()
      await expect(implementationStatus).toContainText('media element')
      await expect(manifestStatus).toContainText('none')
    })
  })
}

test('homepage mini player is localized and links to each full demo', async ({ page }, testInfo) => {
  await page.goto(docsBase)

  const englishMiniPlayer = page.getByRole('region', { name: 'GAudio homepage mini player' })
  await expect(englishMiniPlayer).toBeVisible()
  await expect(englishMiniPlayer.getByRole('link', { name: 'Open interactive demo' })).toHaveAttribute('href', docsRoute('examples/'))
  await expect(englishMiniPlayer.getByRole('button', { name: 'Play' })).toBeEnabled()
  await expectAccessible(page, '.home-mini-player')

  await page.goto(docsRoute('zh/'))
  const chineseMiniPlayer = page.getByRole('region', { name: 'GAudio 首页迷你播放器' })
  await expect(chineseMiniPlayer).toBeVisible()
  await expect(chineseMiniPlayer.getByRole('link', { name: '打开完整交互 Demo' })).toHaveAttribute('href', docsRoute('zh/examples/'))
  await expect(chineseMiniPlayer.getByRole('button', { name: '播放' })).toBeEnabled()

  if (testInfo.project.name !== 'mobile-chromium') {
    await page.goto(docsRoute('zh/examples/'))
    await expect(page.getByRole('heading', { name: '交互 Demo' })).toBeVisible()
    await expect(page.getByRole('region', { name: '音频播放器控制' })).toBeVisible()
    const chineseAnalyzer = page.getByRole('region', { name: '音频分析可视化' })
    await expect(chineseAnalyzer.getByRole('img')).toBeVisible()
    await expect(chineseAnalyzer).toContainText('频谱')

    await page.getByRole('tab', { name: 'Adaptive' }).click()
    const adaptivePanel = page.getByRole('tabpanel', { name: 'Adaptive' })
    await expect(adaptivePanel).toContainText('HLS 支持')
    await expect(adaptivePanel).not.toContainText('HLS supported')

    await page.getByRole('tab', { name: '实时遥测' }).click()
    await page.getByRole('tab', { name: '事件' }).click()
    const eventLog = page.getByRole('log', { name: '事件' })
    await expect(eventLog).toHaveAttribute('aria-live', 'polite')
    await expect(eventLog).toHaveAttribute('aria-relevant', 'additions text')
    await expect(eventLog).toContainText(/状态变化|已加载 metadata/)
    await expect(eventLog).not.toContainText('statechange:')
  }
})

test('cleanup failures do not abort client-side navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Vue unmount error containment is browser-independent and runs once in Chromium.')
  await page.addInitScript(() => {
    const removeAttribute = Element.prototype.removeAttribute

    Reflect.set(window, 'shouldThrowGaudioCleanupError', false)
    Object.defineProperty(HTMLMediaElement.prototype, 'removeAttribute', {
      configurable: true,
      value(this: HTMLMediaElement, attributeName: string) {
        if (attributeName === 'src' && Reflect.get(window, 'shouldThrowGaudioCleanupError')) {
          Reflect.set(window, 'shouldThrowGaudioCleanupError', false)
          throw new Error('Injected cleanup failure')
        }

        return removeAttribute.call(this, attributeName)
      },
    })
  })
  await page.goto(docsBase)

  const miniPlayer = page.getByRole('region', { name: 'GAudio homepage mini player' })
  await expect(miniPlayer.getByRole('button', { name: 'Play' })).toBeEnabled()
  await page.evaluate(() => {
    Reflect.set(window, 'shouldThrowGaudioCleanupError', true)
  })
  await miniPlayer.getByRole('link', { name: 'Open interactive demo' }).click()
  await expect(page.locator('.gaudio-studio')).toBeVisible()

  await page.evaluate(() => {
    Reflect.set(window, 'shouldThrowGaudioCleanupError', true)
  })
  await page.getByRole('link', { name: 'GAudio', exact: true }).first().click()
  await expect(page.locator('.home-mini-player')).toBeVisible()
})

test('homepage playback failures remain retryable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Recoverable playback behavior runs on each desktop media engine.')

  await page.addInitScript(() => {
    let playAttempts = 0

    // AI modified: make the first media play deterministic so the retry state is exercised.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => {
        playAttempts += 1

        return playAttempts === 1
          ? Promise.reject(new DOMException('Playback rejected for test', 'NotAllowedError'))
          : Promise.resolve()
      },
    })
  })
  await page.goto(docsBase)

  const miniPlayer = page.getByRole('region', { name: 'GAudio homepage mini player' })
  const playButton = miniPlayer.getByRole('button', { name: 'Play' })

  await expect(playButton).toBeEnabled()
  await playButton.click()
  await expect(miniPlayer).toContainText('Playback failed — try again')
  await expect(playButton).toBeEnabled()
  await playButton.click()
  await expect(miniPlayer).not.toContainText('Playback failed — try again')
})

test('homepage sample load failures remain retryable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Recoverable load behavior runs on each desktop media engine.')

  await page.addInitScript(() => {
    const nativeLoad = HTMLMediaElement.prototype.load
    let shouldFailSampleLoad = true

    // AI modified: dispatch one media error without an intentional HTTP console error hiding real diagnostics.
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value(this: HTMLMediaElement) {
        if (shouldFailSampleLoad && this.getAttribute('src')?.includes('/audio/mp3/aurora-loop.mp3')) {
          shouldFailSampleLoad = false
          this.removeAttribute('src')
          queueMicrotask(() => this.dispatchEvent(new Event('error')))
          return
        }

        nativeLoad.call(this)
      },
    })
  })
  await page.goto(docsBase)

  const miniPlayer = page.getByRole('region', { name: 'GAudio homepage mini player' })
  const retryButton = miniPlayer.getByRole('button', { name: 'Retry sample' })

  await expect(miniPlayer).toContainText('Sample unavailable')
  await expect(retryButton).toBeEnabled()
  await retryButton.click()
  await expect(miniPlayer).not.toContainText('Sample unavailable')
  await expect(miniPlayer.getByRole('button', { name: 'Play' })).toBeEnabled()
})

test('API module roots hydrate before the Chinese mirror opens nested declarations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Mobile coverage stays focused on the responsive application shell.')
  // AI modified: visit the formerly ambiguous module root so SSR/client route collisions remain observable.
  await page.goto(docsRoute('api/core/'))
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('core')

  await page.goto(docsRoute('zh/api/'))

  await expect(page.locator('main')).toContainText('Start Here')
  await expect(page.locator('.VPNavBarMenu').getByRole('link', { name: 'API', exact: true })).toHaveAttribute('href', docsRoute('zh/api/'))

  await page.goto(docsRoute('zh/api/core/'))
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toContainText('core')
  await expect(page.locator('main')).toContainText('此声明级 API 参考由英文 TSDoc 自动生成')

  await page.goto(docsRoute('zh/api/core/classes/AudioPlayer'))
  await expect(page.getByRole('heading', { name: 'Class: AudioPlayer' })).toBeVisible()
  await expect(page.locator('main')).toContainText('此声明级 API 参考由英文 TSDoc 自动生成')
  await page.getByRole('link', { name: 'AudioPlayerOptions', exact: true }).first().click()
  await expect(page).toHaveURL(/\/gaudio\/zh\/api\/core\/interfaces\/AudioPlayerOptions$/)
  await expect(page.getByRole('heading', { name: 'Interface: AudioPlayerOptions' })).toBeVisible()
})
