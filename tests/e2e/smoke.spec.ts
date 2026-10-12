import { expect, test } from '@playwright/test'

test('loads the app as an Arabic RTL screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('مخزن الشرائح والمسامير')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')

  // With no Firebase config this is the config-error screen; with config, the sign-in screen.
  // Either way the page must render a visible Arabic heading, not a blank page or a crash.
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
