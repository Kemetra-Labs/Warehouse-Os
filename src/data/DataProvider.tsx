import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Item, Settings } from '../domain/types'
import { DEFAULT_SETTINGS } from './convert'
import type { MovementDoc } from './deriveLedger'
import type { DataError } from './listener'
import { createOutbox, type Outbox } from './outbox'
import { createPriceHealer } from './priceHeal'
import { startReconciling } from './reconcileAll'
import {
  reconcilePendingIssueBatches,
  reconcilePendingIssueCancels,
  subscribeIssueBatches,
  type IssueBatchDoc,
} from './repos/issues'
import { subscribeItems, updateItem } from './repos/items'
import { reconcilePendingManualMovements, subscribeMovements } from './repos/movements'
import {
  reconcilePendingReceiptCancels,
  reconcilePendingReceipts,
  subscribeReceipts,
  type ReceiptDoc,
} from './repos/receipts'
import { subscribeSettings } from './repos/settings'
import { syncStore } from './sync'

export type DataStatus = 'loading' | 'ready' | 'denied' | 'error'

export interface DataValue {
  readonly status: DataStatus
  readonly error: DataError | null
  readonly items: readonly Item[]
  readonly movements: readonly MovementDoc[]
  readonly settings: Settings
  /** Live receipts of every status; not part of the ready gate. */
  readonly receipts: readonly ReceiptDoc[]
  /** Live issue batches of every status; not part of the ready gate. */
  readonly issueBatches: readonly IssueBatchDoc[]
  /** True once the issue-batch listener has answered at least once (numbering waits for it). */
  readonly issueBatchesLoaded: boolean
  readonly outbox: Outbox
}

const DataContext = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData must be used inside <DataProvider>')
  return value
}

interface Loaded {
  items: boolean
  movements: boolean
  settings: boolean
}

interface Confirmed {
  items: boolean
  movements: boolean
}

function withConfirmed(state: Confirmed, key: keyof Confirmed, value: boolean): Confirmed {
  return state[key] === value ? state : { ...state, [key]: value }
}

/** One live listener per collection, fed into the sync store; the outbox feeds failures. */
export function DataProvider({ children }: { readonly children: ReactNode }) {
  const outbox = useMemo(() => createOutbox(), [])
  const [items, setItems] = useState<readonly Item[]>([])
  const [movements, setMovements] = useState<readonly MovementDoc[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [receipts, setReceipts] = useState<readonly ReceiptDoc[]>([])
  const [issueBatches, setIssueBatches] = useState<readonly IssueBatchDoc[]>([])
  const [issueBatchesLoaded, setIssueBatchesLoaded] = useState(false)
  const [loaded, setLoaded] = useState<Loaded>({ items: false, movements: false, settings: false })
  const [error, setError] = useState<DataError | null>(null)
  // Items and movements as the server last confirmed them (not from the cache, nothing waiting).
  const [confirmed, setConfirmed] = useState({ items: false, movements: false })

  useEffect(() => {
    const mark = (key: keyof Loaded): void => setLoaded((l) => (l[key] ? l : { ...l, [key]: true }))
    const fail = (e: DataError): void => setError((prev) => (prev?.kind === 'denied' ? prev : e))
    const offs = [
      subscribeItems({
        onData: (rows, meta) => {
          setItems(rows)
          setConfirmed((c) => withConfirmed(c, 'items', !meta.fromCache && meta.pendingCount === 0))
          syncStore.reportPending('items', meta.pendingCount)
          mark('items')
        },
        onError: fail,
      }),
      subscribeMovements({
        onData: (rows, meta) => {
          setMovements(rows)
          setConfirmed((c) =>
            withConfirmed(c, 'movements', !meta.fromCache && meta.pendingCount === 0),
          )
          syncStore.reportPending('movements', meta.pendingCount)
          mark('movements')
        },
        onError: fail,
      }),
      subscribeReceipts({
        onData: (rows, meta) => {
          setReceipts(rows)
          syncStore.reportPending('receipts', meta.pendingCount)
        },
        onError: fail,
      }),
      subscribeIssueBatches({
        onData: (rows, meta) => {
          setIssueBatches(rows)
          setIssueBatchesLoaded(true)
          syncStore.reportPending('issueBatches', meta.pendingCount)
        },
        onError: fail,
      }),
      subscribeSettings({
        onData: (s, meta) => {
          setSettings(s)
          syncStore.reportPending('settings', meta.pendingCount)
          mark('settings')
        },
        onError: fail,
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    // Posts, cancels, returns and adjustments that were pending when the app closed: re-attach,
    // then ask the server (R12). Offline the answer is "cannot tell yet": ask again when the
    // network is back, and show those as waiting meanwhile, not as synced.
    const stop = startReconciling(
      [
        () => reconcilePendingReceipts(outbox),
        () => reconcilePendingIssueBatches(outbox),
        () => reconcilePendingReceiptCancels(outbox),
        () => reconcilePendingIssueCancels(outbox),
        () => reconcilePendingManualMovements(outbox),
      ],
      {
        target: window,
        report: (unverified) => syncStore.reportPending('unverified', unverified),
      },
    )
    return () => {
      stop()
      syncStore.reportPending('unverified', 0)
    }
  }, [outbox])

  // The price follows the latest purchase. A receipt posted offline and synced late can put an
  // older purchase's price over a newer one; correct that, from a server-confirmed view only.
  const healPrices = useMemo(
    () =>
      createPriceHealer((h) => {
        updateItem(h.itemCode, { priceMinor: h.priceMinor }).catch(() => undefined)
      }),
    [],
  )
  useEffect(() => {
    healPrices(items, movements, confirmed.items && confirmed.movements)
  }, [healPrices, items, movements, confirmed])

  useEffect(() => {
    const refresh = (): void => {
      outbox
        .list()
        .then((rows) => syncStore.reportFailed(rows.filter((r) => r.status === 'failed').length))
        .catch(() => undefined) // IndexedDB blocked: the pill then ignores the outbox.
    }
    refresh()
    const off = outbox.subscribe(refresh)
    return () => {
      off()
      outbox.close()
    }
  }, [outbox])

  const value = useMemo<DataValue>(() => {
    const ready = loaded.items && loaded.movements && loaded.settings
    const status: DataStatus = error
      ? error.kind === 'denied'
        ? 'denied'
        : 'error'
      : ready
        ? 'ready'
        : 'loading'
    return {
      status,
      error,
      items,
      movements,
      settings,
      receipts,
      issueBatches,
      issueBatchesLoaded,
      outbox,
    }
  }, [
    loaded,
    error,
    items,
    movements,
    settings,
    receipts,
    issueBatches,
    issueBatchesLoaded,
    outbox,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
