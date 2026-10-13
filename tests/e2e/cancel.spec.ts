import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
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
import { approveIssue, field, fillReceiptHeader, startIssue } from './flows'

/**
 * Correcting mistakes without editing posted data (US5), end to end: cancelling a posted issue
 * batch, a second cancel refused, an adjustment that clears a pending settlement, and a return.
 *
 * The flows need a real Firestore and a signed-in owner, so they only run against the Firebase
 * emulators (see the comment at the top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/cancel.spec.ts`
 * The tests create the `test-owner` account, seed their own items and balances over the
 * emulators' REST API, and find their documents by values that are unique to the run.
 *
 * The rules side of "refused twice" is proved by tests/rules/movements.test.ts (a cancel batch
 * against a cancelled document fails as a whole). Here the refusal is the app's own: a tab that
 * still shows the batch as posted is told it was already cancelled.
 */
const OWNER_UID = 'test-owner'
const SYNC_TIMEOUT = 30_000

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-7${n}`

const ITEMS: readonly SeedItem[] = [
  {
    code: code(1),
    page: 701,
    nameAr: 'صنف إلغاء الدفعة',
    priceMinor: 12_000,
    category: `إلغاء ${RUN}`,
  },
  {
    code: code(2),
    page: 702,
    nameAr: 'صنف رصيد سالب',
    priceMinor: 5_000,
    category: `تسوية ${RUN}`,
  },
  {
    code: code(4),
    page: 704,
    nameAr: 'صنف إلغاء الإذن',
    priceMinor: 10_000,
    category: `إذن ${RUN}`,
  },
  { code: code(3), page: 703, nameAr: 'صنف مرتجع', priceMinor: 8_000, category: `مرتجع ${RUN}` },
]

const STOCK: readonly SeedStock[] = [
  // 20 on the shelf.
  {
    id: `e2e-${RUN}-1`,
    itemCode: code(1),
    qty: 20,
    batchNo: 'C1',
    expiry: '2029-01',
    priceMinor: 12_000,
  },
  // Only an issue of 3 and no addition: the balance is -3, a pending settlement.
  {
    id: `e2e-${RUN}-2`,
    itemCode: code(2),
    qty: 3,
    batchNo: 'Z1',
    expiry: '2029-01',
    priceMinor: 5_000,
    type: 'صرف',
  },
  {
    id: `e2e-${RUN}-3`,
    itemCode: code(3),
    qty: 5,
    batchNo: 'R1',
    expiry: '2029-01',
    priceMinor: 8_000,
  },
]

const balance = (page: Page) => page.getByTestId('item-balance')
const sealOf = (page: Page, word: string) => page.locator(`svg[aria-label*="${word}"]`)

async function openCard(page: Page, itemCode: string): Promise<void> {
  await page.goto(`/items/${itemCode}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
}

/** Issues `qty` of an item to a new rep and waits until the server holds the batch as posted. */
async function postBatch(
  page: Page,
  request: APIRequestContext,
  rep: string,
  itemCode: string,
  qty: number,
): Promise<string> {
  await page.goto('/')
  await startIssue(page, rep, itemCode, qty)
  await approveIssue(page)
  await expect
    .poll(
      async () => stringOf((await findDoc(request, 'issueBatches', 'rep', rep))?.fields.status),
      {
        timeout: SYNC_TIMEOUT,
      },
    )
    .toBe('posted')
  const batch = await findDoc(request, 'issueBatches', 'rep', rep)
  return batch ? idOf(batch) : ''
}

/** Opens a posted batch, gives the reason and confirms the cancel. */
async function cancelBatch(page: Page, id: string, reason: string): Promise<void> {
  await page.goto(`/issue/${id}`)
  await expect(sealOf(page, 'معتمد')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'إلغاء الدفعة', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'سبب إلغاء الدفعة' })
  const confirm = sheet.getByRole('button', { name: 'تأكيد إلغاء الدفعة' })
  await expect(confirm).toBeDisabled() // a reason is required
  await sheet.getByLabel('السبب').fill(reason)
  await confirm.click()
}

