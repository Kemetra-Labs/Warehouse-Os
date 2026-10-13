import {
  collection,
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
} from 'firebase/firestore'
import { cairoToday } from '../../domain/dates'
import { movementSchema, type NewMovement } from '../../domain/types'
import {
  MANUAL_MOVEMENT_KIND,
  runManualMovement,
  type ManualAttempt,
  type ManualPayload,
} from '../cancelPost'
import { stripUndefined } from '../convert'
import type { MovementDoc } from '../deriveLedger'
import { getFirebase } from '../firebase'
import type { Listener, Unsubscribe } from '../listener'
import type { Outbox } from '../outbox'
import { reconcilePendingPosts, type ReattachResult } from '../receiptPost'
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

export const commitManualMovement = (payload: ManualPayload): Promise<void> =>
  createMovement(payload.id, payload.movement)

export type PostManualInput = Omit<Parameters<typeof runManualMovement>[0], 'today'>

/**
 * Posts a return or an adjustment (a new movement) through the outbox. Returns as soon as the
 * outbox holds it, so it works offline; `committed` settles when the server answers.
 */
export function postManualMovement(
  input: PostManualInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<ManualAttempt> {
  return runManualMovement(
    { ...input, today: cairoToday() },
    { outbox, commit: commitManualMovement, checkServer: movementExistsOnServer },
  )
}

/** App start: re-attach to returns and adjustments that were pending when the app closed. */
export async function reconcilePendingManualMovements(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
): Promise<ReattachResult[]> {
  const { db } = getFirebase()
  return reconcilePendingPosts(
    outbox,
    () => waitForPendingWrites(db),
    movementExistsOnServer,
    MANUAL_MOVEMENT_KIND,
  )
}
