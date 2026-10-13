import {
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
import { newIssueDraft, nextBatchNumber, toDraftDoc, type IssueDraft } from '../../domain/issue'
import { issueBatchSchema, type IssueBatch } from '../../domain/types'
import { stripUndefined } from '../convert'
import { getFirebase } from '../firebase'
import {
  reconcilePendingIssuePosts,
  runIssuePost,
  type IssueCommitPlan,
  type IssuePostInput,
  type IssuePostResult,
} from '../issuePost'
import type { Listener, Unsubscribe } from '../listener'
import type { Outbox } from '../outbox'
import type { ReattachResult } from '../receiptPost'
import { listenCollection } from './shared'

export type IssueBatchDoc = IssueBatch & { readonly id: string }

/** Thin Firestore adapter over `issuePost.ts`; the logic lives in the pure modules. */
export function subscribeIssueBatches(listener: Listener<IssueBatchDoc>): Unsubscribe {
  const { db } = getFirebase()
  return listenCollection(collection(db, 'issueBatches'), issueBatchSchema, {
    onData: (rows, meta) =>
      listener.onData(
        rows.map((r) => ({ ...r.value, id: r.id })),
        meta,
      ),
    onError: listener.onError,
  })
}

/** A new, empty draft numbered after every batch the app knows (R10), dated today in Cairo. */
export function startIssueDraft(known: readonly { readonly number: number }[]): IssueDraft {
  return newIssueDraft(nextBatchNumber(known), cairoToday())
}

/** Writes (or overwrites) a draft. Rules reject it once the batch is posted. */
export function saveIssueDraft(id: string, draft: IssueDraft): Promise<void> {
  const { db } = getFirebase()
  return setDoc(doc(db, 'issueBatches', id), stripUndefined(toDraftDoc(draft)))
}

/** Discards a draft. Rules allow a delete only while the status is draft. */
export function deleteIssueDraft(id: string): Promise<void> {
  const { db } = getFirebase()
  return deleteDoc(doc(db, 'issueBatches', id))
}

/** True when the server (not the cache) holds the batch as posted or cancelled (R12). */
export async function issueBatchPostedOnServer(id: string): Promise<boolean> {
  const { db } = getFirebase()
  const snap = await getDocFromServer(doc(db, 'issueBatches', id))
  const status: unknown = snap.exists() ? snap.get('status') : null
  return status === 'posted' || status === 'cancelled'
}

function addWrites(db: Firestore, batch: WriteBatch, plan: IssueCommitPlan): void {
  for (const w of plan.writes) {
    if (w.op === 'movement') {
      const data = stripUndefined({ ...w.data, postedAt: serverTimestamp() })
      batch.set(doc(db, 'movements', w.id), data)
    } else {
      const patch = stripUndefined({ ...w.patch, postedAt: serverTimestamp() })
      batch.update(doc(db, 'issueBatches', w.id), patch)
    }
  }
}

/** One atomic batch. The draft is saved first so the batch document exists to be updated. */
export function commitPlan(plan: IssueCommitPlan): Promise<void> {
  const { db } = getFirebase()
  // Queued in order ahead of the batch; a failure here makes the batch fail too (outbox handles it).
  void setDoc(doc(db, 'issueBatches', plan.batchId), stripUndefined(plan.draftDoc)).catch(
    () => undefined,
  )
  const batch = writeBatch(db)
  addWrites(db, batch, plan)
  return batch.commit()
}

export type PostIssueInput = Omit<IssuePostInput, 'today'>

/**
 * Posts a batch (اعتماد). Returns as soon as the payload sits in the outbox: it never waits
 * for the server, so it works offline. `committed` settles when the server answers.
 */
export function postIssueBatch(
  input: PostIssueInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<IssuePostResult> {
  return runIssuePost(
    { ...input, today: cairoToday() },
    { outbox, commit: commitPlan, checkServer: issueBatchPostedOnServer },
  )
}

/** App start: re-attach to issue posts that were pending when the app closed. */
export async function reconcilePendingIssueBatches(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
): Promise<ReattachResult[]> {
  const { db } = getFirebase()
  return reconcilePendingIssuePosts(
    outbox,
    () => waitForPendingWrites(db),
    issueBatchPostedOnServer,
  )
}

/** Reads one batch from the local cache (or the server when online). */
export async function getIssueBatch(id: string): Promise<IssueBatchDoc | null> {
  const { db } = getFirebase()
  const snap = await getDoc(doc(db, 'issueBatches', id))
  if (!snap.exists()) return null
  const parsed = issueBatchSchema.safeParse(snap.data({ serverTimestamps: 'estimate' }))
  return parsed.success ? { ...parsed.data, id } : null
}
