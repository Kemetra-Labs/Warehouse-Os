import { collection, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
import { movementSchema, type NewMovement } from '../../domain/types'
import { stripUndefined } from '../convert'
import type { MovementDoc } from '../deriveLedger'
import { getFirebase } from '../firebase'
import type { Listener, Unsubscribe } from '../listener'
import { listenCollection } from './shared'

export function subscribeMovements(listener: Listener<MovementDoc>): Unsubscribe {
  const { db } = getFirebase()
  return listenCollection(collection(db, 'movements'), movementSchema, {
    onData: (rows, meta) =>
      listener.onData(
        rows.map((r) => ({ ...r.value, id: r.id })),
        meta,
      ),
    onError: listener.onError,
  })
}

/** Create-only (rules deny update/delete). `postedAt` is stamped by the server. */
export function createMovement(id: string, movement: NewMovement): Promise<void> {
  const { db } = getFirebase()
  const data = stripUndefined({ ...movement, postedAt: serverTimestamp() })
  return setDoc(doc(db, 'movements', id), data)
}

/** True when the server (not the cache) already holds movement `id`; used by the outbox. */
export async function movementExistsOnServer(id: string): Promise<boolean> {
  const { db } = getFirebase()
  const snap = await getDocFromServer(doc(db, 'movements', id))
  return snap.exists()
}
