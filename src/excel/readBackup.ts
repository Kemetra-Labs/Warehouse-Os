import * as XLSX from 'xlsx'
import { itemSchema, movementSchema, type Movement } from '../domain/types'
import { ITEM_COLUMNS, ITEMS_SHEET, MOVEMENT_COLUMNS, MOVEMENTS_SHEET } from './backup'
import { cellAt, lastRow, normalizeHeader, numberOf, textOf, type CellValue } from './cells'
import type { ImportedItem } from './types'

/** A movement as the backup keeps it: every stored field but the server's `postedAt`. */
export type BackupMovement = Omit<Movement, 'postedAt'> & { readonly id: string }

export interface BackupRead {
  readonly items: readonly ImportedItem[]
  readonly movements: readonly BackupMovement[]
  /** Everything wrong with the file, in Arabic. A backup with any error is not restored. */
  readonly errors: readonly string[]
}

const itemSchemaNoStamp = itemSchema.omit({ updatedAt: true })

/** Header text → column letter, from the first row of the sheet. */
function headerColumns(ws: XLSX.WorkSheet): Map<string, string> {
  const out = new Map<string, string>()
  const ref = ws['!ref']
  if (!ref) return out
  const range = XLSX.utils.decode_range(ref)
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const letter = XLSX.utils.encode_col(c)
    const name = normalizeHeader(cellAt(ws, letter, 1))
    if (name !== '' && !out.has(name)) out.set(name, letter)
  }
  return out
}

interface Sheet {
  /** The cell of a column by its header text; null when the column or the cell is missing. */
  get(header: string, row: number): CellValue
  readonly missing: readonly string[]
  readonly last: number
}

function openSheet(ws: XLSX.WorkSheet, headers: readonly string[]): Sheet {
  const cols = headerColumns(ws)
  return {
    get: (header, row) => {
      const letter = cols.get(header)
      return letter === undefined ? null : cellAt(ws, letter, row)
    },
    missing: headers.filter((h) => !cols.has(h)),
    last: lastRow(ws),
  }
}

const header = (columns: readonly { readonly header: string }[], at: number): string =>
  columns[at]?.header ?? ''

const ITEM_H = {
  code: header(ITEM_COLUMNS, 0),
  page: header(ITEM_COLUMNS, 1),
  category: header(ITEM_COLUMNS, 2),
  nameAr: header(ITEM_COLUMNS, 3),
  nameEn: header(ITEM_COLUMNS, 4),
  material: header(ITEM_COLUMNS, 5),
  size: header(ITEM_COLUMNS, 6),
  unit: header(ITEM_COLUMNS, 7),
  supplier: header(ITEM_COLUMNS, 8),
  gtins: header(ITEM_COLUMNS, 9),
  authorityCode: header(ITEM_COLUMNS, 10),
  priceMinor: header(ITEM_COLUMNS, 11),
  reorderManual: header(ITEM_COLUMNS, 13),
  active: header(ITEM_COLUMNS, 14),
}

const MOVE_H = {
  id: header(MOVEMENT_COLUMNS, 0),
  type: header(MOVEMENT_COLUMNS, 1),
  itemCode: header(MOVEMENT_COLUMNS, 2),
  qty: header(MOVEMENT_COLUMNS, 3),
  businessDate: header(MOVEMENT_COLUMNS, 4),
  priceMinor: header(MOVEMENT_COLUMNS, 6),
  batchNo: header(MOVEMENT_COLUMNS, 7),
  expiry: header(MOVEMENT_COLUMNS, 8),
  docNumber: header(MOVEMENT_COLUMNS, 9),
  reference: header(MOVEMENT_COLUMNS, 10),
  note: header(MOVEMENT_COLUMNS, 11),
  supplier: header(MOVEMENT_COLUMNS, 12),
  sourceKind: header(MOVEMENT_COLUMNS, 13),
  sourceId: header(MOVEMENT_COLUMNS, 14),
  sourceRow: header(MOVEMENT_COLUMNS, 15),
  subCode: header(MOVEMENT_COLUMNS, 16),
  subQty: header(MOVEMENT_COLUMNS, 17),
  reverses: header(MOVEMENT_COLUMNS, 18),
  reason: header(MOVEMENT_COLUMNS, 19),
  deviceId: header(MOVEMENT_COLUMNS, 20),
  createdBy: header(MOVEMENT_COLUMNS, 21),
}

