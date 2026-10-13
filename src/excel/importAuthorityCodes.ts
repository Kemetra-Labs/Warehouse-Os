import * as XLSX from 'xlsx'
import { AUTHORITY_CODE_PATTERN } from '../domain/items'
import { normalizeArabic, normalizeDigits } from '../domain/search'
import { cellAt, lastRow, normalizeHeader, textOf, type CellValue } from './cells'
import { ImportError } from './errors'
import { parseWorkbook } from './importWorkbook'

/**
 * The owner-reviewed mapping file (FR-017): one sheet with the columns الكود (the item code),
 * كود الهيئة (the 8-9 digit authority code) and تأكيد (the owner's confirmation). Only confirmed
 * rows are applied. Nothing here writes: it plans the updates and says what it would skip.
 */
export const MAPPING_HEADERS = {
  itemCode: 'الكود',
  authorityCode: 'كود الهيئة',
  confirmed: 'تأكيد',
} as const

type Column = keyof typeof MAPPING_HEADERS

/** What counts as "confirmed" in the تأكيد column (compared after trimming and lower-casing). */
export const CONFIRM_MARKS = ['نعم', 'تم', 'أيوه', '✓', '✔', 'x', 'yes', 'y', 'true', '1', 'صح']
const CONFIRMED = new Set(CONFIRM_MARKS.map((m) => normalizeArabic(m)))

const HEADER_SCAN_ROWS = 20
const NO_CODE = '—'

export type RejectReason =
  'invalid-code' | 'duplicate-in-file' | 'held-by-other-item' | 'already-different'

export interface AuthorityUpdate {
  readonly itemCode: string
  readonly authorityCode: string
}

export interface AuthorityRejection {
  /** 1-based sheet row. */
  readonly row: number
  readonly itemCode: string
  readonly authorityCode: string | null
  readonly reason: RejectReason
  /** For `held-by-other-item`: the item that already has this authority code. */
  readonly heldBy?: string
}

export interface AuthorityImport {
  readonly updates: readonly AuthorityUpdate[]
  /** Confirmed rows whose item already holds exactly that code. */
  readonly unchanged: number
  readonly skippedUnconfirmed: number
  /** Confirmed item codes that are not items in the app, once each. */
  readonly unknownCodes: readonly string[]
  readonly rejected: readonly AuthorityRejection[]
}

export interface MappableItem {
  readonly code: string
  readonly authorityCode?: string | null | undefined
}

export interface MappingRow {
  readonly row: number
  readonly itemCode: string | null
  readonly authorityCode: string | null
  readonly confirmed: boolean
}

type Columns = Readonly<Record<Column, string>>

function isConfirmed(value: CellValue): boolean {
  if (typeof value === 'boolean') return value
  const text = textOf(value)
  return text !== null && CONFIRMED.has(normalizeArabic(text))
}

function headerColumns(ws: XLSX.WorkSheet, row: number, lastCol: number): Partial<Columns> {
  const found: Partial<Record<Column, string>> = {}
  for (let c = 0; c <= lastCol; c += 1) {
    const col = XLSX.utils.encode_col(c)
    const text = normalizeHeader(cellAt(ws, col, row))
    for (const key of Object.keys(MAPPING_HEADERS) as Column[]) {
      if (text === MAPPING_HEADERS[key] && found[key] === undefined) found[key] = col
    }
  }
  return found
}

function findHeader(ws: XLSX.WorkSheet): { row: number; cols: Columns } {
  const end = Math.min(lastRow(ws), HEADER_SCAN_ROWS)
  const lastCol = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.c : 0
  for (let row = 1; row <= end; row += 1) {
    const { itemCode, authorityCode, confirmed } = headerColumns(ws, row, lastCol)
    if (itemCode !== undefined && authorityCode !== undefined && confirmed !== undefined) {
      return { row, cols: { itemCode, authorityCode, confirmed } }
    }
  }
  throw new ImportError(
    'bad-header',
    'مش لاقي الأعمدة المطلوبة في الملف: "الكود" و"كود الهيئة" و"تأكيد". اتأكد إنه ملف المطابقة اللي اتراجع.',
  )
}

