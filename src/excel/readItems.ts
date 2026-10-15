import type * as XLSX from 'xlsx'
import { toMinor } from '../domain/money'
import { itemSchema } from '../domain/types'
import { cellAt, lastRow, numberOf, textOf } from './cells'
import { ImportError } from './errors'
import type { ImportedItem, RejectedGtin } from './types'

export const ITEMS_FIRST_ROW = 5
const GTIN_PATTERN = /^(\d{8}|\d{13})$/
const NOT_SET = new Set(['غير محددة', '—', '-'])

const importedItemSchema = itemSchema.omit({ updatedAt: true })

export interface ItemsRead {
  readonly items: ImportedItem[]
  readonly rejectedGtins: RejectedGtin[]
  readonly openingBalances: Record<string, number>
}

function badRow(row: number, what: string): ImportError {
  return new ImportError('bad-row', `القائمة الاساسية، صف ${row}: ${what}`)
}

/** `غير محددة` and the em dash mean "not set"; the schema stores that as an empty string. */
function optionalText(v: string | null): string {
  return v === null || NOT_SET.has(v) ? '' : v
}

function priceMinorOf(ws: XLSX.WorkSheet, row: number): number {
  const raw = cellAt(ws, 'K', row)
  if (raw === null || raw === '') return 0
  const price = numberOf(raw)
  if (price === null || price < 0) throw badRow(row, 'سعر القطعة غير صالح')
  return toMinor(price)
}

/** `String(N)` when it has 8 or 13 digits (a numeric cell converts without loss). */
function gtinOf(ws: XLSX.WorkSheet, row: number, rejected: RejectedGtin[]): readonly string[] {
  const value = textOf(cellAt(ws, 'N', row))
  if (value === null) return []
  if (GTIN_PATTERN.test(value)) return [value]
  rejected.push({ row, value })
  return []
}

function readItemRow(ws: XLSX.WorkSheet, row: number, rejected: RejectedGtin[]): ImportedItem {
  const reorder = numberOf(cellAt(ws, 'R', row))
  const candidate = {
    code: textOf(cellAt(ws, 'C', row)) ?? '',
    page: numberOf(cellAt(ws, 'A', row)),
    category: textOf(cellAt(ws, 'B', row)) ?? '',
    nameAr: textOf(cellAt(ws, 'D', row)) ?? '',
    nameEn: textOf(cellAt(ws, 'E', row)) ?? '',
    material: optionalText(textOf(cellAt(ws, 'F', row))),
    size: optionalText(textOf(cellAt(ws, 'G', row))),
    unit: textOf(cellAt(ws, 'H', row)) ?? 'قطعة',
    supplier: textOf(cellAt(ws, 'M', row)) ?? '',
    gtins: gtinOf(ws, row, rejected),
    priceMinor: priceMinorOf(ws, row),
    reorderManual: reorder === null ? null : Math.round(reorder),
    active: textOf(cellAt(ws, 'P', row)) !== 'موقوف',
  }
  const parsed = importedItemSchema.safeParse(candidate)
  if (!parsed.success) {
    throw badRow(row, 'بيانات الصنف غير صالحة (الكود أو رقم الصفحة أو الفئة أو الاسم)')
  }
  return parsed.data
}

/** Items: header row 4, data from row 5 until column D is empty. */
export function readItems(ws: XLSX.WorkSheet): ItemsRead {
  const items: ImportedItem[] = []
  const rejectedGtins: RejectedGtin[] = []
  const openingBalances: Record<string, number> = {}
  const seen = new Set<string>()
  const end = lastRow(ws)
  for (let row = ITEMS_FIRST_ROW; row <= end; row += 1) {
    if (textOf(cellAt(ws, 'D', row)) === null) break
    const item = readItemRow(ws, row, rejectedGtins)
    if (seen.has(item.code)) {
      throw new ImportError(
        'duplicate-code',
        `القائمة الاساسية، صف ${row}: الكود ${item.code} متكرر`,
      )
    }
    seen.add(item.code)
    items.push(item)
    const opening = numberOf(cellAt(ws, 'I', row))
    if (opening !== null) openingBalances[item.code] = opening
  }
  if (items.length === 0) {
    throw new ImportError('no-items', 'القائمة الاساسية فاضية: مفيش أصناف تتستورد')
  }
  return { items, rejectedGtins, openingBalances }
}
