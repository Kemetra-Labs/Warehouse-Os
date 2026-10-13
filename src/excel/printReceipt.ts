import ExcelJS from 'exceljs'
import { formatDay, formatExpiry } from '../domain/fieldInput'
import { fromMinor } from '../domain/money'
import { lineValueMinor, receiptTotalMinor } from '../domain/receipt'
import type { Item, Receipt } from '../domain/types'
import { safeFileName, workbookBytes, type XlsxFile } from './bytes'
import {
  addHeaderBlock,
  addSignatureBlocks,
  addTableHeader,
  FIRST_LINE_ROW,
  INFO_ROW,
  MONEY_FORMAT,
  newPrintSheet,
  putCell,
  putSpan,
  statusLine,
  STORE_TITLE,
} from './printLayout'

export const RECEIPT_COLUMNS = [
  'م',
  'ص',
  'الكود',
  'الصنف',
  'التشغيلة',
  'الصلاحية',
  'الكمية بالفاتورة',
  'الكمية المستلمة',
  'سعر الوحدة',
  'القيمة',
  'ملاحظة الفرق',
] as const
const WIDTHS = [5, 5, 11, 30, 12, 11, 10, 10, 11, 12, 22]
const SIGNATURES = ['أمين المخزن', 'مندوب الشركة', 'يعتمد'] as const

export type PrintableReceipt = Receipt & { readonly id: string }

export interface ReceiptPrintInput {
  readonly receipt: PrintableReceipt
  /** Only the name and page of each item are read; prices come from the receipt's own lines. */
  readonly items: readonly Pick<Item, 'code' | 'nameAr' | 'page'>[]
}

const NUMBER = '0'

function addInfoRows(sheet: ExcelJS.Worksheet, receipt: PrintableReceipt): void {
  const last = RECEIPT_COLUMNS.length
  putSpan(sheet, INFO_ROW, 1, 4, `الشركة: ${receipt.supplier}`, { bold: true, wrap: true })
  putSpan(sheet, INFO_ROW, 5, 8, `رقم إذن التسليم: ${receipt.deliveryNo}`, { wrap: true })
  putSpan(sheet, INFO_ROW, 9, last, `رقم الفاتورة: ${receipt.invoiceNo}`, { wrap: true })
  putSpan(sheet, INFO_ROW + 1, 1, 4, `التاريخ: ${formatDay(receipt.businessDate)}`)
  putSpan(sheet, INFO_ROW + 1, 5, last, `الحالة: ${statusLine(receipt)}`, { wrap: true })
}

function addLines(
  sheet: ExcelJS.Worksheet,
  receipt: PrintableReceipt,
  byCode: ReadonlyMap<string, Pick<Item, 'nameAr' | 'page'>>,
): number {
  let row = FIRST_LINE_ROW
  for (const line of receipt.lines) {
    const item = line.itemCode === null ? undefined : byCode.get(line.itemCode)
    putCell(sheet, row, 1, line.n, { format: NUMBER })
    putCell(sheet, row, 2, item?.page ?? null, { format: NUMBER })
    putCell(sheet, row, 3, line.itemCode ?? '')
    putCell(sheet, row, 4, item?.nameAr ?? '', { align: 'right', wrap: true })
    putCell(sheet, row, 5, line.batchNo ?? '')
    putCell(sheet, row, 6, formatExpiry(line.expiry))
    putCell(sheet, row, 7, line.invoicedQty, { format: NUMBER })
    putCell(sheet, row, 8, line.countedQty, { format: NUMBER })
    putCell(sheet, row, 9, fromMinor(line.priceMinor), { format: MONEY_FORMAT })
    putCell(sheet, row, 10, fromMinor(lineValueMinor(line)), { format: MONEY_FORMAT })
    putCell(sheet, row, 11, line.diffReason ?? '', { align: 'right', wrap: true })
    row += 1
  }
  return row
}

function addTotals(sheet: ExcelJS.Worksheet, receipt: PrintableReceipt, row: number): void {
  const counted = receipt.lines.reduce((sum, l) => sum + l.countedQty, 0)
  putSpan(sheet, row, 1, 7, 'الإجمالي', { bold: true, align: 'center', box: true })
  putCell(sheet, row, 8, counted, { bold: true, format: NUMBER })
  putCell(sheet, row, 9, '')
  putCell(sheet, row, 10, fromMinor(receiptTotalMinor(receipt.lines)), {
    bold: true,
    format: MONEY_FORMAT,
  })
  putCell(sheet, row, 11, '')
}

/** إذن استلام (contracts/excel-exports.md §1): counted quantity times the unit price. */
export function buildReceiptPrint(input: ReceiptPrintInput): ExcelJS.Workbook {
  const { receipt } = input
  const byCode = new Map(input.items.map((i) => [i.code, i]))
  const workbook = new ExcelJS.Workbook()
  const sheet = newPrintSheet(workbook, 'إذن استلام', WIDTHS)
  const columns = RECEIPT_COLUMNS.length
  addHeaderBlock(sheet, columns, `إذن استلام — ${STORE_TITLE}`, receipt.status === 'cancelled')
  addInfoRows(sheet, receipt)
  addTableHeader(sheet, RECEIPT_COLUMNS)
  const after = addLines(sheet, receipt, byCode)
  addTotals(sheet, receipt, after)
  addSignatureBlocks(sheet, after + 2, columns, SIGNATURES)
  return workbook
}

export function receiptPrintFileName(receipt: Pick<Receipt, 'deliveryNo'>): string {
  return `${safeFileName(`استلام-${receipt.deliveryNo.trim()}`)}.xlsx`
}

export async function receiptPrintFile(input: ReceiptPrintInput): Promise<XlsxFile> {
  return {
    fileName: receiptPrintFileName(input.receipt),
    bytes: await workbookBytes(buildReceiptPrint(input)),
  }
}
