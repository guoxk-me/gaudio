import { expect, test } from '@playwright/test'

test('interactive audio demo renders the playable surface', async ({ page }) => {
  await page.goto('/gaudio/examples/')

  await expect(page.getByRole('heading', { name: 'Interactive Demo' })).toBeVisible()
  const musicPlayer = page.getByRole('region', { name: 'Music player demo' })
  const sampleCatalog = page.getByRole('region', { name: 'Sample track catalog' })

  await expect(musicPlayer).toBeVisible()
  await expect(sampleCatalog).toBeVisible()
  await expect(sampleCatalog.getByRole('button', { name: /Signal Bloom/ })).toBeVisible()
  await expect(musicPlayer.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(page.getByLabel('Audio analyzer visualization')).toBeVisible()
  await expect(musicPlayer.getByLabel('Seek')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start visualizer' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Source' }).click()
  const sourcePanel = page.getByRole('region', { name: 'Source' })
  await expect(sourcePanel.getByRole('button', { name: 'Load source' })).toBeVisible()
  await expect(sourcePanel.getByText('Audio quality')).toBeVisible()

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

  await sampleCatalog.getByRole('button', { name: /Signal Bloom/ }).click()
  await expect(page.getByRole('heading', { name: 'Signal Bloom' })).toBeVisible()

  await page.getByRole('tab', { name: 'Adaptive' }).click()
  const adaptiveControls = page.getByRole('region', { name: 'Adaptive' })
  await expect(adaptiveControls).toBeVisible()
  await page.locator('.gaudio-studio').getByRole('button', { name: 'HLS', exact: true }).click()
  const manualQualityOption = adaptiveControls.locator('button, [role="radio"]').filter({ hasText: /kbps/ }).first()
  await expect.poll(async () => manualQualityOption.count()).toBeGreaterThan(0)
  await manualQualityOption.click()
  await expect(manualQualityOption).toHaveAttribute('data-state', 'on')

  await musicPlayer.getByLabel('Next track').click()

  await page.getByRole('tab', { name: 'Live telemetry' }).click()
  await page.getByRole('tab', { name: 'Events' }).click()
  await expect(page.getByRole('complementary', { name: 'Player status and events' })).toContainText('statechange')
})

test('homepage mini player renders and links to the full demo', async ({ page }) => {
  await page.goto('/gaudio/')

  const miniPlayer = page.getByRole('region', { name: 'GAudio homepage mini player' })
  await expect(miniPlayer).toBeVisible()
  await expect(miniPlayer.getByRole('link', { name: 'Open interactive demo' })).toHaveAttribute('href', /examples/)
  await expect(miniPlayer.getByRole('button', { name: 'Play' })).toBeVisible()
})
