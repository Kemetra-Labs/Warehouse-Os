// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { UnsentView } from '../../../src/data/unsent'
import { buildUnsentWorkbook, unsentWorkbookBytes } from '../../../src/excel/exportUnsent'

const issue: UnsentView = {
  id: 'b1',
  kind: 'issue',
  title: 'دفعة صرف 14',
  subtitle: 'إيجي فيكس',
  businessDate: '2026-10-12',
  status: 'failed',
  error: 'permission-denied: no',
  createdAt: 1,
  lines: [
    {
      itemCode: 'SCR-01',
      name: 'مسمار',
      type: 'صرف',
      qty: 3,
      priceMinor: 1250,
      batchNo: 'B1',
      expiry: '2028-01',
    },
    {
      itemCode: 'SCR-02',
      name: 'شريحة',
      type: 'صرف',
      qty: 1,
      priceMinor: 500,
      batchNo: null,
      expiry: null,
    },
  ],
}
const empty: UnsentView = {
  ...issue,
  id: 'r1',
  kind: 'receipt',
  title: 'استلام',
  lines: [],
  status: 'pending',
  error: null,
}

describe('buildUnsentWorkbook', () => {
  it('writes one row per movement, right to left, with prices in pounds', () => {
    const sheet = buildUnsentWorkbook([issue]).worksheets[0]
    expect(sheet?.views[0]).toMatchObject({ rightToLeft: true })
    expect(sheet?.rowCount).toBe(3)
    const first = sheet?.getRow(2)
    expect(first?.getCell('code').value).toBe('SCR-01')
    expect(first?.getCell('qty').value).toBe(3)
    expect(first?.getCell('price').value).toBe(12.5)
    expect(first?.getCell('kind').value).toBe('صرف')
    expect(first?.getCell('status').value).toBe('فشل الإرسال')
    expect(first?.getCell('error').value).toBe('permission-denied: no')
    expect(sheet?.getRow(3).getCell('batch').value).toBe('')
  })

  it('keeps a document with no readable lines as one row', () => {
    const sheet = buildUnsentWorkbook([empty]).worksheets[0]
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell('status').value).toBe('مستنية النت')
  })
})

describe('unsentWorkbookBytes', () => {
  it('produces a file that reads back', async () => {
    const bytes = await unsentWorkbookBytes([issue, empty])
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.slice().buffer)
    expect(book.worksheets[0]?.rowCount).toBe(4)
  })
})
