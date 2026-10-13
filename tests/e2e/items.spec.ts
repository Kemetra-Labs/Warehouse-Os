import { expect, test, type Locator, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import {
  ensureOwnerAccount,
  findDoc,
  getDocFields,
  intOf,
  seedItems,
  seedStock,
  signInAsOwner,
  type SeedItem,
  type SeedStock,
} from './emulatorApi'

/**
 * Items, the item card and the edit form, end to end (US4): filter the list, open a card with an
 * addition, an issue and a reversal, edit the price, and check that the history keeps the price
 * each movement was posted at.
 *
 * The full flow needs a real Firestore and a signed-in owner, so it only runs against the
 * Firebase emulators (see the comment at the top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/items.spec.ts`
 * The test seeds its own items and movements over the emulators' REST API. Codes, pages,
 * categories and names are unique to the run, so earlier runs against the same emulator never
 * change what the filters show.
 */
const OWNER_UID = 'test-owner'

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-7${n}`
/** Typed page numbers have at most four digits, and must not repeat across runs. */
const PAGE = 1000 + (Math.floor(Date.now() / 1000) % 8000)

const catA = `كارت أ ${RUN}`
const catB = `كارت ب ${RUN}`
const NAME_CARD = `صنف الكارت ${RUN}`
const NAME_OUT = `صنف نافد ${RUN}`
const NAME_LOW = `صنف قليل ${RUN}`
const NAME_FULL = `صنف كتير ${RUN}`

const ITEMS: readonly SeedItem[] = [
  { code: code(1), page: PAGE, nameAr: NAME_CARD, priceMinor: 12_000, category: catA },
  { code: code(2), page: PAGE + 1, nameAr: NAME_OUT, priceMinor: 5_000, category: catB },
  { code: code(3), page: PAGE + 2, nameAr: NAME_LOW, priceMinor: 5_000, category: catA },
  { code: code(4), page: PAGE + 3, nameAr: NAME_FULL, priceMinor: 5_000, category: catB },
]

const ISSUED_ID = `e2e-${RUN}-2`
const stock = (
  over: Partial<SeedStock> & Pick<SeedStock, 'id' | 'itemCode' | 'qty'>,
): SeedStock => ({
  batchNo: 'K1',
  expiry: '2029-01',
  priceMinor: 12_000,
  ...over,
})
/** The card item: +10, an issue of 4, and the reversal of that issue. Balance 10. */
const STOCK: readonly SeedStock[] = [
  stock({ id: `e2e-${RUN}-1`, itemCode: code(1), qty: 10 }),
  stock({
    id: ISSUED_ID,
    itemCode: code(1),
    qty: 4,
    type: 'صرف',
    businessDate: '2026-01-02',
  }),
  stock({
    id: `rev-${ISSUED_ID}`,
    itemCode: code(1),
    qty: 4,
    type: 'تسوية',
    businessDate: '2026-01-03',
    reverses: ISSUED_ID,
    reason: 'اتصرف بالغلط',
  }),
  stock({ id: `e2e-${RUN}-3`, itemCode: code(3), qty: 3 }),
  stock({ id: `e2e-${RUN}-4`, itemCode: code(4), qty: 50 }),
]

const NAV = 'التنقل الرئيسي'
const list = (page: Page): Locator => page.getByRole('list', { name: 'الأصناف' })
const rowOf = (page: Page, name: string): Locator =>
  list(page).getByRole('button', { name: new RegExp(name) })
const chip = (page: Page, label: string): Locator =>
  page
    .getByRole('group', { name: 'فلتر الأصناف' })
    .getByRole('button', { name: new RegExp(`^${label}`) })

test.describe('items and the item card', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
    await seedStock(request, STOCK)
  })

  test('filter, search, open the card, edit the price: the history keeps its prices', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('navigation', { name: NAV }).getByRole('link', { name: 'الأصناف' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الأصناف')

    // 1. Filters: the category isolates this run, then the status narrows it.
    await page.getByLabel('الفئة').selectOption(catA)
    await expect(rowOf(page, NAME_CARD)).toBeVisible()
    await expect(rowOf(page, NAME_LOW)).toBeVisible()
    await expect(rowOf(page, NAME_OUT)).toHaveCount(0)
    await chip(page, 'تحتاج طلب').click()
    await expect(rowOf(page, NAME_LOW)).toBeVisible()
    await expect(rowOf(page, NAME_CARD)).toHaveCount(0)
    await page.getByLabel('الفئة').selectOption(catB)
    await chip(page, 'نافد').click()
    await expect(rowOf(page, NAME_OUT)).toBeVisible()
    await expect(rowOf(page, NAME_FULL)).toHaveCount(0)
    await chip(page, 'الكل').click()
    await expect(rowOf(page, NAME_FULL)).toBeVisible()

    // 2. Search by page number finds one item, whatever the filters were.
    await page.getByLabel('الفئة').selectOption({ label: 'كل الفئات' })
    await page.getByRole('searchbox', { name: 'بحث عن صنف' }).fill(String(PAGE))
    await expect(list(page).getByRole('button')).toHaveCount(1)
    await expect(rowOf(page, NAME_CARD)).toBeVisible()

    // 3. The card: data, balance, the batch, and three movements with a struck, linked reversal.
    await rowOf(page, NAME_CARD).click()
    await expect(page).toHaveURL(new RegExp(`/items/${code(1)}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAME_CARD)
    await expect(page.getByTestId('item-balance')).toHaveText('10')
    await expect(page.getByTestId('item-price')).toHaveText('120.00')
    await expect(page.getByRole('list', { name: 'التشغيلات' })).toContainText('K1')
    const rows = page.getByTestId('history-row')
    await expect(rows).toHaveCount(3)
    await expect(page.locator('[data-testid=history-row][data-struck=true]')).toHaveCount(1)
    const struck = page.locator('[data-testid=history-row][data-struck=true]')
    await expect(struck).toContainText('صرف')
    await expect(struck).toContainText('اتلغت')
    await expect(struck.getByRole('link', { name: 'الحركة العكسية' })).toBeVisible()
    await expect(rows.first()).toContainText('عكس حركة')
    await expect(rows.first()).toContainText('اتصرف بالغلط')
    for (const price of await page.getByTestId('history-price').all()) {
      await expect(price).toContainText('120.00')
    }

    // 4. The form refuses a page another item has, and says which item.
    await page.getByRole('link', { name: 'تعديل' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('تعديل الصنف')
    const save = page.getByRole('button', { name: 'حفظ', exact: true })
    await page.getByLabel('رقم الصفحة').fill(String(PAGE + 1))
    await expect(page.getByText(`رقم الصفحة ده عند صنف تاني (${code(2)})`)).toBeVisible()
    await expect(save).toBeDisabled()
    await page.getByLabel('رقم الصفحة').fill(String(PAGE))
    await expect(save).toBeEnabled()

    // 5. A new price: the form says old movements keep theirs, and the card shows the new one.
    await page.getByLabel('السعر (جنيه)').fill('150.5')
    await expect(page.getByText('الحركات القديمة هتفضل بسعرها')).toBeVisible()
    await save.click()
    await expect(page).toHaveURL(new RegExp(`/items/${code(1)}$`))
    await expect(page.getByTestId('item-price')).toHaveText('150.50')

    // 6. The history is untouched: every movement still shows 120.00, and the server agrees.
    await expect(page.getByTestId('history-row')).toHaveCount(3)
    for (const price of await page.getByTestId('history-price').all()) {
      await expect(price).toContainText('120.00')
    }
    await expect
      .poll(async () => intOf((await getDocFields(request, `items/${code(1)}`))?.priceMinor), {
        timeout: 30_000,
      })
      .toBe(15_050)
    for (const id of [`e2e-${RUN}-1`, ISSUED_ID, `rev-${ISSUED_ID}`]) {
      expect(intOf((await getDocFields(request, `movements/${id}`))?.priceMinor)).toBe(12_000)
    }
  })

  test('add an item: the code and page are suggested, and the item reaches the server', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    const name = `صنف جديد ${RUN}`
    await signInAsOwner(page, OWNER_UID)
    await page.goto('/items')
    await page.getByRole('link', { name: 'إضافة صنف' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صنف جديد')
    const codeField = page.getByLabel('الكود')
    await expect(page.getByLabel('رقم الصفحة')).toHaveValue(/^\d+$/)
    // The category decides the code's prefix: this run's category holds the PREFIX-71..74 items.
    await page.getByLabel('الفئة').fill(catA)
    const suggested = `${PREFIX}-75`
    await expect(codeField).toHaveValue(suggested)

    const save = page.getByRole('button', { name: 'حفظ', exact: true })
    await expect(save).toBeDisabled() // no name yet
    await page.getByLabel('الاسم بالعربي').fill(name)
    await page.getByLabel('السعر (جنيه)').fill('42')
    await page.getByLabel('باركود جديد').fill('12345')
    await page.getByRole('button', { name: 'إضافة باركود' }).click()
    await expect(page.getByRole('alert')).toContainText('8 أو 13 رقم')
    await page.getByLabel('باركود جديد').fill('6009876543210')
    await page.getByRole('button', { name: 'إضافة باركود' }).click()
    await expect(page.getByRole('list', { name: 'باركودات الصنف' })).toContainText('6009876543210')
    await expect(save).toBeEnabled()
    await save.click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByTestId('item-balance')).toHaveText('0')
    await expect
      .poll(async () => (await findDoc(request, 'items', 'nameAr', name))?.name ?? '', {
        timeout: 30_000,
      })
      .toContain(`/items/${suggested}`)
  })
})

