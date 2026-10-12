import { onSnapshot, type DocumentData, type Query, type QuerySnapshot } from 'firebase/firestore'
import { parseDocs } from '../convert'
import { toDataError, type Listener, type Unsubscribe } from '../listener'
import type { z } from 'zod'

/** Live listener over a collection: parsed with zod, metadata changes included. */
export function listenCollection<T>(
  query: Query<DocumentData>,
  schema: z.ZodType<T>,
  listener: Listener<{ id: string; value: T }>,
  onInvalid: (id: string, message: string) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query,
    { includeMetadataChanges: true },
    (snap: QuerySnapshot<DocumentData>) => {
      // 'estimate' keeps a pending serverTimestamp() usable as a Timestamp locally.
      const raw = snap.docs.map((d) => ({
        id: d.id,
        data: d.data({ serverTimestamps: 'estimate' }),
      }))
      const { ok, errors } = parseDocs(schema, raw)
      for (const e of errors) onInvalid(e.id, e.message)
      const pendingCount = snap.docs.filter((d) => d.metadata.hasPendingWrites).length
      listener.onData(ok, { pendingCount, fromCache: snap.metadata.fromCache })
    },
    (err) => listener.onError(toDataError(err)),
  )
}
