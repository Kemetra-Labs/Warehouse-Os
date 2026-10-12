import * as XLSX from 'xlsx'
import { ITEM_CODE_PATTERN } from '../domain/types'
import { cellAt, lastRow, numberOf, textOf } from './cells'
import { ImportError } from './errors'
import { readItems } from './readItems'
import { checkMovementHeaders, MOVEMENTS_SHEET, readMovements } from './readMovements'
import type { CachedBalance, ImportResult } from './types'

export const ITEMS_SHEET = 'القائمة الاساسية'
export const BALANCES_SHEET = 'الأرصدة اللحظية'

function sheetOf(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const actual =
    wb.SheetNames.find((n) => n === name) ?? wb.SheetNames.find((n) => n.trim() === name)
  const ws = actual === undefined ? undefined : wb.Sheets[actual]
  if (!ws) {
    throw new ImportError(
      'missing-sheet',
      `الملف ناقصه الورقة "${name}". اتأكد إنه ملف المخزن الصح.`,
    )
  }
  return ws
}

function parseWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  // An .xlsx is a zip: reject anything else up front (SheetJS would read plain text as CSV).
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw unreadable()
  try {
    // cellDates:false keeps dates as serials; the date logic is integer arithmetic (no time zone).
    return XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: false })
  } catch {
    throw unreadable()
  }
}

function unreadable(): ImportError {
  return new ImportError('unreadable-file', 'مش قادر أقرا الملف. اتأكد إنه ملف إكسيل (.xlsx) سليم.')
}

/** Data rows are the ones whose column C holds an item code; no start row is assumed. */
function readCached(ws: XLSX.WorkSheet): CachedBalance[] {
  const out: CachedBalance[] = []
  const end = lastRow(ws)
  for (let row = 1; row <= end; row += 1) {
    const code = textOf(cellAt(ws, 'C', row))
    if (code === null || !ITEM_CODE_PATTERN.test(code)) continue
    out.push({
      code,
      row,
      balance: numberOf(cellAt(ws, 'L', row)),
      status: textOf(cellAt(ws, 'N', row)),
    })
  }
  return out
}

/**
 * Pure mapping of the user's workbook (contracts/excel-import.md). Throws an `ImportError`
 * with an Arabic message when a precondition fails; nothing is written anywhere.
 */
export function importWorkbook(buffer: ArrayBuffer): ImportResult {
  const wb = parseWorkbook(buffer)
  const itemsSheet = sheetOf(wb, ITEMS_SHEET)
  const movementsSheet = sheetOf(wb, MOVEMENTS_SHEET)
  const balancesSheet = sheetOf(wb, BALANCES_SHEET)
  checkMovementHeaders(movementsSheet)

  const date1904 = wb.Workbook?.WBProps?.date1904 === true
  const { items, rejectedGtins, openingBalances } = readItems(itemsSheet)
  const { movements, warnings, remappedRows, skippedZeroRows } = readMovements(
    movementsSheet,
    items,
    date1904,
  )
  const gtinCount = items.filter((i) => i.gtins.length > 0).length
  const allWarnings = [...warnings]
  for (const g of rejectedGtins) {
    allWarnings.push(`القائمة الاساسية، صف ${g.row}: باركود مرفوض "${g.value}" (مش 8 أو 13 رقم)`)
  }
  return {
    items,
    movements,
    warnings: allWarnings,
    gtinCount,
    rejectedGtins,
    remappedRows,
    skippedZeroRows,
    openingBalances,
    cached: readCached(balancesSheet),
  }
}