const isBool = (v: CellValue): boolean | null =>
  typeof v === 'boolean'
    ? v
    : v === 'TRUE' || v === 'true'
      ? true
      : v === 'FALSE' || v === 'false'
        ? false
        : null

function firstIssue(error: {
  issues: readonly { path: PropertyKey[]; message: string }[]
}): string {
  const i = error.issues[0]
  return i ? `${i.path.map(String).join('.') || 'الصف'}: ${i.message}` : 'بيانات غير صالحة'
}

function readItems(ws: XLSX.WorkSheet, errors: string[]): ImportedItem[] {
  const sheet = openSheet(ws, Object.values(ITEM_H))
  if (sheet.missing.length > 0) {
    errors.push(`${ITEMS_SHEET}: أعمدة ناقصة (${sheet.missing.join('، ')})`)
    return []
  }
  const out: ImportedItem[] = []
  for (let row = 2; row <= sheet.last; row += 1) {
    const g = (h: string): CellValue => sheet.get(h, row)
    const code = textOf(g(ITEM_H.code))
    if (code === null) continue
    const gtins = (textOf(g(ITEM_H.gtins)) ?? '').split(/\s*,\s*/).filter((x) => x !== '')
    const active = g(ITEM_H.active)
    const parsed = itemSchemaNoStamp.safeParse({
      code,
      page: numberOf(g(ITEM_H.page)),
      category: textOf(g(ITEM_H.category)) ?? '',
      nameAr: textOf(g(ITEM_H.nameAr)) ?? '',
      nameEn: textOf(g(ITEM_H.nameEn)) ?? '',
      material: textOf(g(ITEM_H.material)) ?? '',
      size: textOf(g(ITEM_H.size)) ?? '',
      unit: textOf(g(ITEM_H.unit)) ?? 'قطعة',
      supplier: textOf(g(ITEM_H.supplier)) ?? '',
      gtins,
      authorityCode: textOf(g(ITEM_H.authorityCode)),
      priceMinor: numberOf(g(ITEM_H.priceMinor)),
      reorderManual: numberOf(g(ITEM_H.reorderManual)),
      active: isBool(active) ?? true,
    })
    if (parsed.success) out.push(parsed.data)
    else errors.push(`${ITEMS_SHEET}، صف ${row} (${code}): ${firstIssue(parsed.error)}`)
  }
  return out
}

