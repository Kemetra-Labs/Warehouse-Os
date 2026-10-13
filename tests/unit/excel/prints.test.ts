// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { safeFileName } from '../../../src/excel/bytes'
import {
  buildIssuePrint,
  ISSUE_COLUMNS,
  issuePrintFile,
  issuePrintFileName,
} from '../../../src/excel/printIssue'
import { PrintError } from '../../../src/excel/printLayout'
import {
  buildReceiptPrint,
  RECEIPT_COLUMNS,
  receiptPrintFile,
  receiptPrintFileName,
} from '../../../src/excel/printReceipt'
import { issueDoc, issueMovements, item, receiptDoc, ts } from '../../helpers/exportFixtures'

const ITEMS = [item('SCR-01', { page: 12 }), item('SCR-02', { page: 14, priceMinor: 999_999 })]

async function reload(file: { bytes: Uint8Array }): Promise<ExcelJS.Worksheet> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(file.bytes.slice().buffer)
  expect(book.worksheets).toHaveLength(1)
  return book.worksheets[0] as ExcelJS.Worksheet
}

const text = (sheet: ExcelJS.Worksheet, addr: string): string => String(sheet.getCell(addr).value)

/** Every cell value of the sheet, in reading order. */
function allText(sheet: ExcelJS.Worksheet): string[] {
  const out: string[] = []
  sheet.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value))))
  return out
}

function expectPrintSetup(sheet: ExcelJS.Worksheet): void {
  expect(sheet.views[0]).toMatchObject({ rightToLeft: true, showGridLines: false })
  expect(sheet.pageSetup.paperSize).toBe(9) // A4
  expect(sheet.pageSetup.orientation).toBe('portrait')
  expect(sheet.pageSetup.fitToPage).toBe(true)
  expect(sheet.pageSetup.fitToWidth).toBe(1)
  expect(sheet.pageSetup.fitToHeight).toBe(0)
  expect(sheet.pageSetup.showGridLines).toBeFalsy()
}

