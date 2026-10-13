import { toMillis } from '../data/convert'
import type { MovementDoc } from '../data/deriveLedger'
import { expiryEndDay } from '../domain/dates'

/** The workbook's table "الحركات" holds data rows 5-595 (contracts/excel-import.md). */
export const LEDGER_FIRST_ROW = 5
export const LEDGER_LAST_ROW = 595
export const LEDGER_CAPACITY = LEDGER_LAST_ROW - LEDGER_FIRST_ROW + 1

/** Columns A-R of the table, 0-based. The formula columns are never filled (research R8). */
export const LEDGER_WIDTH = 18
export const COL = {
  date: 2, // C
  type: 3, // D
  code: 4, // E
  qty: 8, // I
  supplier: 10, // K
  docNumber: 11, // L
  note: 12, // M
  reference: 15, // P
  batchNo: 16, // Q
  expiry: 17, // R
} as const

/** A cell to write; null means "leave it truly empty" so Skip blanks keeps the table's formula. */
export type LedgerCell = string | number | Date | null
export type LedgerRow = readonly LedgerCell[]

export type NameOf = (itemCode: string) => string | null

/** `YYYY-MM-DD` -> a UTC-midnight Date, so no time zone can shift the day. Null if malformed. */
export function dateFromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The movements to paste: not imported (they are already in the workbook) and not recorded as
 * exported, by business date, then posting time, then id (so ties always come out the same).
 */
export function selectExportable(
  movements: readonly MovementDoc[],
  exportedIds: readonly string[],
): MovementDoc[] {
  const done = new Set(exportedIds)
  return movements
    .filter((m) => m.source.kind !== 'import' && !done.has(m.id))
    .sort(
      (a, b) =>
        a.businessDate.localeCompare(b.businessDate) ||
        toMillis(a.postedAt) - toMillis(b.postedAt) ||
        a.id.localeCompare(b.id),
    )
}

const text = (value: string | null): string | null =>
  value === null || value.trim() === '' ? null : value

/**
 * Column M: the note, the substitute text `بدل {name}` and the reason. An issue movement already
 * keeps `بدل {code}` as its note; that form is dropped so the substitute is written once.
 */
export function noteText(m: MovementDoc, nameOf: NameOf): string | null {
  const sub = m.substituteFor
  const note = sub !== null && m.note === `بدل ${sub.itemCode}` ? null : text(m.note)
  const parts = [
    note,
    sub === null ? null : `بدل ${nameOf(sub.itemCode) ?? sub.itemCode}`,
    text(m.reason),
  ]
  const joined = parts.filter((p): p is string => p !== null).join(' - ')
  return joined === '' ? null : joined
}

/** One row of A-R: only the input columns are set. A signed تسوية keeps its negative quantity. */
export function ledgerRowOf(m: MovementDoc, nameOf: NameOf): LedgerRow {
  const row: LedgerCell[] = Array.from({ length: LEDGER_WIDTH }, () => null)
  row[COL.date] = dateFromIso(m.businessDate)
  row[COL.type] = m.type
  row[COL.code] = m.itemCode
  row[COL.qty] = m.qty
  row[COL.supplier] = text(m.supplier)
  row[COL.docNumber] = text(m.docNumber)
  row[COL.note] = noteText(m, nameOf)
  row[COL.reference] = text(m.reference)
  row[COL.batchNo] = text(m.batchNo)
  // A month-only expiry becomes the last day of that month, the day it covers until.
  const expiry = m.expiry === null ? null : expiryEndDay(m.expiry)
  row[COL.expiry] = expiry === null ? null : dateFromIso(expiry)
  return row
}

/**
 * Rows the workbook's table already uses, as far as the app can know. Imported rows keep their
 * workbook row (zero-quantity rows are skipped by the import but still occupy a row), and every
 * exported id is assumed pasted.
 */
export function usedLedgerRows(movements: readonly MovementDoc[], exportedCount: number): number {
  const imported = movements.filter((m) => m.source.kind === 'import')
  const lastRow = imported.reduce((max, m) => Math.max(max, m.source.row ?? 0), 0)
  const importedRows = lastRow > 0 ? lastRow - (LEDGER_FIRST_ROW - 1) : imported.length
  return Math.max(0, importedRows) + exportedCount
}

export interface CapacityCheck {
  readonly free: number
  readonly over: boolean
  readonly warning: string | null
}

/** Warns when `usedRows + newRows` runs past the table's last data row (595). */
export function capacityCheck(usedRows: number, newRows: number): CapacityCheck {
  const free = Math.max(0, LEDGER_CAPACITY - usedRows)
  const over = usedRows + newRows > LEDGER_CAPACITY
  return {
    free,
    over,
    warning: over
      ? `جدول الحركات في الإكسيل فاضل فيه ${free} صف بس من ${LEDGER_CAPACITY} (لحد الصف ${LEDGER_LAST_ROW})، والسطور الجديدة ${newRows}. كبّر الجدول الأول قبل اللصق.`
      : null,
  }
}

export interface LedgerExportPlan {
  readonly movements: readonly MovementDoc[]
  readonly rows: readonly LedgerRow[]
  /** The ids that go into `lastLedgerExportedIds` once the user confirms the paste. */
  readonly ids: readonly string[]
  /** First and last business date of the rows; null when there are none. */
  readonly from: string | null
  readonly to: string | null
  readonly capacity: CapacityCheck
}

export function planLedgerExport(
  movements: readonly MovementDoc[],
  exportedIds: readonly string[],
  nameOf: NameOf,
): LedgerExportPlan {
  const picked = selectExportable(movements, exportedIds)
  return {
    movements: picked,
    rows: picked.map((m) => ledgerRowOf(m, nameOf)),
    ids: picked.map((m) => m.id),
    from: picked.at(0)?.businessDate ?? null,
    to: picked.at(-1)?.businessDate ?? null,
    capacity: capacityCheck(usedLedgerRows(movements, exportedIds.length), picked.length),
  }
}

/** The numbered steps, shown in the app and written beside the rows in the file. */
export function ledgerPasteSteps(rowCount: number): readonly string[] {
  const range = `A1:R${Math.max(1, rowCount)}`
  return [
    'اشتغل على نسخة من ملف المخزن، مش على الأصل.',
    `افتح الملف اللي نزل، واكتب ${range} في مربع الاسم (فوق العمود A) واضغط Enter عشان تحدد السطور.`,
    'انسخها (Ctrl+C).',
    'في النسخة، روح لجدول الحركات (سجل الحركات) وقف على العمود A في أول صف فاضي.',
    'Paste Special (Ctrl+Alt+V) ثم اختار Skip blanks (تخطي الفراغات) ثم OK.',
    'اتأكد إن الأعمدة المحسوبة اتحسبت والأرصدة زي التطبيق، وبعدين ارجع هنا واضغط «تم اللصق».',
  ]
}
