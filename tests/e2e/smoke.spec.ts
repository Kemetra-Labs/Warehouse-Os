import { expect, test } from '@playwright/test'

test('loads the app with the Arabic title in RTL', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('مخزن الشرائح والمسامير')
  await expect(page.getByRole('heading', { name: 'مخزن الشرائح والمسامير' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
})
