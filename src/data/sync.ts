import { useSyncExternalStore } from 'react'

export type SyncKind = 'synced' | 'pending' | 'failed'

export interface SyncState {
  readonly kind: SyncKind
  readonly count: number
}

/** Failed entries win over pending writes; both win over synced. */
export function deriveSyncState(pending: number, failed: number): SyncState {
  if (failed > 0) return { kind: 'failed', count: failed }
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
  let shown: SyncState = deriveSyncState(0, 0)
  let timer: ReturnType<typeof setTimeout> | null = null

  const raw = (): SyncState => {
    let pending = 0
    for (const n of pendingBySource.values()) pending += n
    return deriveSyncState(pending, failed)
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
    getState: () => shown,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** App-wide store, fed by the data provider. */
export const syncStore: SyncStore = createSyncStore()

export function useSyncState(store: SyncStore = syncStore): SyncState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
