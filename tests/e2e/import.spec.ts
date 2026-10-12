import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const FIXTURE = resolve(import.meta.dirname, '..', 'fixtures', 'mini-workbook.xlsx')

/**
 * Import and parity, end to end (US1).
 *
 * This needs a real Firestore, so it only runs against the Firebase emulators:
 *   1. `.env.local`: VITE_USE_EMULATORS=1 and the usual VITE_FIREBASE_* keys.
 *   2. `npm run emulators` (renders the rules for the owner uid `test-owner`).
 *   3. The account created in the Auth emulator popup must have uid `test-owner`
 *      (create it first in the emulator UI at http://localhost:4000 with that localId).
 *   4. `E2E_EMULATORS=1 npx playwright test tests/e2e/import.spec.ts`
 * Without E2E_EMULATORS the test is skipped; no test-only code path exists in the app.
 * NOT YET RUN against the emulators (needs the owner's local Firebase setup).
 */
test.describe('import the workbook', () => {
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test('imports the fixture, shows parity, and refuses a second import', async ({ page }) => {
    await page.goto('/')
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'الدخول بحساب جوجل' }).click()
    const popup = await popupPromise
    await popup.getByText('test-owner').click()

    await page.goto('/import')
    await page.locator('input[type="file"]').setInputFiles(FIXTURE)

    const result = page.getByRole('region', { name: 'نتيجة المطابقة' })
    await expect(result).toContainText('8 / 8')
    // The fixture keeps the 2026-01-08 typo, so two statuses differ and say why.
    await expect(result).toContainText('سبب محتمل: تاريخ الحركات الست')

    await page.getByRole('button', { name: 'استورد', exact: true }).click()
    await expect(page.getByText('تم الاستيراد')).toBeVisible({ timeout: 30_000 })

    await page.reload()
    await expect(page.getByText(/اتستورد قبل كده بتاريخ \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'استورد', exact: true })).toHaveCount(0)
  })
})

test('the import route renders an Arabic screen even without Firebase config', async ({ page }) => {
  await page.goto('/import')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