function readMovements(ws: XLSX.WorkSheet, errors: string[]): BackupMovement[] {
  const sheet = openSheet(ws, Object.values(MOVE_H))
  if (sheet.missing.length > 0) {
    errors.push(`${MOVEMENTS_SHEET}: أعمدة ناقصة (${sheet.missing.join('، ')})`)
    return []
  }
  const out: BackupMovement[] = []
  for (let row = 2; row <= sheet.last; row += 1) {
    const g = (h: string): CellValue => sheet.get(h, row)
    const id = textOf(g(MOVE_H.id))
    if (id === null) continue
    const subCode = textOf(g(MOVE_H.subCode))
    const sourceRow = numberOf(g(MOVE_H.sourceRow))
    // `postedAt` is the server's: a placeholder passes the schema and is dropped again below.
    const parsed = movementSchema.safeParse({
      postedAt: {},
      type: textOf(g(MOVE_H.type)),
      itemCode: textOf(g(MOVE_H.itemCode)) ?? '',
      qty: numberOf(g(MOVE_H.qty)),
      businessDate: textOf(g(MOVE_H.businessDate)) ?? '',
      priceMinor: numberOf(g(MOVE_H.priceMinor)),
      batchNo: textOf(g(MOVE_H.batchNo)),
      expiry: textOf(g(MOVE_H.expiry)),
      docNumber: textOf(g(MOVE_H.docNumber)),
      reference: textOf(g(MOVE_H.reference)),
      note: textOf(g(MOVE_H.note)),
      supplier: textOf(g(MOVE_H.supplier)),
      source: {
        kind: textOf(g(MOVE_H.sourceKind)),
        id: textOf(g(MOVE_H.sourceId)),
        ...(sourceRow === null ? {} : { row: sourceRow }),
      },
      substituteFor:
        subCode === null ? null : { itemCode: subCode, qty: numberOf(g(MOVE_H.subQty)) },
      reverses: textOf(g(MOVE_H.reverses)),
      reason: textOf(g(MOVE_H.reason)),
      deviceId: textOf(g(MOVE_H.deviceId)) ?? '',
      createdBy: textOf(g(MOVE_H.createdBy)) ?? '',
    })
    if (parsed.success) {
      const movement: Partial<typeof parsed.data> = { ...parsed.data }
      delete movement.postedAt
      out.push({ ...(movement as Omit<Movement, 'postedAt'>), id })
    } else errors.push(`${MOVEMENTS_SHEET}، صف ${row} (${id}): ${firstIssue(parsed.error)}`)
  }
  return out
}

/** The rules' own checks on ids and reversals, so a bad file fails here and not halfway through. */
function checkLedger(
  items: readonly ImportedItem[],
  movements: readonly BackupMovement[],
  errors: string[],
): void {
  const codes = new Set<string>()
  for (const i of items) {
    if (codes.has(i.code)) errors.push(`${ITEMS_SHEET}: الكود ${i.code} مكرر`)
    codes.add(i.code)
  }
  const ids = new Set<string>()
  for (const m of movements) {
    if (ids.has(m.id)) errors.push(`${MOVEMENTS_SHEET}: المعرّف ${m.id} مكرر`)
    ids.add(m.id)
    if (!codes.has(m.itemCode))
      errors.push(`${MOVEMENTS_SHEET}، ${m.id}: الصنف ${m.itemCode} مش موجود في الأصناف`)
    const isRev = m.id.startsWith('rev-')
    if (isRev) {
      const ok =
        m.type === 'تسوية' &&
        m.reverses !== null &&
        m.id === `rev-${m.reverses}` &&
        (m.reason ?? '').trim() !== ''
      if (!ok) errors.push(`${MOVEMENTS_SHEET}، ${m.id}: حركة عكس غير سليمة`)
    } else if (m.reverses !== null) {
      errors.push(`${MOVEMENTS_SHEET}، ${m.id}: حركة عادية بتعكس حركة تانية`)
    }
  }
}

/**
 * Reads the items and the movements of a backup file (`نسخة-احتياطية-*.xlsx`). The documents
 * sheet is not read: the ledger (items and movements) is what the balances come from.
 */
export function readBackup(bytes: ArrayBuffer): BackupRead {
  const errors: string[] = []
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: false })
  } catch {
    return { items: [], movements: [], errors: ['الملف مش ملف إكسيل سليم'] }
  }
  const itemsWs = wb.Sheets[ITEMS_SHEET]
  const movesWs = wb.Sheets[MOVEMENTS_SHEET]
  if (!itemsWs || !movesWs) {
    const missing = [!itemsWs ? ITEMS_SHEET : null, !movesWs ? MOVEMENTS_SHEET : null]
    return {
      items: [],
      movements: [],
      errors: [`ده مش ملف نسخة احتياطية: الورقة ناقصة (${missing.filter(Boolean).join('، ')})`],
    }
  }
  const items = readItems(itemsWs, errors)
  const movements = readMovements(movesWs, errors)
  if (errors.length === 0) checkLedger(items, movements, errors)
  return { items, movements, errors }
}