test.describe('authority-code import', () => {
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
  })

  test('confirmed rows are written, the rest are listed, and the card shows the code', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const first = `7${RUN.slice(-7)}`
    const second = `1${RUN.slice(-8)}`
    const sheet = XLSX.utils.aoa_to_sheet([
      ['الكود', 'كود الهيئة', 'تأكيد'],
      [code(2), first, 'نعم'],
      [code(4), second, '✓'],
      [code(3), `8${RUN.slice(-7)}`, null],
      ['ZZZ-99', `6${RUN.slice(-7)}`, 'نعم'],
      [code(1), '1234', 'نعم'],
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'الأكواد')
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await signInAsOwner(page, OWNER_UID)
    await page.goto('/import')
    await page.getByLabel('ملف أكواد الهيئة').setInputFiles({
      name: 'authority.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    })
    await expect(page.getByTestId('authority-updates')).toHaveText('2')
    const summary = page.getByRole('list', { name: 'ملخص الملف' })
    await expect(summary).toContainText('صفوف من غير تأكيد اتساب: 1')
    await expect(page.getByText('أكواد مش موجودة في الأصناف (1)')).toBeVisible()
    await expect(page.getByText('صفوف مرفوضة (1)')).toBeVisible()
    await expect(page.getByText('كود الهيئة مش 8 أو 9 أرقام')).toBeVisible()

    await page.getByRole('button', { name: 'حدّث 2 صنف' }).click()
    await expect(page.getByText('اتحدّث 2 صنف.')).toBeVisible({ timeout: 30_000 })

    await page.goto(`/items/${code(2)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAME_OUT)
    await expect(page.getByLabel('بيانات الصنف')).toContainText(first)
  })
})

test('the items route renders an Arabic screen even without Firebase config', async ({ page }) => {
  await page.goto('/items')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
