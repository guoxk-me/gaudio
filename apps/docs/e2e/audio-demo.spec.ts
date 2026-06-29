import { expect, test } from '@playwright/test'

test('interactive audio demo renders the playable surface', async ({ page }) => {
  await page.goto('/gaudio/examples/')

  await expect(page.getByRole('heading', { name: 'Interactive Demo' })).toBeVisible()
  const musicPlayer = page.getByRole('region', { name: 'Music player demo' })
  const playerControls = page.getByRole('region', { name: 'Audio player controls' })

  await expect(musicPlayer).toBeVisible()
  await expect(playerControls).toBeVisible()
  await expect(musicPlayer.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(musicPlayer.getByLabel('Audio analyzer visualization')).toBeVisible()
  await expect(musicPlayer.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(playerControls.getByRole('button', { name: 'Load source' })).toBeVisible()
  await expect(musicPlayer.getByLabel('Seek')).toBeVisible()
  await expect(playerControls.getByText('Audio quality')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start visualizer' })).toHaveCount(0)

  // AI modified: lock the console layout against content-width, rail-height, and header stacking regressions.
  const layoutMetrics = await page.evaluate(() => {
    const demoHeading = document.querySelector('h1')
    const demoContainer = document.querySelector('.gaudio-demo')

    if (!demoHeading || !demoContainer) {
      return undefined
    }

    return {
      demoWidth: demoContainer.getBoundingClientRect().width,
      headingWidth: demoHeading.getBoundingClientRect().width,
    }
  })

  expect(layoutMetrics).toBeDefined()
  if (!layoutMetrics) {
    throw new Error('Demo layout metrics were unavailable')
  }

  expect(Math.abs(layoutMetrics.headingWidth - layoutMetrics.demoWidth)).toBeLessThanOrEqual(2)
  await expect.poll(async () => page.evaluate(() => {
    const playerPanel = document.querySelector('.music-player')
    const statusPanel = document.querySelector('.status')

    if (!playerPanel || !statusPanel) {
      return Number.POSITIVE_INFINITY
    }

    return Math.abs(playerPanel.getBoundingClientRect().height - statusPanel.getBoundingClientRect().height)
  })).toBeLessThanOrEqual(2)

  await musicPlayer.getByLabel('Seek').scrollIntoViewIfNeeded()
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

  await musicPlayer.getByRole('button', { name: 'Next track' }).click()

  await expect(page.getByRole('complementary', { name: 'Player status and events' })).toContainText('statechange')
})