test.describe('cancel, return and adjust', () => {
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

  test('cancelling a posted batch returns the balance and keeps both movements', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await signInAsOwner(page, OWNER_UID)
    await openCard(page, code(1))
    await expect(balance(page)).toHaveText('20')

    const id = await postBatch(page, request, `مندوب إلغاء ${RUN}`, code(1), 5)
    await openCard(page, code(1))
    await expect(balance(page)).toHaveText('15')

    const reason = `اتصرفت للمندوب الغلط ${RUN}`
    await cancelBatch(page, id, reason)
    await expect(sealOf(page, 'ملغي')).toBeVisible()
    await expect(sealOf(page, 'معتمد')).toHaveCount(0)
    await expect(page.getByTestId('cancelled-note')).toContainText(reason)
    await expect(page.getByRole('button', { name: 'إلغاء الدفعة', exact: true })).toHaveCount(0)

    // The server: the batch is cancelled, the reversal exists, the original is untouched.
    await expect
      .poll(async () => stringOf((await getDocFields(request, `issueBatches/${id}`))?.status), {
        timeout: SYNC_TIMEOUT,
      })
      .toBe('cancelled')
    const batch = (await getDocFields(request, `issueBatches/${id}`)) ?? {}
    expect(stringOf(batch.cancelReason)).toBe(reason)
    const original = (await getDocFields(request, `movements/${id}-L1`)) ?? {}
    expect([stringOf(original.type), intOf(original.qty)]).toEqual(['صرف', 5])
    const reversal = (await getDocFields(request, `movements/rev-${id}-L1`)) ?? {}
    expect(stringOf(reversal.type)).toBe('تسوية')
    expect(intOf(reversal.qty)).toBe(5)
    expect(stringOf(reversal.reverses)).toBe(`${id}-L1`)
    expect(stringOf(reversal.reason)).toBe(reason)

    // The card: the balance is back, and both movements show (the issue struck through).
    await openCard(page, code(1))
    await expect(balance(page)).toHaveText('20')
    await expect(page.getByTestId('history-row')).toHaveCount(3)
    const struck = page.locator('[data-testid="history-row"][data-struck="true"]')
    await expect(struck).toHaveCount(1)
    await expect(struck).toContainText('صرف')
    await expect(struck).toContainText('اتلغت')
    const reversalRow = page.getByTestId('history-row').filter({ hasText: 'عكس حركة' })
    await expect(reversalRow).toHaveCount(1)
    // The reversal links back to its batch, like the movement it reverses.
    await expect(reversalRow.locator(`a[href="/issue/${id}"]`)).toHaveCount(1)

    // Reopened, the batch stays cancelled and offers no way to cancel it again.
    await page.goto(`/issue/${id}`)
    await expect(sealOf(page, 'ملغي')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'إلغاء الدفعة', exact: true })).toHaveCount(0)
  })

  test('cancelling a posted receipt returns the balance and restores the price', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    const deliveryNo = `D${RUN}`
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('link', { name: 'استلام طلبية جديدة' }).click()
    await fillReceiptHeader(page, deliveryNo)
    const box = page.getByRole('search').getByRole('combobox')
    await box.fill('704')
    await box.press('Enter')
    const card = page.getByTestId('pending-line')
    await expect(card).toContainText('صنف إلغاء الإذن')
    await field(card, 'رقم التشغيلة').fill('RC-1')
    await field(card, 'الصلاحية').fill('03/2031')
    await field(card, 'الكمية في الفاتورة').fill('6')
    await field(card, 'اللي اتعدّ').fill('6')
    await field(card, 'السعر').fill('110')
    await page.getByRole('button', { name: /راجع واعتمد/ }).click()
    await page.getByRole('button', { name: 'اعتماد', exact: true }).click()
    await expect(sealOf(page, 'معتمد')).toBeVisible()
    await expect
      .poll(
        async () =>
          stringOf((await findDoc(request, 'receipts', 'deliveryNo', deliveryNo))?.fields.status),
        {
          timeout: SYNC_TIMEOUT,
        },
      )
      .toBe('posted')
    const receipt = await findDoc(request, 'receipts', 'deliveryNo', deliveryNo)
    const id = receipt ? idOf(receipt) : ''
    expect(intOf((await getDocFields(request, `items/${code(4)}`))?.priceMinor)).toBe(11_000)

    await page.goto(`/receive/${id}`)
    await expect(sealOf(page, 'معتمد')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'إلغاء الإذن', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'سبب إلغاء الإذن' })
    const confirm = sheet.getByRole('button', { name: 'تأكيد إلغاء الإذن' })
    await expect(confirm).toBeDisabled()
    await sheet.getByLabel('السبب').fill(`استلام بالغلط ${RUN}`)
    await confirm.click()
    await expect(sealOf(page, 'ملغي')).toBeVisible()
    await expect(page.getByRole('button', { name: 'إلغاء الإذن', exact: true })).toHaveCount(0)

    await expect
      .poll(async () => stringOf((await getDocFields(request, `receipts/${id}`))?.status), {
        timeout: SYNC_TIMEOUT,
      })
      .toBe('cancelled')
    const reversal = (await getDocFields(request, `movements/rev-${id}-L1`)) ?? {}
    expect([stringOf(reversal.type), intOf(reversal.qty)]).toEqual(['تسوية', -6])
    expect(stringOf(reversal.reverses)).toBe(`${id}-L1`)
    // The price is back to what it was before the receipt; the original movement is still there.
    expect(intOf((await getDocFields(request, `items/${code(4)}`))?.priceMinor)).toBe(10_000)
    expect(intOf((await getDocFields(request, `movements/${id}-L1`))?.qty)).toBe(6)

    await openCard(page, code(4))
    await expect(balance(page)).toHaveText('0')
    await expect(page.getByTestId('item-price')).toHaveText('100.00')
    await expect(page.getByTestId('history-row')).toHaveCount(2)
  })

  test('a second cancel is refused, and writes nothing', async ({ page, request, context }) => {
    test.setTimeout(150_000)
    await signInAsOwner(page, OWNER_UID)
    const id = await postBatch(page, request, `مندوب مرتين ${RUN}`, code(1), 2)

    // Tab A opens the posted batch and keeps showing it as posted.
    await page.goto(`/issue/${id}`)
    await expect(sealOf(page, 'معتمد')).toBeVisible({ timeout: 20_000 })

    // Tab B cancels it first.
    const other = await context.newPage()
    await cancelBatch(other, id, `الأولى ${RUN}`)
    await expect(sealOf(other, 'ملغي')).toBeVisible()
    await expect
      .poll(async () => stringOf((await getDocFields(request, `issueBatches/${id}`))?.status), {
        timeout: SYNC_TIMEOUT,
      })
      .toBe('cancelled')
    await other.close()

    // Tab A still has the cancel button. The app knows the batch is cancelled by now.
    await page.waitForTimeout(2_000)
    await page.getByRole('button', { name: 'إلغاء الدفعة', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'سبب إلغاء الدفعة' })
    await sheet.getByLabel('السبب').fill(`التانية ${RUN}`)
    await sheet.getByRole('button', { name: 'تأكيد إلغاء الدفعة' }).click()
    await expect(page.getByRole('alert')).toContainText('اتلغى قبل كده')
    await expect(sealOf(page, 'معتمد')).toBeVisible()

    // The server kept the first reason: nothing was written by the second attempt.
    const batch = (await getDocFields(request, `issueBatches/${id}`)) ?? {}
    expect(stringOf(batch.cancelReason)).toBe(`الأولى ${RUN}`)
  })

  test('an adjustment clears a pending settlement', async ({ page, request }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await openCard(page, code(2))
    await expect(balance(page)).toHaveText('-3')
    await expect(page.getByText('تسوية معلّقة', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'سوّي الرصيد' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرتجع وتسوية')
    // The form opens as the adjustment that brings the balance to 0.
    await expect(page.getByLabel('الكمية')).toHaveValue('3')
    await expect(page.getByTestId('adjust-preview')).toContainText('الرصيد بعد الحركة 0')
    const save = page.getByRole('button', { name: 'سجّل التسوية' })

    // A reason is required: clearing it turns the button off.
    await page.getByLabel('السبب').fill('')
    await expect(save).toBeDisabled()
    const reason = `تسوية بعد الجرد ${RUN}`
    await page.getByLabel('السبب').fill(reason)
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByTestId('adjust-done')).toContainText('تسوية +3')

    await expect
      .poll(
        async () => stringOf((await findDoc(request, 'movements', 'reason', reason))?.fields.type),
        {
          timeout: SYNC_TIMEOUT,
        },
      )
      .toBe('تسوية')
    const movement = await findDoc(request, 'movements', 'reason', reason)
    expect(stringOf(movement?.fields.itemCode)).toBe(code(2))
    expect(intOf(movement?.fields.qty)).toBe(3)
    expect(stringOf(movement?.fields.batchNo)).toBe('Z1') // the batch that was below zero
    expect(stringOf(movement?.fields.reverses)).toBeNull()

    await openCard(page, code(2))
    await expect(balance(page)).toHaveText('0')
    await expect(page.getByText('تسوية معلّقة', { exact: true })).toHaveCount(0)
  })

  test('a return adds the pieces back, with its reason', async ({ page, request }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await page.goto(`/items/${code(3)}/adjust`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرتجع وتسوية')
    await expect(page.getByTestId('adjust-preview')).toBeVisible()

    const reason = `رجع من المندوب ${RUN}`
    await page.getByLabel('الكمية').fill('2')
    await page.getByLabel('السبب').fill(reason)
    await page.getByRole('button', { name: 'سجّل المرتجع' }).click()
    await expect(page.getByTestId('adjust-done')).toContainText('مرتجع +2')

    await expect
      .poll(
        async () => stringOf((await findDoc(request, 'movements', 'reason', reason))?.fields.type),
        {
          timeout: SYNC_TIMEOUT,
        },
      )
      .toBe('مرتجع')
    await openCard(page, code(3))
    await expect(balance(page)).toHaveText('7')
  })
})

test('the adjust route renders an Arabic screen even without Firebase config', async ({ page }) => {
  await page.goto('/items/ABC-01/adjust')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
