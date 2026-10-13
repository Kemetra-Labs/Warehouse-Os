/**
 * The ids of the ledger file this device downloaded and has not confirmed yet ("تم اللصق").
 * The phone downloads and the PC pastes, so the tab can be closed or discarded in between: the
 * list lives in device storage, not in screen state. Never throws if storage is blocked.
 */

const KEY = 'warehouse.ledgerDownload.v1'

function defaultStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((id) => typeof id === 'string')

/** Remembers the ids of the file just downloaded. An empty file is not kept. */
export function savePendingLedger(
  ids: readonly string[],
  storage: Storage | null = defaultStorage(),
): void {
  try {
    if (ids.length === 0) storage?.removeItem(KEY)
    else storage?.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Blocked storage: the confirmation then lasts only while the screen stays open.
  }
}

/**
 * The downloaded ids still waiting for "تم اللصق", or null. A file whose rows were all confirmed
 * already (for example on another device) is dropped.
 */
export function loadPendingLedger(
  exported: readonly string[],
  storage: Storage | null = defaultStorage(),
): string[] | null {
  try {
    const raw = storage?.getItem(KEY) ?? null
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isIdList(parsed) || parsed.length === 0) return null
    const done = new Set(exported)
    return parsed.every((id) => done.has(id)) ? null : parsed
  } catch {
    return null
  }
}

/** Forgets the file once its paste is confirmed. */
export function clearPendingLedger(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}
