import ExcelJS from 'exceljs'
import type { MovementDoc } from '../data/deriveLedger'
import { formatDay, formatExpiry } from '../domain/fieldInput'
import { postedTotals } from '../domain/issue'
import { fromMinor } from '../domain/money'
import type { IssueBatch, Item } from '../domain/types'
import { workbookBytes, type XlsxFile } from './bytes'
import {
  addHeaderBlock,
  addSignatureBlocks,
  addTableHeader,
  BOX,
  FIRST_LINE_ROW,
  INFO_ROW,
  MONEY_FORMAT,
  newPrintSheet,
  PrintError,
  put,
  putCell,
  putSpan,
  statusLine,
} from './printLayout'

export const ISSUE_COLUMNS = [
  'م',
  'ص',
  'الكود',
  'الصنف',
  'التشغيلة',
  'الكمية',
  'سعر الوحدة',
  'القيمة',
  'بدل عن',
] as const
const WIDTHS = [5, 5, 11, 32, 12, 9, 11, 12, 26]
const SIGNATURES = ['أمين المخزن', 'المندوب'] as const
const NUMBER = '0'
const PERMITS_PER_LINE = 70

export type PrintableBatch = IssueBatch & { readonly id: string }
type ItemInfo = Pick<Item, 'code' | 'nameAr' | 'page'>

export interface IssuePrintInput {
  readonly batch: PrintableBatch
  /** Only names and pages are read. */
  readonly items: readonly ItemInfo[]
  /** The movements, for the unit price each line was issued at (stored when it was posted). */
  readonly movements: readonly MovementDoc[]
}

/**
 * The unit price of every issued line, from its movement `{batchId}-L{n}`. An issue line stores
 * no price of its own, and a posted document never reads the item's live price (constitution II).
 */
function pricesOf(input: IssuePrintInput): ReadonlyMap<number, number> {
  const byId = new Map(input.movements.map((m) => [m.id, m]))
  const out = new Map<number, number>()
  for (const line of input.batch.issued) {
    const movement = byId.get(`${input.batch.id}-L${line.n}`)
    if (!movement) {
      throw new PrintError(
        'حركات الدفعة لسه ما اتحمّلتش، فالأسعار مش معروفة. استنى لحظة وجرّب تاني.',
      )
    }
    out.set(line.n, movement.priceMinor)
  }
  return out
}

function addInfoRows(sheet: ExcelJS.Worksheet, batch: PrintableBatch): void {
  const last = ISSUE_COLUMNS.length
  putSpan(sheet, INFO_ROW, 1, 4, `المندوب: ${batch.rep}`, { bold: true, wrap: true })
  putSpan(sheet, INFO_ROW, 5, 6, `التاريخ: ${formatDay(batch.businessDate)}`, { wrap: true })
  putSpan(sheet, INFO_ROW, 7, last, `الحالة: ${statusLine(batch)}`, { wrap: true })
  const permits = batch.permits.join(', ')
  putSpan(sheet, INFO_ROW + 1, 1, last, `أرقام الأذون: ${permits}`, { wrap: true })
  const wrapped = Math.max(1, Math.ceil(permits.length / PERMITS_PER_LINE))
  sheet.getRow(INFO_ROW + 1).height = 18 * wrapped
}

function addLines(
  sheet: ExcelJS.Worksheet,
  input: IssuePrintInput,
  prices: ReadonlyMap<number, number>,
): number {
  const byCode = new Map(input.items.map((i) => [i.code, i]))
  let row = FIRST_LINE_ROW
  for (const line of input.batch.issued) {
    const item = byCode.get(line.itemCode)
    const price = prices.get(line.n) ?? 0
    const requested = line.forItemCode === null ? undefined : byCode.get(line.forItemCode)
    putCell(sheet, row, 1, line.n, { format: NUMBER })
    putCell(sheet, row, 2, item?.page ?? null, { format: NUMBER })
    putCell(sheet, row, 3, line.itemCode)
    putCell(sheet, row, 4, item?.nameAr ?? '', { align: 'right', wrap: true })
    putCell(sheet, row, 5, [line.batchNo, formatExpiry(line.expiry)].filter(Boolean).join(' · '), {
      wrap: true,
    })
    putCell(sheet, row, 6, line.qty, { format: NUMBER })
    putCell(sheet, row, 7, fromMinor(price), { format: MONEY_FORMAT })
    putCell(sheet, row, 8, fromMinor(line.qty * price), { format: MONEY_FORMAT })
    putCell(
      sheet,
      row,
      9,
      line.forItemCode === null ? '' : (requested?.nameAr ?? line.forItemCode),
      {
        align: 'right',
        wrap: true,
      },
    )
    row += 1
  }
  return row
}

/** The stored totals: requested value, issued value, and the difference. */
function addTotals(sheet: ExcelJS.Worksheet, batch: PrintableBatch, startRow: number): number {
  const totals = postedTotals(batch)
  const rows: readonly (readonly [string, number])[] = [
    ['قيمة المطلوب', totals.requestedMinor],
    ['قيمة المصروف', totals.issuedMinor],
    ['الفرق', totals.differenceMinor],
  ]
  rows.forEach(([label, minor], i) => {
    const row = startRow + i
    putSpan(sheet, row, 1, 4, label, { bold: true, box: true })
    sheet.mergeCells(row, 5, row, 6)
    put(sheet, row, 5, fromMinor(minor), { bold: true, align: 'center' }).numFmt = MONEY_FORMAT
    sheet.getCell(row, 5).border = BOX
    sheet.getCell(row, 6).border = BOX
  })
  return startRow + rows.length
}

/** إذن صرف (contracts/excel-exports.md §2). Throws `PrintError` if a line's movement is missing. */
export function buildIssuePrint(input: IssuePrintInput): ExcelJS.Workbook {
  const { batch } = input
  const prices = pricesOf(input)
  const workbook = new ExcelJS.Workbook()
  const sheet = newPrintSheet(workbook, 'إذن صرف', WIDTHS)
  const columns = ISSUE_COLUMNS.length
  addHeaderBlock(sheet, columns, `إذن صرف — دفعة ${batch.number}`, batch.status === 'cancelled')
  addInfoRows(sheet, batch)
  addTableHeader(sheet, ISSUE_COLUMNS)
  const after = addLines(sheet, input, prices)
  const totalsEnd = addTotals(sheet, batch, after + 1)
  addSignatureBlocks(sheet, totalsEnd + 1, columns, SIGNATURES)
  return workbook
}

export function issuePrintFileName(batch: Pick<IssueBatch, 'number'>): string {
  return `صرف-دفعة-${batch.number}.xlsx`
}

export async function issuePrintFile(input: IssuePrintInput): Promise<XlsxFile> {
  return {
    fileName: issuePrintFileName(input.batch),
    bytes: await workbookBytes(buildIssuePrint(input)),
  }
}
