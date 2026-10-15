import { useSyncExternalStore } from 'react'

export type SyncKind = 'synced' | 'pending' | 'failed'

export interface SyncState {
  readonly kind: SyncKind
  readonly count: number
}

/**
 * Failed entries win over pending writes; both win over synced. `rejected` counts writes the
 * server refused that never went through the outbox (draft autosave, item edit, settings).
 */
export function deriveSyncState(pending: number, failed: number, rejected = 0): SyncState {
  if (failed + rejected > 0) return { kind: 'failed', count: failed + rejected }
  if (pending > 0) return { kind: 'pending', count: pending }
  return { kind: 'synced', count: 0 }
}

export function syncLabel(state: SyncState): string {
  if (state.kind === 'failed') return 'فشل الإرسال'
  if (state.kind === 'pending') return `${state.count} مستنية النت`
  return 'متزامن'
}

export interface SyncStore {
  reportPending(source: string, count: number): void
  reportFailed(count: number): void
  /** The server refused a write that has no outbox entry. Stays until `clearRejected`. */
  reportRejected(): void
  clearRejected(): void
  /** Refused writes not yet dismissed. */
  rejectedCount(): number
  getState(): SyncState
  subscribe(listener: () => void): () => void
}

export interface SyncStoreOptions {
  /** How long "synced" is held back so rapid pending/synced flips do not flicker. */
  readonly debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 400

function same(a: SyncState, b: SyncState): boolean {
  return a.kind === b.kind && a.count === b.count
}

export function createSyncStore(options: SyncStoreOptions = {}): SyncStore {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const pendingBySource = new Map<string, number>()
  const listeners = new Set<() => void>()
  let failed = 0
  let rejected = 0
  let shown: SyncState = deriveSyncState(0, 0)
  let timer: ReturnType<typeof setTimeout> | null = null

  const raw = (): SyncState => {
    let pending = 0
    for (const n of pendingBySource.values()) pending += n
    return deriveSyncState(pending, failed, rejected)
  }

  const show = (next: SyncState): void => {
    if (same(next, shown)) return
    shown = next
    for (const l of [...listeners]) l()
  }

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const update = (): void => {
    const next = raw()
    if (next.kind !== 'synced') {
      clearTimer()
      show(next)
    } else if (shown.kind !== 'synced' && timer === null) {
      timer = setTimeout(() => {
        timer = null
        show(raw())
      }, debounceMs)
    }
  }

  return {
    reportPending(source, count) {
      pendingBySource.set(source, count)
      update()
    },
    reportFailed(count) {
      failed = count
      update()
    },
    reportRejected() {
      rejected += 1
      update()
    },
    clearRejected() {
      rejected = 0
      update()
    },
    rejectedCount: () => rejected,
    getState: () => shown,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** App-wide store, fed by the data provider. */
export const syncStore: SyncStore = createSyncStore()

/**
 * Passes a Firestore write through, and tells the sync pill when the server refuses it. Firestore
 * undoes a refused offline write locally, so without this the pill would turn green over a
 * change that is gone.
 */
export function watchWrite<T>(write: Promise<T>, store: SyncStore = syncStore): Promise<T> {
  write.catch(() => store.reportRejected())
  return write
}

export function useSyncState(store: SyncStore = syncStore): SyncState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
