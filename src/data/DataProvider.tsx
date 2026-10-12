import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Item, Settings } from '../domain/types'
import { DEFAULT_SETTINGS } from './convert'
import type { MovementDoc } from './deriveLedger'
import type { DataError } from './listener'
import { createOutbox, type Outbox } from './outbox'
import { subscribeItems } from './repos/items'
import { subscribeMovements } from './repos/movements'
import { reconcilePendingReceipts, subscribeReceipts, type ReceiptDoc } from './repos/receipts'
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

/** One live listener per collection, fed into the sync store; the outbox feeds failures. */
export function DataProvider({ children }: { readonly children: ReactNode }) {
  const outbox = useMemo(() => createOutbox(), [])
  const [items, setItems] = useState<readonly Item[]>([])
  const [movements, setMovements] = useState<readonly MovementDoc[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [receipts, setReceipts] = useState<readonly ReceiptDoc[]>([])
  const [loaded, setLoaded] = useState<Loaded>({ items: false, movements: false, settings: false })
  const [error, setError] = useState<DataError | null>(null)

  useEffect(() => {
    const mark = (key: keyof Loaded): void => setLoaded((l) => (l[key] ? l : { ...l, [key]: true }))
    const fail = (e: DataError): void => setError((prev) => (prev?.kind === 'denied' ? prev : e))
    const offs = [
      subscribeItems({
        onData: (rows, meta) => {
          setItems(rows)
          syncStore.reportPending('items', meta.pendingCount)
          mark('items')
        },
        onError: fail,
      }),
      subscribeMovements({
        onData: (rows, meta) => {
          setMovements(rows)
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
    // Receipt posts that were pending when the app closed: re-attach, then ask the server (R12).
    reconcilePendingReceipts(outbox).catch(() => undefined)
  }, [outbox])

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
    return { status, error, items, movements, settings, receipts, outbox }
  }, [loaded, error, items, movements, settings, receipts, outbox])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
