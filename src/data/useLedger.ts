import { useCallback, useMemo, useState } from 'react'
import { useData } from './DataProvider'
import { deriveLedger, type LedgerView } from './deriveLedger'
import { loadSeen, markSeen } from './seenStore'

export interface UseLedger extends LedgerView {
  /** Clears the "changed since seen" highlight for an item (call when its card opens). */
  markItemSeen(itemCode: string): void
}

/** Memoised derived state (research R4). The pure combiner lives in deriveLedger.ts. */
export function useLedger(): UseLedger {
  const { items, movements, settings } = useData()
  const [seen, setSeen] = useState(() => loadSeen())

  const view = useMemo(
    () => deriveLedger({ items, movements, settings, seen }),
    [items, movements, settings, seen],
  )
  const markItemSeen = useCallback(
    (itemCode: string) => setSeen((prev) => markSeen(prev, itemCode, Date.now())),
    [],
  )
  return useMemo(() => ({ ...view, markItemSeen }), [view, markItemSeen])
}
