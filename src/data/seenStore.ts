/** Device-local "seen at" per item (research R4, FR-072). Never throws if storage is blocked. */

export interface SeenState {
  /** Changes older than this are considered seen (the device's first-run time). */
  readonly baseline: number
  readonly byItem: Readonly<Record<string, number>>
}

const KEY = 'warehouse.seen.v1'

export function emptySeen(baseline: number): SeenState {
  return { baseline, byItem: {} }
}

function isSeenState(v: unknown): v is SeenState {
  if (typeof v !== 'object' || v === null) return false
  const o = v as { baseline?: unknown; byItem?: unknown }
  return typeof o.baseline === 'number' && typeof o.byItem === 'object' && o.byItem !== null
}

export function saveSeen(state: SeenState, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage can be blocked (private window); the highlight then resets per session.
  }
}

export function loadSeen(storage: Storage = localStorage, now: () => number = Date.now): SeenState {
  try {
    const raw = storage.getItem(KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (isSeenState(parsed)) return parsed
    }
  } catch {
    // Corrupt or unavailable: fall through to a fresh state.
  }
  const fresh = emptySeen(now())
  saveSeen(fresh, storage)
  return fresh
}

export function markSeen(
  state: SeenState,
  itemCode: string,
  at: number,
  storage: Storage = localStorage,
): SeenState {
  const next: SeenState = { ...state, byItem: { ...state.byItem, [itemCode]: at } }
  saveSeen(next, storage)
  return next
}

export interface SeenStore {
  getState(): SeenState
  markSeen(itemCode: string): void
  subscribe(listener: () => void): () => void
}

/**
 * One shared seen state per device: every screen that lists items reads the same object, so
 * opening an item clears its highlight everywhere at once.
 */
export function createSeenStore(
  storage: Storage | null = null,
  now: () => number = Date.now,
): SeenStore {
  const backing = storage ?? defaultStorage()
  let state = backing ? loadSeen(backing, now) : emptySeen(now())
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    markSeen(itemCode) {
      state = backing
        ? markSeen(state, itemCode, now(), backing)
        : markSeenInMemory(state, itemCode, now())
      for (const l of [...listeners]) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

function defaultStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

function markSeenInMemory(state: SeenState, itemCode: string, at: number): SeenState {
  return { ...state, byItem: { ...state.byItem, [itemCode]: at } }
}

let deviceStore: SeenStore | null = null

/** The app-wide store, created on first use. */
export function getSeenStore(): SeenStore {
  deviceStore ??= createSeenStore()
  return deviceStore
}
