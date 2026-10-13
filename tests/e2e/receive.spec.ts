import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  ensureOwnerAccount,
  findDoc,
  getDocFields,
  idOf,
  intOf,
  seedItems,
  stringsOf,
  type SeedItem,
} from './emulatorApi'
import { field, fillReceiptHeader, installFakeDetector } from './flows'

/**
 * Receiving, end to end (US2): a fake-camera EAN-13 scan, a typed page number, an unknown GTIN,
 * a count difference, a price change, and posting.
 *
 * The full flow needs a real Firestore and a signed-in owner, so it only runs against the
 * Firebase emulators:
 *   1. `.env.local`: VITE_USE_EMULATORS=1 and the usual VITE_FIREBASE_* keys.
 *   2. `npm run emulators` (renders the rules for the owner uid `test-owner`).
 *   3. `E2E_EMULATORS=1 npx playwright test tests/e2e/receive.spec.ts`
 * The test creates the `test-owner` account in the Auth emulator and seeds its own items
 * (RCV-01..04) over the emulators' REST API. Without E2E_EMULATORS it is skipped, like import.spec.
 *
 * The camera is the browser's fake device (see playwright.config.ts). Only the detector is
 * replaced: an init script installs a `BarcodeDetector` that returns what the test pushes into
 * `window.__scanQueue`, and the app picks the native detector when it is present and complete.
 * No test-only code exists in the app.
 */
const OWNER_UID = 'test-owner'

const ITEMS: readonly SeedItem[] = [
  {
    code: 'RCV-01',
    page: 91,
    nameAr: 'صنف استلام ألف',
    priceMinor: 1250,
    gtins: ['6001234500011'],
  },
  { code: 'RCV-02', page: 92, nameAr: 'صنف استلام باء', priceMinor: 800 },
  { code: 'RCV-03', page: 93, nameAr: 'صنف استلام جيم', priceMinor: 500 },
  { code: 'RCV-04', page: 94, nameAr: 'صنف استلام دال', priceMinor: 3000 },
]
const KNOWN_GTIN = '6001234500011'
const UNKNOWN_GTIN = '6221234567893'

type ScanWindow = Window & { __scanQueue: { rawValue: string; format: string }[] }

const scan = (page: Page, rawValue: string, format = 'ean_13') =>
  page.evaluate(
    ([value, fmt]) =>
      (window as unknown as ScanWindow).__scanQueue.push({ rawValue: value!, format: fmt! }),
    [rawValue, format],
  )

async function signIn(page: Page): Promise<void> {
  await page.goto('/')
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'الدخول بحساب جوجل' }).click()
  const popup = await popupPromise
  // The widget wires its click handlers when the page has parsed; clicking earlier does nothing.
  await popup.waitForLoadState('domcontentloaded')
  await popup.getByText(OWNER_UID).first().click()
  await expect(page.getByRole('link', { name: 'استلام طلبية جديدة' })).toBeVisible({
    timeout: 20_000,
  })
}

async function addScannedLine(page: Page, name: string): Promise<Locator> {
  const card = page.getByTestId('pending-line')
  await expect(card).toContainText(name)
  return card
}

