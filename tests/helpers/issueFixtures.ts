import { batchBalances } from '../../src/domain/ledger'
import type { StockView } from '../../src/domain/issueStock'
import { newIssueDraft, type IssueDraft } from '../../src/domain/issue'
import { MOVEMENT_TYPES, type Item } from '../../src/domain/types'
import { item } from './receiptFixtures'

export const TODAY = '2026-10-12'

/** One stock row: `qty` of `code` in a batch, received (إضافة) unless `issued` is set. */
export interface StockRow {
  readonly code: string
  readonly qty: number
  readonly batchNo?: string | null
  readonly expiry?: string | null
  readonly issued?: boolean
}

/** A stock view over plain rows, derived with the same `batchBalances` the app uses. */
export function stockOf(rows: readonly StockRow[]): StockView {
  const movements = rows.map((r) => ({
    type: r.issued ? MOVEMENT_TYPES.ISSUE : MOVEMENT_TYPES.ADD,
    qty: r.qty,
    itemCode: r.code,
    batchNo: r.batchNo ?? null,
    expiry: r.expiry ?? null,
  }))
  return { batches: (code) => batchBalances(movements, code) }
}

export const priced = (code: string, priceMinor: number, over: Partial<Item> = {}): Item =>
  item(code, { priceMinor, category: 'cat-a', ...over })

export const draftOf = (over: Partial<IssueDraft> = {}): IssueDraft => ({
  ...newIssueDraft(14, TODAY),
  rep: 'إيجي فيكس',
  permits: ['1001'],
  ...over,
})
