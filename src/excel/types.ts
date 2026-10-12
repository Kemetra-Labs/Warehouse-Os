import type { Item, Movement } from '../domain/types'

/** An item as read from the workbook; the server stamps `updatedAt` on write. */
export type ImportedItem = Omit<Item, 'updatedAt'>

/** A movement's input columns. The writer adds price, source, author, device and `postedAt`. */
export interface ImportedMovement extends Pick<
  Movement,
  | 'type'
  | 'itemCode'
  | 'qty'
  | 'businessDate'
  | 'batchNo'
  | 'expiry'
  | 'docNumber'
  | 'reference'
  | 'note'
  | 'supplier'
> {
  /** `imp-r{row}` */
  readonly id: string
  /** 1-based workbook row of "سجل الحركات". */
  readonly row: number
}

/** A row of "الأرصدة اللحظية": the workbook's cached balance (L) and status (N). */
export interface CachedBalance {
  readonly code: string
  readonly row: number
  readonly balance: number | null
  readonly status: string | null
}

export interface RejectedGtin {
  readonly row: number
  readonly value: string
}

export interface ImportResult {
  readonly items: readonly ImportedItem[]
  readonly movements: readonly ImportedMovement[]
  readonly warnings: readonly string[]
  /** Items that received a GTIN (47 on the current workbook). */
  readonly gtinCount: number
  readonly rejectedGtins: readonly RejectedGtin[]
  /** Workbook rows whose date 2026-01-08 was remapped to 2026-08-01 (FR-005). */
  readonly remappedRows: readonly number[]
  /** Ledger rows with quantity 0, skipped with a warning (contracts/excel-import.md). */
  readonly skippedZeroRows: readonly number[]
  /** Column I of the item sheet, kept for the parity report only (FR-002). */
  readonly openingBalances: Readonly<Record<string, number>>
  readonly cached: readonly CachedBalance[]
}