test.describe('receive an order', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
  })

  test('scan, type, resolve an unknown GTIN, count a difference, change a price, post', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    const deliveryNo = `D${Date.now()}`
    await installFakeDetector(page)
    await signIn(page)
    await page.getByRole('link', { name: 'استلام طلبية جديدة' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('استلام')
    await fillReceiptHeader(page, deliveryNo)

    // 1. A fake-camera EAN-13 scan finds the item; a second scan adds one to the count.
    await scan(page, KNOWN_GTIN)
    let card = await addScannedLine(page, 'صنف استلام ألف')
    await expect(field(card, 'اللي اتعدّ')).toHaveValue('1')
    await expect(page.locator('[data-feedback="known"]')).toBeVisible()
    await page.waitForTimeout(1800) // the same box must leave the view before it counts again
    await scan(page, KNOWN_GTIN)
    await expect(field(card, 'اللي اتعدّ')).toHaveValue('2')

    // 2. A new price is flagged with the old one beside it.
    await field(card, 'رقم التشغيلة').fill('B-100')
    await field(card, 'الصلاحية').fill('03/2031')
    await field(card, 'الكمية في الفاتورة').fill('2')
    await field(card, 'السعر').fill('13')
    await expect(card.locator('[data-changed="true"]')).toContainText('12.50')
    await expect(card).toContainText('جاهز') // ready: no add button, it joins by itself
    await expect(page.getByRole('button', { name: 'إضافة للإذن' })).toHaveCount(0)

    // 3. A typed page number lists its item under the box (no Enter); tapping it joins the ready
    //    line above and starts this one. 50 invoiced, 48 counted: a difference.
    const search = page.getByRole('search').getByRole('combobox')
    await search.fill('92')
    await page.getByRole('option', { name: /صنف استلام باء/ }).click()
    await expect(search).toHaveValue('')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(page.getByTestId('saved-line')).toHaveCount(1)
    card = await addScannedLine(page, 'صنف استلام باء')
    await field(card, 'رقم التشغيلة').fill('B-200')
    await field(card, 'الصلاحية').fill('11/2030')
    await field(card, 'الكمية في الفاتورة').fill('50')
    await field(card, 'اللي اتعدّ').fill('48')

    // 4. An unknown GTIN joins the line above, then opens an unresolved line: pick the item once,
    //    and it is linked on posting.
    // The scanner ignores every code for 250 ms after a hit (src/scan/gate.ts). A real camera
    // reads the box again on the next frame; the fake detector returns it once, so wait it out.
    await page.waitForTimeout(300)
    await scan(page, UNKNOWN_GTIN)
    await expect(page.getByTestId('saved-line')).toHaveCount(2)
    card = page.getByTestId('pending-line')
    await expect(card).toContainText('مش معروف')
    await expect(page.locator('[data-feedback="unknown"]')).toBeVisible()
    // An unresolved line never joins silently: review is refused with the reason, and stays here.
    await page.getByRole('button', { name: /راجع واعتمد/ }).click()
    await expect(page.getByTestId('notice')).toContainText('اختار الصنف')
    await expect(page.getByRole('columnheader', { name: 'الفاتورة' })).toHaveCount(0)
    await card.getByRole('button', { name: 'اختار الصنف' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('searchbox').fill('93')
    await sheet.getByRole('button', { name: /صنف استلام جيم/ }).click()
    await expect(card).toContainText('RCV-03')
    await field(card, 'رقم التشغيلة').fill('B-300')
    await field(card, 'الصلاحية').fill('01/2032')
    await field(card, 'الكمية في الفاتورة').fill('10')
    await field(card, 'اللي اتعدّ').fill('10')

    // 5. Review takes the last ready line with it. The difference blocks اعتماد until it has a
    //    reason.
    const review = page.getByRole('button', { name: /راجع واعتمد/ })
    await expect(review).toHaveText(/3 سطور/)
    await review.click()
    await expect(page.getByRole('columnheader', { name: 'الفاتورة' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'اتعدّ' })).toBeVisible()
    const post = page.getByRole('button', { name: 'اعتماد', exact: true })
    await expect(post).toBeDisabled()
    await page.getByRole('button', { name: 'اكتب سبب الفرق' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ناقص من المورد' }).click()
    await page.getByRole('button', { name: 'حفظ السبب' }).click()
    await expect(post).toBeEnabled()

    // 6. Post: the seal appears, and the server ends up with the counted quantities.
    await post.click()
    await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible()
    await expect
      .poll(
        async () =>
          (await findDoc(request, 'receipts', 'deliveryNo', deliveryNo))?.fields.status
            ?.stringValue,
        { timeout: 30_000 },
      )
      .toBe('posted')

    const receipt = await findDoc(request, 'receipts', 'deliveryNo', deliveryNo)
    const id = receipt ? idOf(receipt) : ''
    const qty = async (n: number) =>
      intOf((await getDocFields(request, `movements/${id}-L${n}`))?.qty)
    expect([await qty(1), await qty(2), await qty(3)]).toEqual([2, 48, 10])

    const priceOf = async (code: string) =>
      intOf((await getDocFields(request, `items/${code}`))?.priceMinor)
    expect(await priceOf('RCV-01')).toBe(1300) // the new price
    expect(await priceOf('RCV-02')).toBe(800) // unchanged
    expect(stringsOf((await getDocFields(request, 'items/RCV-03'))?.gtins)).toContain(UNKNOWN_GTIN)
  })
})

test('the receive route renders an Arabic screen even without Firebase config', async ({
  page,
}) => {
  await page.goto('/receive')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