describe('receipt print (إذن استلام)', () => {
  const receipt = receiptDoc()

  it('has the official header rows and the title', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expect(text(sheet, 'A1')).toBe('وزارة الصحة والسكان')
    expect(text(sheet, 'A2')).toBe('مديرية الشئون الصحية بالقليوبية')
    expect(text(sheet, 'A3')).toBe('مستشفى القناطر الخيرية')
    expect(text(sheet, 'A4')).toBe('إذن استلام — مخزن الشرائح والمسامير')
    expect(sheet.getCell('A1').font?.bold).toBe(true)
    expect(sheet.getCell('A4').alignment?.horizontal).toBe('center')
    expect(sheet.getCell('A4').font?.size).toBeGreaterThan(sheet.getCell('A1').font?.size ?? 0)
  })

  it('is right to left, A4 portrait, fit to one page wide, no gridlines, Arial', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expectPrintSetup(sheet)
    expect(sheet.getCell('A1').font?.name).toBe('Arial')
    expect(sheet.getCell('D10').font?.name).toBe('Arial')
  })

  it('shows the company, delivery note, invoice, date and status', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expect(text(sheet, 'A6')).toBe('الشركة: شركة الأمل')
    expect(text(sheet, 'E6')).toBe('رقم إذن التسليم: D-77/2')
    expect(text(sheet, 'I6')).toBe('رقم الفاتورة: INV-9')
    expect(text(sheet, 'A7')).toBe('التاريخ: 12/10/2026')
    expect(text(sheet, 'E7')).toBe('الحالة: معتمد 12/10/2026')
  })

  it('has the table header on row 9 and one row per line from row 10', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    RECEIPT_COLUMNS.forEach((header, i) => {
      expect(sheet.getRow(9).getCell(i + 1).value).toBe(header)
    })
    const first = sheet.getRow(10)
    expect(first.getCell(1).value).toBe(1)
    expect(first.getCell(2).value).toBe(12) // the item's page
    expect(first.getCell(3).value).toBe('SCR-01')
    expect(first.getCell(4).value).toBe('صنف SCR-01')
    expect(first.getCell(5).value).toBe('B-1')
    expect(first.getCell(6).value).toBe('03/2028')
    expect(first.getCell(7).value).toBe(10) // invoiced
    expect(first.getCell(8).value).toBe(8) // counted
    expect(first.getCell(9).value).toBe(125.5)
    expect(first.getCell(10).value).toBe(1004) // counted x price: 8 x 125.50
    expect(first.getCell(11).value).toBe('ناقص من المورد')
    expect(sheet.getRow(11).getCell(3).value).toBe('SCR-02')
    expect(sheet.getRow(11).getCell(10).value).toBe(200)
  })

  it('totals the counted quantity and value, using the receipt prices, not the live ones', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expect(sheet.getRow(12).getCell(1).value).toBe('الإجمالي')
    expect(sheet.getRow(12).getCell(8).value).toBe(12)
    expect(sheet.getRow(12).getCell(10).value).toBe(1204)
  })

  it('ends with three signature boxes two rows below the total', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expect(sheet.getRow(14).getCell(1).value).toBe('أمين المخزن')
    expect(sheet.getRow(14).getCell(5).value).toBe('مندوب الشركة')
    expect(sheet.getRow(14).getCell(9).value).toBe('يعتمد')
    for (const col of [1, 5, 9]) {
      expect(sheet.getRow(15).getCell(col).value).toBe('الاسم:')
      expect(sheet.getRow(16).getCell(col).value).toBe('التوقيع:')
      expect(sheet.getRow(17).getCell(col).value).toBe('التاريخ:')
    }
  })

  it('prints no ملغي banner for a posted receipt', async () => {
    const sheet = await reload(await receiptPrintFile({ receipt, items: ITEMS }))
    expect(allText(sheet).some((t) => t.includes('ملغي'))).toBe(false)
  })

  it('prints a red ملغي banner in row 4 and the reason in the status for a cancelled receipt', async () => {
    const cancelled = receiptDoc({
      status: 'cancelled',
      cancelledAt: ts(Date.UTC(2026, 9, 13, 8, 0)),
      cancelReason: 'استلام بالغلط',
    })
    const sheet = await reload(await receiptPrintFile({ receipt: cancelled, items: ITEMS }))
    expect(text(sheet, 'A4')).toBe('ملغي — إذن استلام — مخزن الشرائح والمسامير')
    expect(sheet.getCell('A4').font?.color?.argb).toBe('FFC62828')
    expect(sheet.getCell('A4').font?.bold).toBe(true)
    expect(text(sheet, 'E7')).toBe('الحالة: ملغي 13/10/2026 — استلام بالغلط')
    expectPrintSetup(sheet)
  })

  it('refuses to print a draft', () => {
    expect(() =>
      buildReceiptPrint({ receipt: receiptDoc({ status: 'draft' }), items: ITEMS }),
    ).toThrow(PrintError)
  })

  it('names the file after the delivery note, without characters Windows refuses', () => {
    expect(receiptPrintFileName(receipt)).toBe('استلام-D-77-2.xlsx')
    expect(safeFileName('a\\b/c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
    expect(safeFileName('   ')).toBe('ملف')
  })
})

