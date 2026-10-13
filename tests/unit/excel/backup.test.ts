// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { BACKUP_REMINDER_DAYS, backupReminder } from '../../../src/domain/backupReminder'
import {
  issueBatchSchema,
  itemSchema,
  movementSchema,
  receiptSchema,
} from '../../../src/domain/types'
import {
  backupFile,
  backupFileName,
  DOCUMENT_COLUMNS,
  DOCUMENTS_SHEET,
  ITEM_COLUMNS,
  ITEMS_SHEET,
  MOVEMENT_COLUMNS,
  MOVEMENTS_SHEET,
  type BackupData,
} from '../../../src/excel/backup'
import { issueDoc, item, mov, receiptDoc, ts } from '../../helpers/exportFixtures'

const DATA: BackupData = {
  items: [
    item('SCR-01', {
      authorityCode: '123456789',
      reorderManual: 6,
      gtins: ['6221234567890', '12345670'],
    }),
  ],
  movements: [
    mov({
      id: 'm-a',
      type: 'صرف',
      qty: 3,
      source: { kind: 'issue', id: 'b1' },
      substituteFor: { itemCode: 'SCR-02', qty: 3 },
      note: 'بدل SCR-02',
    }),
    mov({
      id: 'rev-m-a',
      type: 'تسوية',
      qty: 3,
      reverses: 'm-a',
      reason: 'اتكرر',
      source: { kind: 'manual', id: null },
    }),
    mov({ id: 'imp-r7', source: { kind: 'import', id: null, row: 7 } }),
  ],
  receipts: [receiptDoc(), receiptDoc({ id: 'r2', status: 'draft', lines: [], deliveryNo: 'D-2' })],
  issueBatches: [issueDoc()],
}

async function reload(data: BackupData = DATA): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load((await backupFile(data, '2026-10-12')).bytes.slice().buffer)
  return book
}

const headersOf = (sheet: ExcelJS.Worksheet | undefined): string[] =>
  (sheet?.getRow(1).values as (string | undefined)[]).slice(1).map(String)

