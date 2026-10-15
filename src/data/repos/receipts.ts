import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore'
import { cairoToday } from '../../domain/dates'
import type { StoredMovement } from '../../domain/cancel'
import { toDraftDoc, type ReceiptDraft } from '../../domain/receipt'
import { receiptSchema, type Receipt } from '../../domain/types'
import {
  RECEIPT_CANCEL_KIND,
  itemsReceivedAfter,
  runReceiptCancel,
  type CancelAttempt,
  type ReceiptCancelRequest,
} from '../cancelPost'
import { stripUndefined } from '../convert'
import { expectedLines, PostConflictError, sameReceiptPost } from '../postConflict'
import { getFirebase } from '../firebase'
import type { Listener, Unsubscribe } from '../listener'
import type { Outbox } from '../outbox'
import {
  reconcilePendingPosts,
  runPost,
  type CommitPlan,
  type PostInput,
  type PostResult,
  type ReattachResult,
} from '../receiptPost'
import { cancelledOnServer, commitCancel } from './cancelCommit'
import { listenCollection } from './shared'
import { watchWrite } from '../sync'

export type ReceiptDoc = Receipt & { readonly id: string }

/** Thin Firestore adapter over `receiptPost.ts`; the logic lives in the pure modules. */
export function subscribeReceipts(listener: Listener<ReceiptDoc>): Unsubscribe {
  const { db } = getFirebase()
  return listenCollection(collection(db, 'receipts'), receiptSchema, {
    onData: (rows, meta) =>
      listener.onData(
        rows.map((r) => ({ ...r.value, id: r.id })),
        meta,
      ),
    onError: listener.onError,
  })
}

/** Writes (or overwrites) a draft. Rules reject it once the receipt is posted. */
export function saveDraft(id: string, draft: ReceiptDraft): Promise<void> {
  const { db } = getFirebase()
  return watchWrite(setDoc(doc(db, 'receipts', id), stripUndefined(toDraftDoc(draft))))
}

/** New draft with a UUID id. The id is returned at once; `written` settles on server ack. */
export function createDraft(draft: ReceiptDraft): { id: string; written: Promise<void> } {
  const id = crypto.randomUUID()
  return { id, written: saveDraft(id, draft) }
}

/** Discards a draft. Rules allow a delete only while the status is draft. */
export function deleteDraft(id: string): Promise<void> {
  const { db } = getFirebase()
  return deleteDoc(doc(db, 'receipts', id))
}

/**
 * True when the server (not the cache) holds the receipt as posted or cancelled (R12). Throws a
 * `PostConflictError` when it holds it with other lines than `expected`, the ones this device
 * posted: another device posted the same draft, and clearing the entry would drop these lines.
 */
export async function receiptPostedOnServer(id: string, expected?: unknown): Promise<boolean> {
  const { db } = getFirebase()
  const snap = await getDocFromServer(doc(db, 'receipts', id))
  const status: unknown = snap.exists() ? snap.get('status') : null
  if (status !== 'posted' && status !== 'cancelled') return false
  const mine = expectedLines(expected, 'lines')
  if (mine !== null && !sameReceiptPost(snap.get('lines'), mine)) throw new PostConflictError()
  return true
}

function addWrites(db: Firestore, batch: WriteBatch, plan: CommitPlan): void {
  for (const w of plan.writes) {
    if (w.op === 'movement') {
      const data = stripUndefined({ ...w.data, postedAt: serverTimestamp() })
      batch.set(doc(db, 'movements', w.id), data)
    } else if (w.op === 'item') {
      const patch = {
        ...(w.priceMinor === null ? {} : { priceMinor: w.priceMinor }),
        updatedAt: serverTimestamp(),
        ...(w.addGtins.length > 0 ? { gtins: arrayUnion(...w.addGtins) } : {}),
      }
      batch.update(doc(db, 'items', w.code), patch)
    } else {
      const patch = stripUndefined({ ...w.patch, postedAt: serverTimestamp() })
      batch.update(doc(db, 'receipts', w.id), patch)
    }
  }
}