describe('issue print (إذن صرف)', () => {
  const batch = issueDoc()
  const movements = issueMovements(batch)
  const input = { batch, items: ITEMS, movements }

  it('has the same header block, with the batch number in the title', async () => {
    const sheet = await reload(await issuePrintFile(input))
    expect(text(sheet, 'A1')).toBe('وزارة الصحة والسكان')
    expect(text(sheet, 'A3')).toBe('مستشفى القناطر الخيرية')
    expect(text(sheet, 'A4')).toBe('إذن صرف — دفعة 14')
    expectPrintSetup(sheet)
  })

  it('shows the rep, date, status and the permit numbers as a wrapped comma list', async () => {
    const sheet = await reload(await issuePrintFile(input))
    expect(text(sheet, 'A6')).toBe('المندوب: إيجي فيكس')
    expect(text(sheet, 'E6')).toBe('التاريخ: 12/10/2026')
    expect(text(sheet, 'G6')).toBe('الحالة: معتمد 12/10/2026')
    expect(text(sheet, 'A7')).toBe('أرقام الأذون: 1001, 1002')
    expect(sheet.getCell('A7').alignment?.wrapText).toBe(true)
  })

  it('has the nine table columns and prices each line from its posted movement', async () => {
    const sheet = await reload(await issuePrintFile(input))
    ISSUE_COLUMNS.forEach((header, i) => {
      expect(sheet.getRow(9).getCell(i + 1).value).toBe(header)
    })
    const first = sheet.getRow(10)
    expect([first.getCell(3).value, first.getCell(6).value]).toEqual(['SCR-01', 3])
    expect(first.getCell(5).value).toBe('B-1 · 03/2028')
    expect(first.getCell(7).value).toBe(125.5)
    expect(first.getCell(8).value).toBe(376.5)
    // The live price of SCR-02 is 9,999.99; the batch was posted at 50.00.
    expect(sheet.getRow(11).getCell(7).value).toBe(50)
    expect(sheet.getRow(11).getCell(8).value).toBe(150)
  })

  it('names the requested item in "بدل عن" for a substitute', async () => {
    const sheet = await reload(await issuePrintFile(input))
    expect(sheet.getRow(12).getCell(9).value).toBe('صنف SCR-01')
    expect(sheet.getRow(10).getCell(9).value).toBe('')
  })

  it('prints the stored totals: requested, issued and the difference', async () => {
    const sheet = await reload(await issuePrintFile(input))
    // Three lines (rows 10-12), a blank row, then the three totals.
    expect([sheet.getRow(14).getCell(1).value, sheet.getRow(14).getCell(5).value]).toEqual([
      'قيمة المطلوب',
      652,
    ])
    expect([sheet.getRow(15).getCell(1).value, sheet.getRow(15).getCell(5).value]).toEqual([
      'قيمة المصروف',
      576.5,
    ])
    expect(sheet.getRow(16).getCell(1).value).toBe('الفرق')
    expect(sheet.getRow(16).getCell(5).value).toBe(-75.5)
  })

  it('ends with two signature boxes', async () => {
    const sheet = await reload(await issuePrintFile(input))
    // A merged span reports its value from every cell, so look at distinct labels.
    const labels = new Set(allText(sheet).filter((t) => t === 'أمين المخزن' || t === 'المندوب'))
    expect([...labels]).toEqual(['أمين المخزن', 'المندوب'])
    expect(sheet.getRow(18).getCell(9).value).toBe('المندوب')
    expect(sheet.getRow(18).getCell(1).value).toBe('أمين المخزن')
    expect(sheet.getRow(18).getCell(6).value).toBe('المندوب')
  })

  it('prints a red ملغي banner for a cancelled batch', async () => {
    const cancelled = issueDoc({
      status: 'cancelled',
      cancelledAt: ts(Date.UTC(2026, 9, 13, 8, 0)),
      cancelReason: 'اتصرفت للمندوب الغلط',
    })
    const sheet = await reload(
      await issuePrintFile({
        batch: cancelled,
        items: ITEMS,
        movements: issueMovements(cancelled),
      }),
    )
    expect(text(sheet, 'A4')).toBe('ملغي — إذن صرف — دفعة 14')
    expect(sheet.getCell('A4').font?.color?.argb).toBe('FFC62828')
    expect(text(sheet, 'G6')).toContain('ملغي 13/10/2026')
  })

  it('refuses to print when a line has no movement (the price would be a guess)', () => {
    expect(() => buildIssuePrint({ batch, items: ITEMS, movements: movements.slice(1) })).toThrow(
      PrintError,
    )
  })

  it('names the file after the batch number', () => {
    expect(issuePrintFileName(batch)).toBe('صرف-دفعة-14.xlsx')
  })
})
