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
import type { StoredMovement } from '../../domain/cancel'
import { cairoToday } from '../../domain/dates'
import { newIssueDraft, nextBatchNumber, toDraftDoc, type IssueDraft } from '../../domain/issue'
import { issueBatchSchema, type IssueBatch } from '../../domain/types'
import {
  ISSUE_CANCEL_KIND,
  runIssueCancel,
  type CancelAttempt,
  type IssueCancelRequest,
} from '../cancelPost'
import { stripUndefined } from '../convert'
import { expectedLines, PostConflictError, sameIssuePost } from '../postConflict'
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
import { reconcilePendingPosts, type ReattachResult } from '../receiptPost'
import { cancelledOnServer, commitCancel } from './cancelCommit'
import { listenCollection } from './shared'
import { watchWrite } from '../sync'

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
  return watchWrite(setDoc(doc(db, 'issueBatches', id), stripUndefined(toDraftDoc(draft))))
}

/** Discards a draft. Rules allow a delete only while the status is draft. */
export function deleteIssueDraft(id: string): Promise<void> {
  const { db } = getFirebase()
  return deleteDoc(doc(db, 'issueBatches', id))
}

/**
 * True when the server (not the cache) holds the batch as posted or cancelled (R12). Throws a
 * `PostConflictError` when it holds it with other issued lines than `expected`, the ones this
 * device posted: another device posted the same draft, and clearing the entry would drop them.
 */
export async function issueBatchPostedOnServer(id: string, expected?: unknown): Promise<boolean> {
  const { db } = getFirebase()
  const snap = await getDocFromServer(doc(db, 'issueBatches', id))
  const status: unknown = snap.exists() ? snap.get('status') : null
  if (status !== 'posted' && status !== 'cancelled') return false
  const mine = expectedLines(expected, 'issued')
  if (mine !== null && !sameIssuePost(snap.get('issued'), mine)) throw new PostConflictError()
  return true
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

/** True when the server (not the cache) holds the batch as cancelled; gets the cancel's outbox id. */
export const issueBatchCancelledOnServer = (entryId: string): Promise<boolean> =>
  cancelledOnServer('issueBatches', entryId)

export type CancelIssueInput = Omit<IssueCancelRequest, 'today'>

/**
 * Cancels a posted batch (إلغاء): a reversal per movement and the status in one atomic batch.
 * Returns as soon as the outbox holds it; `committed` settles when the server answers.
 */
export function cancelIssueBatch(
  input: CancelIssueInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<CancelAttempt> {
  return runIssueCancel(
    { ...input, today: cairoToday() },
    { outbox, commit: commitCancel, checkServer: issueBatchCancelledOnServer },
  )
}

export interface CancelIssueDocInput {
  readonly reason: string
  /** Every movement the app knows. */
  readonly movements: readonly StoredMovement[]
  readonly uid: string
  readonly deviceId: string
}

/** Cancels the batch as the app holds it: its status and movement count come from it. */
export function cancelIssueDoc(
  batch: IssueBatchDoc,
  input: CancelIssueDocInput,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<CancelAttempt> {
  return cancelIssueBatch(
    {
      ...input,
      docId: batch.id,
      status: batch.status,
      label: `دفعة ${batch.number}`,
      expectedMovements: batch.issued.length,
    },
    outbox,
  )
}

/** App start: re-attach to issue cancels that were pending when the app closed. */
export async function reconcilePendingIssueCancels(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
): Promise<ReattachResult[]> {
  const { db } = getFirebase()
  return reconcilePendingPosts(
    outbox,
    () => waitForPendingWrites(db),
    issueBatchCancelledOnServer,
    ISSUE_CANCEL_KIND,
  )
}
