import { useMemo, useSyncExternalStore } from 'react'
import { useData } from './DataProvider'
import { deriveLedger, type LedgerView } from './deriveLedger'
import { getDeviceId } from './deviceId'
import { getSeenStore } from './seenStore'

export interface UseLedger extends LedgerView {
  /** Clears the "changed since seen" highlight for an item (call when it is opened). */
  markItemSeen(itemCode: string): void
}

const markItemSeen = (itemCode: string): void => getSeenStore().markSeen(itemCode)

/**
 * Memoised derived state (research R4). The pure combiner lives in deriveLedger.ts. The seen
 * state is one shared store, so every mounted screen drops a highlight the moment an item opens.
 */
export function useLedger(): UseLedger {
  const { items, movements, settings } = useData()
  const store = getSeenStore()
  const seen = useSyncExternalStore(store.subscribe, store.getState)
  const ownDeviceId = useMemo(() => getDeviceId(), [])

  const view = useMemo(
    () => deriveLedger({ items, movements, settings, seen, ownDeviceId }),
    [items, movements, settings, seen, ownDeviceId],
  )
  return useMemo(() => ({ ...view, markItemSeen }), [view])
}
