import ExcelJS from 'exceljs'
import { workbookBytes, type XlsxFile } from './bytes'
import {
  COL,
  LEDGER_WIDTH,
  ledgerPasteSteps,
  type LedgerExportPlan,
  type LedgerRow,
} from './ledgerPlan'
import { FONT, PAGE_SETUP, withArial } from './sheetSetup'

export const LEDGER_SHEET = 'سطور الحركات'
/** Column T: outside A-R, so the rows the user copies never include the steps. */
const NOTE_COLUMN = 20
const DATE_FORMAT = 'yyyy-mm-dd'
const WIDTHS = [6, 12, 14, 10, 12, 24, 16, 10, 10, 12, 20, 18, 34, 12, 8, 18, 16, 14]

const dateColumns: ReadonlySet<number> = new Set([COL.date, COL.expiry])

function writeRow(sheet: ExcelJS.Worksheet, rowNo: number, row: LedgerRow): void {
  const target = sheet.getRow(rowNo)
  row.forEach((value, index) => {
    // A null stays unset: an empty string would count as data and overwrite the table's formula.
    if (value === null) return
    const cell = target.getCell(index + 1)
    cell.value = value
    withArial(cell)
    if (dateColumns.has(index)) cell.numFmt = DATE_FORMAT
  })
}

function writeNote(sheet: ExcelJS.Worksheet, rowCount: number): void {
  sheet.getColumn(NOTE_COLUMN).width = 90
  const lines =
    rowCount === 0
      ? ['مفيش سطور جديدة للصق.']
      : [
          'خطوات اللصق (الأعمدة A إلى R بس هي اللي بتتنسخ)',
          ...ledgerPasteSteps(rowCount).map((step, i) => `${i + 1}. ${step}`),
        ]
  lines.forEach((line, i) => {
    const cell = sheet.getRow(i + 1).getCell(NOTE_COLUMN)
    cell.value = line
    cell.alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl' }
    cell.font = { name: FONT, bold: i === 0, color: { argb: i === 0 ? 'FF1F3A4D' : 'FF333333' } }
  })
}

/**
 * One sheet. Rows start at A1 with no header, columns A-R in the workbook's table order. The
 * formula columns and every empty input are left unset, so Paste Special -> Skip blanks leaves
 * the table's formulas alone. The steps sit in column T.
 */
export function buildLedgerWorkbook(plan: Pick<LedgerExportPlan, 'rows'>): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(LEDGER_SHEET, {
    views: [{ rightToLeft: true }],
    pageSetup: PAGE_SETUP,
  })
  WIDTHS.slice(0, LEDGER_WIDTH).forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })
  plan.rows.forEach((row, i) => writeRow(sheet, i + 1, row))
  writeNote(sheet, plan.rows.length)
  return workbook
}

export function ledgerFileName(plan: Pick<LedgerExportPlan, 'from' | 'to'>): string {
  return `سطور-الحركات-${plan.from ?? 'فاضي'}-${plan.to ?? 'فاضي'}.xlsx`
}

export async function ledgerFile(plan: LedgerExportPlan): Promise<XlsxFile> {
  return { fileName: ledgerFileName(plan), bytes: await workbookBytes(buildLedgerWorkbook(plan)) }
}
