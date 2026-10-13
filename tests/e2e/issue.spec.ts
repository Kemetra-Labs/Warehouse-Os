import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  ensureOwnerAccount,
  findDoc,
  getDocFields,
  idOf,
  intOf,
  seedItems,
  seedStock,
  signInAsOwner,
  stringOf,
  type SeedItem,
  type SeedStock,
} from './emulatorApi'
import { addRequest, fillBatchHeader, joinOpenLine } from './flows'

/**
 * Issuing to the rep, end to end (US3): aggregation of the same item, a substitute for a short
 * item, a negative issue with a reason, posting, and the totals.
 *
 * The full flow needs a real Firestore and a signed-in owner, so it only runs against the
 * Firebase emulators (see the comment at the top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/issue.spec.ts`
 * The test creates the `test-owner` account, seeds its own items and their balances over the
 * emulators' REST API, and finds its batch by a representative name that is unique to the run.
 * Item codes and categories are unique to the run too, so earlier runs against the same emulator
 * never change which substitutes are offered.
 */
const OWNER_UID = 'test-owner'

/** Three letters from the clock: item codes must look like `ABC-01`. */
const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-0${n}`

const catFull = `صرف كامل ${RUN}`
const catShort = `صرف ناقص ${RUN}`
const catOther = `صرف تاني ${RUN}`
const catAlone = `صرف لوحده ${RUN}`

const ITEMS: readonly SeedItem[] = [
  { code: code(1), page: 201, nameAr: 'صنف صرف كامل', priceMinor: 12_000, category: catFull },
  { code: code(2), page: 202, nameAr: 'صنف صرف ناقص', priceMinor: 289_570, category: catShort },
  {
    code: code(3),
    page: 203,
    nameAr: 'صنف صرف بديل قريب',
    priceMinor: 289_570,
    category: catShort,
  },
  {
    code: code(4),
    page: 204,
    nameAr: 'صنف صرف بديل بعيد',
    priceMinor: 506_413,
    category: catShort,
  },
  {
    code: code(5),
    page: 205,
    nameAr: 'صنف صرف خارج الفئة',
    priceMinor: 289_000,
    category: catOther,
  },
  { code: code(6), page: 206, nameAr: 'صنف صرف بالسالب', priceMinor: 5_000, category: catAlone },
]

const stock = (n: number, qty: number, batchNo: string, priceMinor: number): SeedStock => ({
  id: `e2e-${RUN}-${n}`,
  itemCode: code(n),
  qty,
  batchNo,
  expiry: '2029-01',
  priceMinor,
})
const STOCK: readonly SeedStock[] = [
  stock(1, 30, 'F1', 12_000),
  stock(2, 4, 'N2', 289_570),
  stock(3, 3, 'N3', 289_570),
  stock(4, 9, 'N4', 506_413),
  stock(5, 2, 'D5', 289_000),
  stock(6, 1, 'Z6', 5_000),
]

const rowOf = (page: Page, name: string | RegExp): Locator => page.getByRole('row', { name })

const cell = (row: Locator, n: number): Locator => row.getByRole('cell').nth(n)

test.describe('issue to the rep', () => {
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

  test('aggregate, substitute, negative with a reason, post, totals', async ({ page, request }) => {
    test.setTimeout(120_000)
    const rep = `مندوب ${RUN}`
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('link', { name: 'صرف لمندوب' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('صرف')
    await fillBatchHeader(page, rep)

    // 1. The same item from two permits becomes one line (FR-041), fully available.
    await addRequest(page, code(1), 5)
    await joinOpenLine(page)
    await addRequest(page, code(1), 3)
    await joinOpenLine(page)
    const full = rowOf(page, /^صنف صرف كامل/)
    await expect(full).toHaveCount(1)
    await expect(cell(full, 1)).toHaveText('8')
    await expect(cell(full, 2)).toHaveText('8')

    // Leave for home: the open batch is the first thing there, and opening it brings it back.
    await page.getByRole('link', { name: 'الرئيسية', exact: true }).click()
    const pendingCell = page
      .getByLabel('ملخص المخزن')
      .locator('div')
      .filter({ hasText: 'تسويات معلّقة' })
      .locator('b')
    const settlementsBefore = Number(await pendingCell.textContent())
    await page
      .getByRole('list', { name: 'مسودات الصرف' })
      .getByRole('link', { name: new RegExp(RUN) })
      .click()
    await expect(cell(rowOf(page, /^صنف صرف كامل/), 1)).toHaveText('8')
    await expect(page.getByRole('button', { name: 'بيانات الدفعة' })).toBeVisible()

    // 2. A short item (6 asked, 4 in stock) blocks approving until a substitute covers it.
    await addRequest(page, code(2), 6)
    await joinOpenLine(page)
    const short = rowOf(page, /^صنف صرف ناقص/)
    await expect(short).toContainText('ناقص 2')
    const approve = page.getByRole('button', { name: 'اعتماد', exact: true })
    await expect(approve).toBeDisabled()
    await short.getByRole('button', { name: 'بديل', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: /بديل لـ 2/ })
    await expect(sheet.getByRole('radio').first()).toBeChecked() // the nearest price
    await expect(sheet.getByRole('listitem').first()).toContainText('صنف صرف بديل قريب')
    await expect(sheet.getByRole('listitem').first()).toContainText('±0')
    await expect(sheet.getByRole('listitem').nth(1)).toContainText('+75%')
    await expect(sheet).not.toContainText('صنف صرف خارج الفئة')
    await sheet.getByLabel('كل الفئات').check()
    await expect(sheet).toContainText('صنف صرف خارج الفئة')
    await sheet.getByLabel('كل الفئات').uncheck()
    await sheet.getByRole('button', { name: 'صرف 2 بديل' }).click()
    await expect(rowOf(page, /^صنف صرف بديل قريب/)).toContainText('بديل عن 2 صنف صرف ناقص')
    await expect(short).not.toContainText('ناقص 2')

    // 3. An item with no substitute in its category is issued below zero, with a reason.
    // راجع واعتمد takes the ready open line along and never posts: its row shows first.
    await addRequest(page, code(6), 3)
    await page.getByRole('button', { name: 'راجع واعتمد' }).click()
    await expect(page.locator('svg[aria-label*="معتمد"]')).toHaveCount(0)
    const negative = rowOf(page, /^صنف صرف بالسالب/)
    await expect(negative).toContainText('ناقص 2')
    await negative.getByRole('button', { name: 'بديل', exact: true }).click()
    const empty = page.getByRole('dialog', { name: /بديل لـ 2/ })
    await expect(empty).toContainText('مفيش بدائل')
    await empty.getByRole('button', { name: 'صرف بالسالب + سبب' }).click()
    const reason = page.getByRole('dialog', { name: 'سبب الصرف بالسالب' })
    await expect(reason.getByRole('button', { name: 'حفظ السبب' })).toBeDisabled()
    await reason.getByRole('button', { name: 'حالة مستعجلة' }).click()
    await reason.getByRole('button', { name: 'حفظ السبب' }).click()
    await expect(negative).toContainText('السبب: حالة مستعجلة')
    await expect(approve).toBeEnabled()

    // 4. The totals: the substitute costs the same, so issued equals requested.
    // 8 x 120 + 6 x 2,895.70 + 3 x 50 = 18,484.20
    const totals = page.getByTestId('totals')
    await expect(totals).toContainText('18,484.20')
    await expect(totals).toContainText('0.00')

    // 5. Post: the seal appears and the server ends up with the issued lines.
    await approve.click()
    await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible()
    await expect
      .poll(
        async () => stringOf((await findDoc(request, 'issueBatches', 'rep', rep))?.fields.status),
        {
          timeout: 30_000,
        },
      )
      .toBe('posted')

    const batch = await findDoc(request, 'issueBatches', 'rep', rep)
    const id = batch ? idOf(batch) : ''
    expect(intOf(batch?.fields.requestedValueMinor)).toBe(1_848_420)
    expect(intOf(batch?.fields.issuedValueMinor)).toBe(1_848_420)
    const line = async (n: number) => (await getDocFields(request, `movements/${id}-L${n}`)) ?? {}
    const [l1, l2, l3, l4] = [await line(1), await line(2), await line(3), await line(4)]
    expect([intOf(l1.qty), intOf(l2.qty), intOf(l3.qty), intOf(l4.qty)]).toEqual([8, 4, 2, 3])
    expect(stringOf(l1.itemCode)).toBe(code(1))
    expect(stringOf(l2.itemCode)).toBe(code(2)) // the requested item is debited only for what it had
    expect(stringOf(l3.itemCode)).toBe(code(3)) // the substitute is debited
    expect(stringOf(l3.reference)).toMatch(/^دفعة \d+$/)
    expect(stringOf(l3.type)).toBe('صرف')
    expect(stringOf(l3.substituteFor?.mapValue?.fields?.itemCode)).toBe(code(2))
    expect(stringOf(l4.reason)).toBe('حالة مستعجلة')
    expect(await getDocFields(request, `movements/${id}-L5`)).toBeNull()

    // 6. Home offers the open work and the tallies; the posted batch reopens read-only.
    await page.getByRole('button', { name: 'رجوع للرئيسية' }).click()
    // The item that went below zero joins تسويات معلّقة, and the batch is no longer an open draft.
    await expect(pendingCell).toHaveText(String(settlementsBefore + 1))
    await expect(page.getByRole('link', { name: new RegExp(RUN) })).toHaveCount(0)
    await page.goto(`/issue/${id}`)
    await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('permits')).toContainText('1001')
    await expect(page.getByTestId('permits')).toContainText('1002')
    await expect(page.getByRole('button', { name: 'اعتماد', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('totals')).toContainText('18,484.20')
  })
})

test('the issue route renders an Arabic screen even without Firebase config', async ({ page }) => {
  await page.goto('/issue')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
