import * as XLSX from 'xlsx'

export type CellValue = string | number | boolean | null

/**
 * Raw cached value of a cell (`v`), or null when empty. Rows are 1-based like Excel. An error
 * cell (#N/A, #DIV/0!, ...) gives its error text: SheetJS keeps a numeric error code in `v`,
 * which would otherwise read as a real quantity, price or balance.
 */
export function cellAt(ws: XLSX.WorkSheet, col: string, row: number): CellValue {
  const cell = ws[XLSX.utils.encode_cell({ c: XLSX.utils.decode_col(col), r: row - 1 })] as
    XLSX.CellObject | undefined
  if (cell?.t === 'e') return cell.w ?? '#ERROR'
  const v = cell?.v
  if (v === undefined || v === null) return null
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null
}

/** 1-based last row of the sheet's used range (0 for an empty sheet). */
export function lastRow(ws: XLSX.WorkSheet): number {
  const ref = ws['!ref']
  return ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0
}

/** Trimmed text. Numbers are converted without loss; empty or boolean becomes null. */
export function textOf(v: CellValue): string | null {
  if (typeof v === 'boolean' || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** A finite number from a numeric cell or a numeric string; otherwise null. */
export function numberOf(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Header comparison form: no bidi marks, whitespace and line breaks collapsed. */
export function normalizeHeader(v: CellValue): string {
  return String(v ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
}
