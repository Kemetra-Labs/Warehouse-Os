const KEY = 'warehouse.deviceId.v1'

let memoryId: string | null = null

function defaultStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

/**
 * A stable per-device id for `movements.deviceId`. Stored in localStorage; when storage is
 * blocked it falls back to an id that lives for the page session.
 */
export function getDeviceId(
  storage: Storage | null = defaultStorage(),
  uuid: () => string = () => crypto.randomUUID(),
): string {
  try {
    const saved = storage?.getItem(KEY)
    if (saved) return saved
    const fresh = uuid()
    storage?.setItem(KEY, fresh)
    memoryId = memoryId ?? fresh
    return storage ? fresh : memoryId
  } catch {
    memoryId = memoryId ?? uuid()
    return memoryId
  }
}
