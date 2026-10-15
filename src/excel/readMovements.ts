import type * as XLSX from 'xlsx'
import { MOVEMENT_TYPE_LIST, MOVEMENT_TYPES, type Movement } from '../domain/types'
import { cellAt, lastRow, normalizeHeader, numberOf, textOf, type CellValue } from './cells'
import { ImportError } from './errors'
import { remapBusinessDate, serialToIso } from './serial'
import type { ImportedItem, ImportedMovement } from './types'

export const MOVEMENTS_SHEET = 'سجل الحركات'
export const MOVEMENTS_HEADER_ROW = 4
export const MOVEMENTS_FIRST_ROW = 5

/** A4:R4, in order. Matched after whitespace normalisation (the table definition is invisible). */
export const MOVEMENT_HEADERS: readonly string[] = [
  'م',
  'مسلسل الصنف',
  'التاريخ',
  'نوع الحركة',
  'الكود',
  'الصنف',
  'الخامة / المواصفة',
  'الوحدة',
  'الكمية',
  'الأثر على الرصيد',
  'الشركة الموردة',
  'رقم الفاتورة / الإذن',
  'ملاحظات',
  'الرصيد الجاري بعد الحركة',
  'تحقق',
  'المرجع',
  'رقم التشغيلة',
  'تاريخ الانتهاء',
]

const COLUMNS = 'ABCDEFGHIJKLMNOPQR'.split('')
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const EXPIRY = /^\d{4}-\d{2}(-\d{2})?$/

export function checkMovementHeaders(ws: XLSX.WorkSheet): void {
  COLUMNS.forEach((col, i) => {
    const expected = MOVEMENT_HEADERS[i] ?? ''
    const found = normalizeHeader(cellAt(ws, col, MOVEMENTS_HEADER_ROW))
    if (found !== normalizeHeader(expected)) {
      throw new ImportError(
        'bad-header',
        `ترويسة "${MOVEMENTS_SHEET}" مش مطابقة في العمود ${col} (صف ${MOVEMENTS_HEADER_ROW}): المتوقع "${expected}" والموجود "${found}"`,
      )
    }
  })
}

export interface MovementsRead {
  readonly movements: ImportedMovement[]
  readonly warnings: string[]
  readonly remappedRows: number[]
  /** Rows whose quantity is 0: no balance effect, and the rules reject qty 0, so they are skipped. */
  readonly skippedZeroRows: number[]
}

function badRow(row: number, what: string): ImportError {
  return new ImportError('bad-row', `${MOVEMENTS_SHEET}، صف ${row}: ${what}`)
}

function dateOf(v: CellValue, row: number, date1904: boolean): string {
  if (typeof v === 'number') {
    const iso = serialToIso(v, date1904)
    if (iso !== null) return iso
  } else if (typeof v === 'string' && ISO_DATE.test(v.trim())) {
    return v.trim()
  }
  throw badRow(row, 'التاريخ غير صالح')
}

/** Expiry may be a date serial or text (`2027-03`, `2027-03-31`); anything else is dropped with a warning. */
function expiryOf(v: CellValue, row: number, date1904: boolean, warnings: string[]): string | null {
  if (v === null || v === '') return null
  const iso = typeof v === 'number' ? serialToIso(v, date1904) : (textOf(v) ?? '')
  // A year typed alone (2027) is a valid serial too, of a day in 1905: not a real expiry.
  const year = iso === null ? 0 : Number(iso.slice(0, 4))
  if (iso !== null && EXPIRY.test(iso) && year >= 2000 && year <= 2100) return iso
  warnings.push(`${MOVEMENTS_SHEET}، صف ${row}: تاريخ الانتهاء غير مفهوم واتتجاهل`)
  return null
}

function qtyOf(v: CellValue, type: Movement['type'], row: number): number {
  const qty = numberOf(v)
  if (qty === null || !Number.isInteger(qty) || qty === 0) throw badRow(row, 'الكمية غير صالحة')
  if (type !== MOVEMENT_TYPES.ADJUST && qty < 0) throw badRow(row, 'الكمية لازم تكون موجبة')
  return qty
}

function typeOf(v: CellValue, row: number): Movement['type'] {
  const type = textOf(v)
  const found = MOVEMENT_TYPE_LIST.find((t) => t === type)
  if (!found) throw badRow(row, `نوع الحركة "${type ?? ''}" غير معروف`)
  return found
}

/** Movements: one per row from row 5 where column E (الكود) is non-empty. */
export function readMovements(
  ws: XLSX.WorkSheet,
  items: readonly ImportedItem[],
  date1904: boolean,
): MovementsRead {
  const byCode = new Map(items.map((i) => [i.code, i]))
  const movements: ImportedMovement[] = []
  const warnings: string[] = []
  const remappedRows: number[] = []
  const skippedZeroRows: number[] = []
  const end = lastRow(ws)
  for (let row = MOVEMENTS_FIRST_ROW; row <= end; row += 1) {
    const code = textOf(cellAt(ws, 'E', row))
    if (code === null) continue
    const item = byCode.get(code)
    if (!item) throw badRow(row, `الكود ${code} مش موجود في القائمة الاساسية`)
    const name = textOf(cellAt(ws, 'F', row))
    if (name !== null && name !== item.nameAr) {
      warnings.push(`${MOVEMENTS_SHEET}، صف ${row}: اسم الصنف مختلف عن القائمة الاساسية (${code})`)
    }
    const type = typeOf(cellAt(ws, 'D', row), row)
    if (numberOf(cellAt(ws, 'I', row)) === 0) {
      skippedZeroRows.push(row)
      warnings.push(
        `${MOVEMENTS_SHEET}، صف ${row}: الكمية صفر، الحركة اتتجاهلت (مالهاش أثر على الرصيد)`,
      )
      continue
    }
    const { date, remapped } = remapBusinessDate(dateOf(cellAt(ws, 'C', row), row, date1904))
    if (remapped) remappedRows.push(row)
    movements.push({
      id: `imp-r${row}`,
      row,
      type,
      itemCode: code,
      qty: qtyOf(cellAt(ws, 'I', row), type, row),
      businessDate: date,
      supplier: textOf(cellAt(ws, 'K', row)),
      docNumber: textOf(cellAt(ws, 'L', row)),
      note: textOf(cellAt(ws, 'M', row)),
      reference: textOf(cellAt(ws, 'P', row)),
      batchNo: textOf(cellAt(ws, 'Q', row)),
      expiry: expiryOf(cellAt(ws, 'R', row), row, date1904, warnings),
    })
  }
  return { movements, warnings, remappedRows, skippedZeroRows }
}
