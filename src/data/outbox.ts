/**
 * IndexedDB outbox (research R12). No Firebase imports: the "is it already on the server"
 * check is injected, so this module is testable with fake-indexeddb.
 */

export type OutboxStatus = 'pending' | 'failed'

export interface OutboxEntry {
  readonly id: string
  readonly kind: string
  readonly payload: unknown
  readonly status: OutboxStatus
  readonly error: string | null
  readonly createdAt: number
}

export type NewOutboxEntry = Pick<OutboxEntry, 'id' | 'kind' | 'payload'>

/** Resolves true when the server already holds the posted/cancelled document for `id`. */
export type ServerCheck = (id: string) => Promise<boolean>

export type ReconcileResult = 'cleared' | 'failed'

export interface Outbox {
  put(entry: NewOutboxEntry): Promise<void>
  markAcked(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  list(): Promise<OutboxEntry[]>
  reconcile(id: string, checkServer: ServerCheck, error?: string): Promise<ReconcileResult>
  subscribe(listener: () => void): () => void
  close(): void
}

export interface OutboxOptions {
  readonly dbName?: string
  readonly factory?: IDBFactory
  readonly now?: () => number
}

const STORE = 'entries'
const DEFAULT_DB = 'warehouse-outbox'

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createOutbox(options: OutboxOptions = {}): Outbox {
  const factory = options.factory ?? indexedDB
  const now = options.now ?? Date.now
  const listeners = new Set<() => void>()
  let dbPromise: Promise<IDBDatabase> | null = null

  const db = (): Promise<IDBDatabase> => {
    dbPromise ??= openDb(factory, options.dbName ?? DEFAULT_DB)
    return dbPromise
  }

  const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> =>
    (await db()).transaction(STORE, mode).objectStore(STORE)

  const notify = (): void => {
    for (const l of [...listeners]) l()
  }

  const write = async (entry: OutboxEntry): Promise<void> => {
    await requestToPromise((await store('readwrite')).put(entry))
  }

  const get = async (id: string): Promise<OutboxEntry | undefined> =>
    requestToPromise((await store('readonly')).get(id)) as Promise<OutboxEntry | undefined>

  const markFailed = async (id: string, error: string): Promise<void> => {
    const current = await get(id)
    if (!current) return
    await write({ ...current, status: 'failed', error })
    notify()
  }

  const markAcked = async (id: string): Promise<void> => {
    await requestToPromise((await store('readwrite')).delete(id))
    notify()
  }

  return {
    async put(entry) {
      await write({ ...entry, status: 'pending', error: null, createdAt: now() })
      notify()
    },
    markAcked,
    markFailed,
    async list() {
      const all = (await requestToPromise((await store('readonly')).getAll())) as OutboxEntry[]
      return [...all].sort((a, b) => a.createdAt - b.createdAt)
    },
    async reconcile(id, checkServer, error = 'rejected') {
      try {
        if (await checkServer(id)) {
          await markAcked(id)
          return 'cleared'
        }
        await markFailed(id, error)
      } catch (err) {
        await markFailed(id, `${error}: ${messageOf(err)}`)
      }
      return 'failed'
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    close() {
      void dbPromise?.then((d) => d.close())
      dbPromise = null
    },
  }
}