describe('the backup workbook', () => {
  it('has three sheets, right to left: الأصناف, الحركات, المستندات', async () => {
    const book = await reload()
    expect(book.worksheets.map((s) => s.name)).toEqual([
      ITEMS_SHEET,
      MOVEMENTS_SHEET,
      DOCUMENTS_SHEET,
    ])
    for (const sheet of book.worksheets) {
      expect(sheet.views[0]).toMatchObject({ rightToLeft: true })
    }
  })

  it('follows the contract for every sheet: A4 portrait, fit to one page wide, Arial', async () => {
    const book = await reload()
    for (const sheet of book.worksheets) {
      expect(sheet.pageSetup.paperSize).toBe(9)
      expect(sheet.pageSetup.orientation).toBe('portrait')
      expect(sheet.pageSetup.fitToPage).toBe(true)
      expect(sheet.pageSetup.fitToWidth).toBe(1)
      expect(sheet.pageSetup.showGridLines).toBeFalsy()
      expect(sheet.getCell('A1').font?.name).toBe('Arial')
      expect(sheet.getCell('A1').font?.bold).toBe(true)
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    }
    expect(book.getWorksheet(MOVEMENTS_SHEET)?.getCell('A2').font?.name).toBe('Arial')
  })

  it('keeps every item field (so a new schema field fails here)', async () => {
    const covered = new Set(ITEM_COLUMNS.map((c) => c.field))
    for (const field of Object.keys(itemSchema.shape)) expect(covered).toContain(field)

    const sheet = (await reload()).getWorksheet(ITEMS_SHEET)
    expect(headersOf(sheet)).toEqual(ITEM_COLUMNS.map((c) => c.header))
    expect(sheet?.rowCount).toBe(2)
    const row = sheet?.getRow(2)
    const at = (header: string) =>
      row?.getCell(ITEM_COLUMNS.findIndex((c) => c.header === header) + 1).value
    expect(at('الكود')).toBe('SCR-01')
    expect(at('الباركود (GTIN)')).toBe('6221234567890, 12345670')
    expect(at('كود الهيئة')).toBe('123456789')
    expect(at('السعر بالقرش')).toBe(12_550)
    expect(at('السعر (ج)')).toBe(125.5)
    expect(at('حد الطلب اليدوي')).toBe(6)
    expect(at('نشط')).toBe(true)
    expect(at('آخر تعديل')).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('keeps every movement field, with id, source, reversal link and posting time', async () => {
    const covered = new Set(MOVEMENT_COLUMNS.map((c) => c.field))
    for (const field of Object.keys(movementSchema.shape)) expect(covered).toContain(field)
    expect(covered).toContain('id')

    const sheet = (await reload()).getWorksheet(MOVEMENTS_SHEET)
    expect(headersOf(sheet)).toEqual(MOVEMENT_COLUMNS.map((c) => c.header))
    // Imported movements are in the backup too: it is a full copy, not the paste file.
    expect(sheet?.rowCount).toBe(4)
    const at = (rowNo: number, header: string) =>
      sheet?.getRow(rowNo).getCell(MOVEMENT_COLUMNS.findIndex((c) => c.header === header) + 1).value
    expect(at(2, 'المعرّف')).toBe('m-a')
    expect(at(2, 'مصدر الحركة')).toBe('issue')
    expect(at(2, 'مستند المصدر')).toBe('b1')
    expect(at(2, 'بدل عن (كود)')).toBe('SCR-02')
    expect(at(2, 'بدل عن (كمية)')).toBe(3)
    expect(String(at(2, 'وقت الاعتماد'))).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(at(3, 'بتعكس الحركة')).toBe('m-a')
    expect(at(3, 'السبب')).toBe('اتكرر')
    expect(at(4, 'صف الاستيراد')).toBe(7)
  })

  it('flattens documents to one row per line, and keeps a document with no lines', async () => {
    const sheet = (await reload()).getWorksheet(DOCUMENTS_SHEET)
    expect(headersOf(sheet)).toEqual(DOCUMENT_COLUMNS.map((c) => c.header))
    // r1: 2 lines. r2: no lines, still one row. b1: 2 requested + 3 issued.
    expect(sheet?.rowCount).toBe(1 + 2 + 1 + 5)
    const at = (rowNo: number, header: string) =>
      sheet?.getRow(rowNo).getCell(DOCUMENT_COLUMNS.findIndex((c) => c.header === header) + 1).value
    expect([at(2, 'نوع المستند'), at(2, 'رقم الإذن / الدفعة'), at(2, 'الحالة')]).toEqual([
      'استلام',
      'D-77/2',
      'معتمد',
    ])
    expect([
      at(2, 'كود الصنف'),
      at(2, 'الكمية بالفاتورة / المطلوبة'),
      at(2, 'الكمية المعدودة / المصروفة'),
    ]).toEqual(['SCR-01', 10, 8])
    expect(at(2, 'سبب الفرق')).toBe('ناقص من المورد')
    expect(at(2, 'السعر السابق بالقرش')).toBe(12_000)
    expect([at(4, 'نوع المستند'), at(4, 'الحالة'), at(4, 'كود الصنف')]).toEqual([
      'استلام',
      'مسودة',
      null,
    ])
    expect([at(5, 'نوع المستند'), at(5, 'نوع السطر')]).toEqual(['صرف', 'مطلوب'])
    expect([at(7, 'نوع السطر'), at(7, 'التشغيلة'), at(7, 'الكمية المعدودة / المصروفة')]).toEqual([
      'مصروف',
      'B-1',
      3,
    ])
    expect(at(9, 'بدل عن')).toBe('SCR-01')
    expect(at(7, 'أرقام الأذون')).toBe('1001, 1002')
    expect(at(7, 'قيمة المصروف بالقرش')).toBe(issueDoc().issuedValueMinor)
  })

  it('covers every receipt and issue document field', () => {
    // Document-level fields and line fields, by the header that keeps them.
    const headers = new Set(DOCUMENT_COLUMNS.map((c) => c.header))
    const expected: Record<string, readonly string[]> = {
      status: ['الحالة'],
      supplier: ['الشركة / المندوب'],
      deliveryNo: ['رقم الإذن / الدفعة'],
      invoiceNo: ['رقم الفاتورة'],
      invoiceDate: ['تاريخ الفاتورة'],
      supplyRequestNo: ['رقم طلب التوريد'],
      supplyOrderNo: ['رقم أمر التوريد'],
      businessDate: ['التاريخ'],
      lines: ['رقم السطر'],
      postedAt: ['وقت الاعتماد'],
      cancelledAt: ['وقت الإلغاء'],
      cancelReason: ['سبب الإلغاء'],
      priceUpdates: ['تحديثات الأسعار'],
      rep: ['الشركة / المندوب'],
      permits: ['أرقام الأذون'],
      requested: ['نوع السطر'],
      requestedValueMinor: ['قيمة المطلوب بالقرش'],
      issuedValueMinor: ['قيمة المصروف بالقرش'],
      issued: ['نوع السطر'],
      number: ['رقم الإذن / الدفعة'],
    }
    const schemaKeys = new Set([
      ...Object.keys(receiptSchema.shape),
      ...Object.keys(issueBatchSchema.shape),
    ])
    for (const key of schemaKeys) {
      expect(expected[key], `no column mapped for ${key}`).toBeDefined()
      for (const header of expected[key] ?? []) expect(headers).toContain(header)
    }
  })

  it('writes plain values, never formulas', async () => {
    const book = await reload()
    book.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) =>
          expect(
            typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value,
          ).toBe(false),
        ),
      ),
    )
  })

  it('still builds when the store is empty', async () => {
    const book = await reload({ items: [], movements: [], receipts: [], issueBatches: [] })
    expect(book.worksheets.map((s) => s.rowCount)).toEqual([1, 1, 1])
  })

  it('is named by the day', () => {
    expect(backupFileName('2026-10-12')).toBe('نسخة-احتياطية-2026-10-12.xlsx')
  })
})

describe('the 7-day backup reminder', () => {
  const DAY = 24 * 60 * 60 * 1000
  const NOW = Date.UTC(2026, 9, 12, 12)

  it('is due when no backup was ever made', () => {
    expect(backupReminder(null, NOW)).toEqual({ due: true, daysSince: null })
    expect(backupReminder(undefined, NOW).due).toBe(true)
  })

  it('is not due within 7 days, and exactly 7 days is still fine', () => {
    expect(BACKUP_REMINDER_DAYS).toBe(7)
    expect(backupReminder(ts(NOW - 2 * DAY), NOW)).toEqual({ due: false, daysSince: 2 })
    expect(backupReminder(ts(NOW - 7 * DAY), NOW)).toEqual({ due: false, daysSince: 7 })
  })

  it('is due once the backup is older than 7 days', () => {
    expect(backupReminder(ts(NOW - 7 * DAY - 1), NOW).due).toBe(true)
    expect(backupReminder(ts(NOW - 30 * DAY), NOW)).toEqual({ due: true, daysSince: 30 })
  })

  it('treats a backup stamped in the future (clock skew) as just made', () => {
    expect(backupReminder(ts(NOW + DAY), NOW)).toEqual({ due: false, daysSince: 0 })
  })
})
