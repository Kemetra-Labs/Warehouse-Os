import type { LedgerView } from './deriveLedger'
import type { StockView } from '../domain/issueStock'

/**
 * The ledger as the issue rules see it. `batchBalancesFor` scans every movement, so each item is
 * worked out once per ledger version, however often the screen asks.
 */
export function cachedStock(view: Pick<LedgerView, 'batchBalancesFor'>): StockView {
  const cache = new Map<string, ReturnType<LedgerView['batchBalancesFor']>>()
  return {
    batches(itemCode) {
      const known = cache.get(itemCode)
      if (known) return known
      const fresh = view.batchBalancesFor(itemCode)
      cache.set(itemCode, fresh)
      return fresh
    },
  }
}
