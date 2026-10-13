import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import {
  deleteDocAdmin,
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
} from './emulatorApi'
import { approveIssue, fillBatchHeader, addRequest, pill, warmLazyScreens } from './flows'

/**
 * A post the server rejects after an offline period (research R12, SC-005), end to end:
 * the pill turns red, the payload stays on the unsent screen, it can be exported to Excel, and a
 * retry succeeds once the cause is gone. Needs the Firebase emulators (see the comment at the
 * top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/outbox-rejected.spec.ts`
 *
 * How the rejection is produced. The rules only judge the shape of a write plus, for a batch
 * post, the document's old status; movements are create-only. So while the phone is offline and
 * the batch is already queued, this test writes a movement with the id the post will use
 * (`{batchId}-L1`) straight to the emulator as its admin. When the phone reconnects, its movement
 * create lands on an existing document, the rules read it as an update and refuse the whole
 * atomic batch. The server still holds the batch as a draft, so the outbox's "is it already on
 * the server" check (R12) correctly says no and the entry is kept, not cleared. (A server-side
 * `posted` or `cancelled` status would not do: the check would then read it as "already applied".)
 * No test-only code exists in the app.
 */
const OWNER_UID = 'test-owner'
const SYNC_TIMEOUT = 60_000

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const ISSUED = `${PREFIX}-71`
const DECOY = `${PREFIX}-72`

const ITEMS: readonly SeedItem[] = [
  { code: ISSUED, page: 971, nameAr: 'صنف رفض الصرف', priceMinor: 4_000, category: `ر1 ${RUN}` },
  { code: DECOY, page: 972, nameAr: 'صنف رفض الحاجز', priceMinor: 900, category: `ر2 ${RUN}` },
]

const serverStatus = async (
  request: Parameters<typeof findDoc>[0],
  rep: string,
): Promise<string | null> =>
  stringOf((await findDoc(request, 'issueBatches', 'rep', rep))?.fields.status)

test.describe('a post the server rejects after reconnecting', () => {
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
    await seedStock(request, [
      {
        id: `rej-${RUN}-1`,
        itemCode: ISSUED,
        qty: 10,
        batchNo: 'R1',
        expiry: '2029-01',
        priceMinor: 4_000,
      },
    ])
  })

  test('red pill, payload kept on the unsent screen, export, retry', async ({
    page,
    context,
    request,
  }, testInfo) => {
    test.setTimeout(240_000)
    const rep = `مندوب رفض ${RUN}`
    await signInAsOwner(page, OWNER_UID)
    await warmLazyScreens(page)

    // Online: start the batch and wait until its draft is on the server (that gives us its id).
    await page.getByRole('link', { name: 'صرف لمندوب' }).click()
    await fillBatchHeader(page, rep)
    await addRequest(page, ISSUED, 2)
    await expect.poll(() => serverStatus(request, rep), { timeout: SYNC_TIMEOUT }).toBe('draft')
    const draft = await findDoc(request, 'issueBatches', 'rep', rep)
    const id = draft ? idOf(draft) : ''
    expect(id).not.toBe('')

    // Offline: post it. The seal shows and the pill counts what waits.
    await context.setOffline(true)
    await approveIssue(page)
    await expect(pill(page, /^\d+ مستنية النت$/)).toBeVisible()

    // While it waits, the server gets a movement with the id this post will use.
    await seedStock(request, [
      { id: `${id}-L1`, itemCode: DECOY, qty: 1, batchNo: 'X', expiry: '2029-01', priceMinor: 900 },
    ])

    // Reconnect: the server refuses the batch, the pill turns red, nothing was posted.
    await context.setOffline(false)
    await expect(pill(page, 'فشل الإرسال')).toBeVisible({ timeout: SYNC_TIMEOUT })
    expect(await serverStatus(request, rep)).toBe('draft')
    expect(await getDocFields(request, `movements/${id}-L1`)).toMatchObject({
      itemCode: { stringValue: DECOY }, // still the decoy: the post did not overwrite it
    })

    // The red pill leads to the unsent screen, which holds the whole payload.
    await pill(page, 'فشل الإرسال').click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مستندات لم تُرسل')
    const card = page.getByRole('article', { name: new RegExp(rep) })
    await expect(card).toContainText('فشل الإرسال')
    await card.getByText(/^التفاصيل/).click()
    await expect(card).toContainText('permission-denied')
    await expect(card).toContainText('صنف رفض الصرف')

    // It survives a reload (it lives in IndexedDB, not in memory).
    await page.reload()
    await expect(pill(page, 'فشل الإرسال')).toBeVisible({ timeout: SYNC_TIMEOUT })
    await page.getByRole('link', { name: 'الرئيسية', exact: true }).click()
    await pill(page, 'فشل الإرسال').click()
    await expect(page.getByRole('article', { name: new RegExp(rep) })).toBeVisible()

    // Export to Excel: a real workbook with the rejected lines.
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'تصدير لإكسيل' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/)
    const path = testInfo.outputPath('unsent.xlsx')
    await file.saveAs(path)
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(path)
    const sheet = book.worksheets[0]
    const codes = sheet?.getColumn('E').values.map((v) => String(v ?? ''))
    expect(codes).toContain(ISSUED)

    // Retrying while the cause is still there: pending for a moment, then failed again, with
    // the payload kept. (Wait for the verdict: the movement must stay until it has come.)
    const entry = page.getByRole('article', { name: new RegExp(rep) })
    await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click()
    await expect(entry).toHaveAttribute('data-status', 'pending')
    await expect(entry).toHaveAttribute('data-status', 'failed', { timeout: SYNC_TIMEOUT })
    await expect(pill(page, 'فشل الإرسال')).toBeVisible()
    expect(await serverStatus(request, rep)).toBe('draft')

    // Once the colliding movement is gone, the retry goes through and the entry clears.
    await deleteDocAdmin(request, `movements/${id}-L1`)
    await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click()
    await expect(page.getByText('مفيش حاجة متعلّقة')).toBeVisible({ timeout: SYNC_TIMEOUT })
    await expect(pill(page, 'متزامن')).toBeVisible({ timeout: SYNC_TIMEOUT })
    await expect.poll(() => serverStatus(request, rep), { timeout: SYNC_TIMEOUT }).toBe('posted')
    const line = await getDocFields(request, `movements/${id}-L1`)
    expect(stringOf(line?.itemCode)).toBe(ISSUED)
    expect(intOf(line?.qty)).toBe(2)
  })
})