function readRows(ws: XLSX.WorkSheet): MappingRow[] {
  const { row: headerRow, cols } = findHeader(ws)
  const rows: MappingRow[] = []
  for (let row = headerRow + 1; row <= lastRow(ws); row += 1) {
    const itemCode = textOf(cellAt(ws, cols.itemCode, row))
    const authority = textOf(cellAt(ws, cols.authorityCode, row))
    const mark = cellAt(ws, cols.confirmed, row)
    if (itemCode === null && authority === null && textOf(mark) === null) continue
    rows.push({
      row,
      itemCode: itemCode === null ? null : normalizeDigits(itemCode).toUpperCase(),
      authorityCode: authority === null ? null : normalizeDigits(authority),
      confirmed: isConfirmed(mark),
    })
  }
  return rows
}

interface Candidate {
  readonly row: number
  readonly itemCode: string
  readonly authorityCode: string
}

/** The same item and code written twice is one candidate. */
function dedupe(list: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>()
  return list.filter((c) => {
    const key = `${c.itemCode}|${c.authorityCode}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type Key = 'itemCode' | 'authorityCode'

/** For each value of `key`, the distinct values of the other column it appears with. */
function groupBy(list: readonly Candidate[], key: Key): Map<string, Set<string>> {
  const other: Key = key === 'itemCode' ? 'authorityCode' : 'itemCode'
  const groups = new Map<string, Set<string>>()
  for (const c of list) {
    const set = groups.get(c[key]) ?? new Set<string>()
    set.add(c[other])
    groups.set(c[key], set)
  }
  return groups
}

/** Pure planning step: what the rows would do to `items`. */
export function planAuthorityImport(
  rows: readonly MappingRow[],
  items: readonly MappableItem[],
): AuthorityImport {
  const byCode = new Map(items.map((i) => [i.code, i]))
  const unknownCodes: string[] = []
  const rejected: AuthorityRejection[] = []
  const candidates: Candidate[] = []
  let skippedUnconfirmed = 0

  for (const r of rows) {
    if (!r.confirmed) {
      skippedUnconfirmed += 1
      continue
    }
    const itemCode = r.itemCode ?? NO_CODE
    if (!byCode.has(itemCode)) {
      if (!unknownCodes.includes(itemCode)) unknownCodes.push(itemCode)
    } else if (r.authorityCode === null || !AUTHORITY_CODE_PATTERN.test(r.authorityCode)) {
      rejected.push({
        row: r.row,
        itemCode,
        authorityCode: r.authorityCode,
        reason: 'invalid-code',
      })
    } else {
      candidates.push({ row: r.row, itemCode, authorityCode: r.authorityCode })
    }
  }

  const unique = dedupe(candidates)
  const codesOfItem = groupBy(unique, 'itemCode')
  const itemsOfCode = groupBy(unique, 'authorityCode')
  const updates: AuthorityUpdate[] = []
  let unchanged = 0

  for (const c of unique) {
    const reject = (reason: RejectReason, heldBy?: string): void => {
      rejected.push({
        row: c.row,
        itemCode: c.itemCode,
        authorityCode: c.authorityCode,
        reason,
        ...(heldBy === undefined ? {} : { heldBy }),
      })
    }
    const holder = items.find((i) => i.authorityCode === c.authorityCode && i.code !== c.itemCode)
    const current = byCode.get(c.itemCode)?.authorityCode ?? null
    if (
      (codesOfItem.get(c.itemCode)?.size ?? 0) > 1 ||
      (itemsOfCode.get(c.authorityCode)?.size ?? 0) > 1
    ) {
      reject('duplicate-in-file')
    } else if (holder) reject('held-by-other-item', holder.code)
    else if (current === c.authorityCode) unchanged += 1
    else if (current !== null) reject('already-different')
    else updates.push({ itemCode: c.itemCode, authorityCode: c.authorityCode })
  }

  return {
    updates,
    unchanged,
    skippedUnconfirmed,
    unknownCodes,
    rejected: [...rejected].sort((a, b) => a.row - b.row),
  }
}

/** Reads the first sheet of the file and plans the updates. Throws `ImportError` (Arabic). */
export function readAuthorityMapping(
  buffer: ArrayBuffer,
  items: readonly MappableItem[],
): AuthorityImport {
  const wb = parseWorkbook(buffer)
  const name = wb.SheetNames[0]
  const ws = name === undefined ? undefined : wb.Sheets[name]
  if (!ws) throw new ImportError('missing-sheet', 'الملف مفيهوش ورقة بيانات.')
  return planAuthorityImport(readRows(ws), items)
}
