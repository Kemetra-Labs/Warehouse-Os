import { expect, test, type Download, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import {
  ensureOwnerAccount,
  findDoc,
  getDocFields,
  idOf,
  seedItems,
  seedStock,
  signInAsOwner,
  stringOf,
  stringsOf,
  type SeedItem,
  type SeedStock,
} from './emulatorApi'
import { approveIssue, receiveOneLine, startIssue } from './flows'

/**
 * Printable documents, ledger rows for the workbook, and the backup (US6), end to end.
 *
 * The flows need a real Firestore and a signed-in owner, so they only run against the Firebase
 * emulators (see the comment at the top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/exports.spec.ts`
 * The emulator is shared with the other specs, so their movements show up in the export too:
 * the tests look for their own rows by item code and never assert a row count.
 */
const OWNER_UID = 'test-owner'
const SYNC_TIMEOUT = 30_000

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-8${n}`
const REP = `مندوب تصدير ${RUN}`
const DELIVERY = `X${RUN}`

const ITEMS: readonly SeedItem[] = [
  {
    code: code(1),
    page: 861,
    nameAr: 'صنف تصدير أول',
    priceMinor: 12_550,
    category: `تصدير ${RUN}`,
  },
  {
    code: code(2),
    page: 862,
    nameAr: 'صنف تصدير ثاني',
    priceMinor: 5_000,
    category: `مرتجع ${RUN}`,
  },
  {
    code: code(3),
    page: 863,
    nameAr: 'صنف تصدير استلام',
    priceMinor: 8_000,
    category: `استلام ${RUN}`,
  },
]

const STOCK: readonly SeedStock[] = [
  {
    id: `e2e-${RUN}-1`,
    itemCode: code(1),
    qty: 20,
    batchNo: 'X1',
    expiry: '2029-01',
    priceMinor: 12_550,
    businessDate: '2026-02-03',
  },
  {
    id: `e2e-${RUN}-2`,
    itemCode: code(1),
    qty: -2,
    type: 'تسوية',
    batchNo: 'X1',
    expiry: '2029-01',
    priceMinor: 12_550,
    businessDate: '2026-02-04',
    reason: `جرد ${RUN}`,
  },
  {
    id: `e2e-${RUN}-3`,
    itemCode: code(2),
    qty: 3,
    type: 'مرتجع',
    batchNo: 'R1',
    expiry: '2029-01',
    priceMinor: 5_000,
    businessDate: '2026-02-05',
    reason: `رجع ${RUN}`,
  },
]

const FORMULA_COLUMNS = [1, 2, 6, 7, 8, 10, 14, 15] // A B F G H J N O (1-based)

async function readDownload(download: Download): Promise<ExcelJS.Workbook> {
  const path = await download.path()
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(path)
  return book
}

/** The row of the sheet whose column E (code) is `itemCode` and column D is `type`. */
function ledgerRow(sheet: ExcelJS.Worksheet, itemCode: string, type: string): ExcelJS.Row | null {
  let found: ExcelJS.Row | null = null
  sheet.eachRow((row) => {
    if (row.getCell(5).value === itemCode && row.getCell(4).value === type) found = row
  })
  return found
}

async function openExports(page: Page): Promise<void> {
  await page.goto('/exports')
  await expect(page.getByRole('heading', { level: 1, name: 'التصدير والطباعة' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByTestId('ledger-count')).toBeVisible({ timeout: 20_000 })
}

test.describe('exports: ledger rows, prints and backup', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  let batchId = ''

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
    await seedStock(request, STOCK)
  })

  test('ledger rows: download the new movements, confirm the paste, and the next export is empty', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    await signInAsOwner(page, OWNER_UID)
    await startIssue(page, REP, code(1), 5)
    await approveIssue(page)
    await expect
      .poll(
        async () => stringOf((await findDoc(request, 'issueBatches', 'rep', REP))?.fields.status),
        {
          timeout: SYNC_TIMEOUT,
        },
      )
      .toBe('posted')
    const batch = await findDoc(request, 'issueBatches', 'rep', REP)
    batchId = batch ? idOf(batch) : ''
    await expect.poll(async () => getDocFields(request, `movements/${batchId}-L1`)).not.toBeNull()

    await openExports(page)
    await expect(page.getByTestId('ledger-count')).not.toContainText('مفيش سطور جديدة')
    // The numbered steps name Skip blanks.
    await expect(page.getByRole('list', { name: 'خطوات اللصق' })).toContainText('Skip blanks')
    // "تم اللصق" only exists once a file was downloaded.
    await expect(page.getByRole('button', { name: 'تم اللصق' })).toHaveCount(0)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /نزّل ملف السطور/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(
      /^سطور-الحركات-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/,
    )

    const sheet = (await readDownload(download)).worksheets[0] as ExcelJS.Worksheet
    expect(sheet.name).toBe('سطور الحركات')
    const added = ledgerRow(sheet, code(1), 'إضافة')
    const adjusted = ledgerRow(sheet, code(1), 'تسوية')
    const issued = ledgerRow(sheet, code(1), 'صرف')
    const returned = ledgerRow(sheet, code(2), 'مرتجع')
    for (const [row, label] of [
      [added, 'إضافة'],
      [adjusted, 'تسوية'],
      [issued, 'صرف'],
      [returned, 'مرتجع'],
    ] as const) {
      expect(row, `a ${label} row for the run's items`).not.toBeNull()
      // Formula columns stay truly empty, so Skip blanks keeps the table's formulas.
      for (const col of FORMULA_COLUMNS) expect(row?.getCell(col).value).toBeNull()
    }
    expect(added?.getCell(9).value).toBe(20)
    expect(adjusted?.getCell(9).value).toBe(-2) // a signed تسوية
    expect(issued?.getCell(9).value).toBe(5)
    expect(returned?.getCell(9).value).toBe(3)
    // The business date is the same calendar day whatever the time zone is.
    expect((added?.getCell(3).value as Date).getTime()).toBe(Date.UTC(2026, 1, 3))
    expect((added?.getCell(17).value as string | null) ?? '').toBe('X1')
    expect((added?.getCell(18).value as Date).getTime()).toBe(Date.UTC(2029, 0, 31))
    expect(String(issued?.getCell(12).value)).toContain('1001') // the permit numbers, col L
    // The first sheet cell range A1:R{n} is named in the steps, outside the rows to copy.
    expect(String(sheet.getCell('T3').value)).toContain('A1:R')

    // "تم اللصق" records exactly the ids of that file.
    await page.getByRole('button', { name: 'تم اللصق' }).click()
    await expect(page.getByTestId('ledger-pasted')).toBeVisible()
    await expect(page.getByTestId('ledger-count')).toContainText('مفيش سطور جديدة')
    await expect(page.getByRole('button', { name: 'تم اللصق' })).toHaveCount(0)
    await expect
      .poll(
        async () => stringsOf((await getDocFields(request, 'settings/app'))?.lastLedgerExportedIds),
        { timeout: SYNC_TIMEOUT },
      )
      .toEqual(expect.arrayContaining([`e2e-${RUN}-1`, `e2e-${RUN}-3`, `${batchId}-L1`]))
    expect((await getDocFields(request, 'settings/app'))?.lastLedgerExportAt).toBeDefined()

    // A second export is empty, also after a reload.
    await openExports(page)
    await expect(page.getByTestId('ledger-count')).toContainText('مفيش سطور جديدة')
    await expect(page.getByRole('button', { name: /نزّل ملف السطور/ })).toBeDisabled()
  })

  test('prints: a posted batch and a posted receipt download as A4 right-to-left files', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    await signInAsOwner(page, OWNER_UID)

    // From the batch screen itself.
    await page.goto(`/issue/${batchId}`)
    await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible({ timeout: 20_000 })
    const batchDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'نزّل ملف للطباعة' }).click()
    const batchFile = await batchDownload
    expect(batchFile.suggestedFilename()).toMatch(/^صرف-دفعة-\d+\.xlsx$/)
    const issueSheet = (await readDownload(batchFile)).worksheets[0] as ExcelJS.Worksheet
    expect(String(issueSheet.getCell('A4').value)).toMatch(/^إذن صرف — دفعة \d+$/)
    expect(String(issueSheet.getCell('A6').value)).toBe(`المندوب: ${REP}`)
    expect(String(issueSheet.getCell('A7').value)).toBe('أرقام الأذون: 1001, 1002')
    expect(issueSheet.getRow(10).getCell(3).value).toBe(code(1))
    expect(issueSheet.getRow(10).getCell(7).value).toBe(125.5) // the price it was posted at
    expect(issueSheet.pageSetup.paperSize).toBe(9)
    expect(issueSheet.pageSetup.fitToWidth).toBe(1)
    expect(issueSheet.views[0]).toMatchObject({ rightToLeft: true })

    // A receipt, printed from the exports screen.
    await page.goto('/')
    await receiveOneLine(page, {
      deliveryNo: DELIVERY,
      pageNo: 863,
      itemName: 'صنف تصدير استلام',
      qty: 4,
    })
    await expect
      .poll(
        async () =>
          stringOf((await findDoc(request, 'receipts', 'deliveryNo', DELIVERY))?.fields.status),
        { timeout: SYNC_TIMEOUT },
      )
      .toBe('posted')
    await openExports(page)
    const row = page.getByTestId('print-row').filter({ hasText: DELIVERY })
    await expect(row).toHaveCount(1)
    const receiptDownload = page.waitForEvent('download')
    await row.getByRole('button', { name: 'نزّل للطباعة' }).click()
    const receiptFile = await receiptDownload
    expect(receiptFile.suggestedFilename()).toBe(`استلام-${DELIVERY}.xlsx`)
    const sheet = (await readDownload(receiptFile)).worksheets[0] as ExcelJS.Worksheet
    expect(String(sheet.getCell('A4').value)).toBe('إذن استلام — مخزن الشرائح والمسامير')
    expect(String(sheet.getCell('E6').value)).toBe(`رقم إذن التسليم: ${DELIVERY}`)
    expect(sheet.getRow(10).getCell(3).value).toBe(code(3))
    expect(sheet.getRow(10).getCell(8).value).toBe(4)
    expect(sheet.pageSetup.paperSize).toBe(9)
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true })
  })

  test('backup: three sheets with the data, and the reminder goes away', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await openExports(page)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'نزّل نسخة احتياطية' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^نسخة-احتياطية-\d{4}-\d{2}-\d{2}\.xlsx$/)

    const book = await readDownload(download)
    expect(book.worksheets.map((s) => s.name)).toEqual(['الأصناف', 'الحركات', 'المستندات'])
    const column = (sheet: ExcelJS.Worksheet | undefined, header: string): ExcelJS.CellValue[] => {
      const headers = (sheet?.getRow(1).values as (string | undefined)[]) ?? []
      const index = headers.indexOf(header)
      const out: ExcelJS.CellValue[] = []
      sheet?.eachRow((r, n) => {
        if (n > 1) out.push(r.getCell(index).value)
      })
      return out
    }
    expect(column(book.getWorksheet('الأصناف'), 'الكود')).toContain(code(1))
    const ids = column(book.getWorksheet('الحركات'), 'المعرّف')
    expect(ids).toContain(`e2e-${RUN}-1`)
    expect(ids).toContain(`${batchId}-L1`)
    expect(column(book.getWorksheet('المستندات'), 'الشركة / المندوب')).toContain(REP)

    await expect(page.getByTestId('backup-done')).toBeVisible()
    await expect(page.getByTestId('backup-status')).toContainText('آخر نسخة')
    await expect
      .poll(async () => (await getDocFields(request, 'settings/app'))?.lastBackupAt, {
        timeout: SYNC_TIMEOUT,
      })
      .toBeDefined()

    // The 7-day reminder on home is gone.
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'استلام طلبية جديدة' })).toBeVisible()
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0)
  })
})

test('the exports route renders an Arabic screen even without Firebase config', async ({
  page,
}) => {
  await page.goto('/exports')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText(/[؀-ۿ]/)
})