/** One atomic batch. The draft is saved first so the receipt document exists to be updated. */
export function commitPlan(plan: CommitPlan): Promise<void> {
  const { db } = getFirebase()
  // Queued in order ahead of the batch; a failure here makes the batch fail too (outbox handles it).
  void setDoc(doc(db, 'receipts', plan.receiptId), stripUndefined(plan.draftDoc)).catch(
    () => undefined,
  )
  const batch = writeBatch(db)
  addWrites(db, batch, plan)
  return batch.commit()
}

export type PostReceiptInput = Omit<PostInput, 'today'>

/**
 * Posts a receipt (اعتماد). Returns as soon as the payload sits in the outbox: it never waits
 * for the server, so it works offline. `committed` settles when the server answers.
 */
export function postReceipt(
  input: PostReceiptInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<PostResult> {
  return runPost(
    { ...input, today: cairoToday() },
    { outbox, commit: commitPlan, checkServer: receiptPostedOnServer },
  )
}

/** App start: re-attach to receipt posts that were pending when the app closed. */
export async function reconcilePendingReceipts(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
): Promise<ReattachResult[]> {
  const { db } = getFirebase()
  return reconcilePendingPosts(outbox, () => waitForPendingWrites(db), receiptPostedOnServer)
}

/** Reads one receipt from the local cache (or the server when online). */
export async function getReceipt(id: string): Promise<ReceiptDoc | null> {
  const { db } = getFirebase()
  const snap = await getDoc(doc(db, 'receipts', id))
  if (!snap.exists()) return null
  const parsed = receiptSchema.safeParse(snap.data({ serverTimestamps: 'estimate' }))
  return parsed.success ? { ...parsed.data, id } : null
}

/** True when the server (not the cache) holds the receipt as cancelled; gets the cancel's outbox id. */
export const receiptCancelledOnServer = (entryId: string): Promise<boolean> =>
  cancelledOnServer('receipts', entryId)

export type CancelReceiptInput = Omit<ReceiptCancelRequest, 'today'>

/**
 * Cancels a posted receipt (إلغاء): reversals, the price restore and the status in one atomic
 * batch. Returns as soon as the outbox holds it; `committed` settles when the server answers.
 */
export function cancelReceipt(
  input: CancelReceiptInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<CancelAttempt> {
  return runReceiptCancel(
    { ...input, today: cairoToday() },
    { outbox, commit: commitCancel, checkServer: receiptCancelledOnServer },
  )
}

export interface CancelReceiptDocInput {
  readonly reason: string
  /** Every movement the app knows. */
  readonly movements: readonly StoredMovement[]
  /** The items as they are now: a price is restored only while it is still the one the receipt set. */
  readonly items: readonly { readonly code: string; readonly priceMinor: number }[]
  /** Every receipt the app knows: one posted later keeps the price of the items it received. */
  readonly receipts: readonly ReceiptDoc[]
  readonly uid: string
  readonly deviceId: string
}

/** Cancels the receipt as the app holds it: its price changes, status and movement count come from it. */
export function cancelReceiptDoc(
  receipt: ReceiptDoc,
  input: CancelReceiptDocInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<CancelAttempt> {
  const { receipts, ...rest } = input
  return cancelReceipt(
    {
      ...rest,
      receipt: { id: receipt.id, status: receipt.status },
      receivedLater: itemsReceivedAfter(receipt, receipts),
      label: receipt.deliveryNo.trim() === '' ? 'الاستلام' : `إذن ${receipt.deliveryNo.trim()}`,
      priceUpdates: receipt.priceUpdates,
      // A line that counted nothing wrote no movement.
      expectedMovements: receipt.lines.filter((l) => l.countedQty > 0).length,
    },
    outbox,
  )
}

/** App start: re-attach to receipt cancels that were pending when the app closed. */
export async function reconcilePendingReceiptCancels(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
): Promise<ReattachResult[]> {
  const { db } = getFirebase()
  return reconcilePendingPosts(
    outbox,
    () => waitForPendingWrites(db),
    receiptCancelledOnServer,
    RECEIPT_CANCEL_KIND,
  )
}
