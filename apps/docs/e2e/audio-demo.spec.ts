import { expect, test } from '@playwright/test'

test('interactive audio demo renders the playable surface', async ({ page }) => {
  await page.goto('/gaudio/examples/')

  await expect(page.getByRole('heading', { name: 'Interactive Demo' })).toBeVisible()
  const musicPlayer = page.getByRole('region', { name: 'Music player demo' })
  const playerControls = page.getByRole('region', { name: 'Audio player controls' })

  await expect(musicPlayer).toBeVisible()
  await expect(playerControls).toBeVisible()
  await expect(musicPlayer.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(playerControls.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(musicPlayer.getByLabel('Seek')).toBeVisible()
  await expect(playerControls.getByText('Audio quality')).toBeVisible()

  await musicPlayer.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('complementary', { name: 'Player status and events' })).toContainText('statechange')
})
