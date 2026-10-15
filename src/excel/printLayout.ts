import ExcelJS from 'exceljs'
import { HOSPITAL_NAME, STORE_NAME } from '../app/nav'
import { toMillis } from '../data/convert'
import { cairoToday } from '../domain/dates'
import { formatDay } from '../domain/fieldInput'
import { FONT, PAGE_SETUP } from './sheetSetup'

/** The official header block (contracts/excel-exports.md §1), rows 1-3. */
export const HEADER_LINES: readonly string[] = [
  'وزارة الصحة والسكان',
  'مديرية الشئون الصحية بالقليوبية',
  HOSPITAL_NAME,
]
export const STORE_TITLE = STORE_NAME

/** Row numbers every print file shares. */
export const TITLE_ROW = 4
export const INFO_ROW = 6
export const TABLE_HEADER_ROW = 9
export const FIRST_LINE_ROW = 10

export const MONEY_FORMAT = '#,##0.00'
const RED = 'FFC62828'
const INK = 'FF1F2933'

const THIN = { style: 'thin', color: { argb: 'FF444444' } } as const
export const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN } as const

export interface TextStyle {
  readonly bold?: boolean
  readonly size?: number
  readonly color?: string
  readonly align?: 'right' | 'center' | 'left'
  readonly wrap?: boolean
  readonly fill?: string
}

/** Writes a value with the file's font, reading order and alignment. */
export function put(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  style: TextStyle = {},
): ExcelJS.Cell {
  const cell = sheet.getCell(row, col)
  cell.value = value
  cell.font = {
    name: FONT,
    size: style.size ?? 11,
    bold: style.bold ?? false,
    color: { argb: style.color ?? INK },
  }
  cell.alignment = {
    horizontal: style.align ?? 'right',
    vertical: 'middle',
    wrapText: style.wrap ?? false,
    readingOrder: 'rtl',
  }
  if (style.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
  return cell
}

/** A merged span of columns on one row, boxed or not, with one value. */
export function putSpan(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  value: ExcelJS.CellValue,
  style: TextStyle & { readonly box?: boolean } = {},
): void {
  if (to > from) sheet.mergeCells(row, from, row, to)
  put(sheet, row, from, value, style)
  if (style.box) {
    for (let col = from; col <= to; col += 1) sheet.getCell(row, col).border = BOX
  }
  if (style.wrap && typeof value === 'string') fitWrappedSpan(sheet, row, from, to, value, style)
}

/** Points per printed line of wrapped text, at the default 11pt. */
const LINE_HEIGHT_PT = 15

/**
 * Excel never grows a row to fit a wrapped merged cell, so a long cancel reason or name would
 * print only its first line. Grows the row to the lines the text needs (a column width unit is
 * about one character); a span that fits on one line keeps the row as it is.
 */
function fitWrappedSpan(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  text: string,
  style: TextStyle,
): void {
  let width = 0
  for (let col = from; col <= to; col += 1) width += sheet.getColumn(col).width ?? 9
  const lines = Math.ceil(text.length / Math.max(1, Math.floor(width)))
  if (lines <= 1) return
  const height = lines * LINE_HEIGHT_PT * ((style.size ?? 11) / 11)
  const current = sheet.getRow(row).height
  if (current === undefined || current < height) sheet.getRow(row).height = height
}

/** An RTL, A4 portrait, fit-to-one-page-wide sheet with gridlines off (on screen and printed). */
export function newPrintSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  widths: readonly number[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: PAGE_SETUP,
  })
  widths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })
  return sheet
}

/**
 * Rows 1-3 (ministry, directorate, hospital, right-aligned and bold) and row 4 (the title,
 * centred and larger). A cancelled document prints a red ملغي banner in row 4 instead.
 */
export function addHeaderBlock(
  sheet: ExcelJS.Worksheet,
  columns: number,
  title: string,
  cancelled: boolean,
): void {
  HEADER_LINES.forEach((line, i) =>
    putSpan(sheet, i + 1, 1, columns, line, { bold: true, size: 12 }),
  )
  putSpan(sheet, TITLE_ROW, 1, columns, cancelled ? `ملغي — ${title}` : title, {
    bold: true,
    size: cancelled ? 18 : 16,
    align: 'center',
    color: cancelled ? RED : INK,
    fill: cancelled ? 'FFFDECEA' : undefined,
  })
  sheet.getRow(TITLE_ROW).height = 30
}

/** Splits `columns` into `parts` consecutive spans of nearly equal width. */
export function spansOf(columns: number, parts: number): readonly (readonly [number, number])[] {
  const size = Math.ceil(columns / parts)
  return Array.from({ length: parts }, (_, i): readonly [number, number] => [
    i * size + 1,
    Math.min(columns, (i + 1) * size),
  ]).filter(([from]) => from <= columns)
}

/** The table header: bold, boxed, shaded, repeated on every printed page. */
export function addTableHeader(
  sheet: ExcelJS.Worksheet,
  headers: readonly string[],
  row: number = TABLE_HEADER_ROW,
): void {
  headers.forEach((header, i) => {
    const cell = put(sheet, row, i + 1, header, {
      bold: true,
      align: 'center',
      wrap: true,
      fill: 'FFE8EEF2',
    })
    cell.border = BOX
  })
  sheet.getRow(row).height = 32
  sheet.pageSetup.printTitlesRow = `${row}:${row}`
}

/** A boxed table cell. */
export function putCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  style: TextStyle & { readonly format?: string } = {},
): void {
  const cell = put(sheet, row, col, value, { align: 'center', ...style })
  cell.border = BOX
  if (style.format) cell.numFmt = style.format
}

const SIGN_LINES = ['الاسم:', 'التوقيع:', 'التاريخ:'] as const

/**
 * Signature boxes side by side, first label at the right: a heading, then a name, signature and
 * date line each. Returns the next free row.
 */
export function addSignatureBlocks(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  columns: number,
  labels: readonly string[],
): number {
  const spans = spansOf(columns, labels.length)
  spans.forEach(([from, to], i) => {
    putSpan(sheet, startRow, from, to, labels[i] ?? '', {
      bold: true,
      align: 'center',
      box: true,
      fill: 'FFE8EEF2',
    })
    SIGN_LINES.forEach((line, j) => putSpan(sheet, startRow + 1 + j, from, to, line, { box: true }))
  })
  SIGN_LINES.forEach((_, j) => {
    sheet.getRow(startRow + 1 + j).height = 26
  })
  return startRow + 1 + SIGN_LINES.length
}

export class PrintError extends Error {}

interface StatusSource {
  readonly status: 'draft' | 'posted' | 'cancelled'
  readonly businessDate: string
  readonly postedAt: unknown
  readonly cancelledAt: unknown
  readonly cancelReason: string | null
}

const dayOf = (at: unknown, fallback: string): string => {
  const ms = toMillis(at)
  return ms > 0 ? cairoToday(new Date(ms)) : fallback
}

/** `معتمد 12/10/2026`, or `ملغي 13/10/2026 — السبب`. A draft has no print. */
export function statusLine(doc: StatusSource): string {
  if (doc.status === 'draft') throw new PrintError('المسودة ما بتتطبعش. اعتمد المستند الأول.')
  if (doc.status === 'posted') return `معتمد ${formatDay(dayOf(doc.postedAt, doc.businessDate))}`
  const reason = doc.cancelReason?.trim() ? ` — ${doc.cancelReason.trim()}` : ''
  return `ملغي ${formatDay(dayOf(doc.cancelledAt, doc.businessDate))}${reason}`
}
