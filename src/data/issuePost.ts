import {
  toDraftDoc,
  toPostBatch,
  validateForPost,
  type BatchProblem,
  type IssueDraft,
  type IssuePostBatch,
  type PostItem,
} from '../domain/issue'
import type { StockView } from '../domain/issueStock'
import type { NewMovement } from '../domain/types'
import type { Outbox, ServerCheck } from './outbox'
import {
  reconcilePendingPosts,
  settlePost,
  type PostOutcome,
  type ReattachResult,
} from './receiptPost'

/** The outbox `kind` of an entry that holds an issue-batch post (research R12). */
export const ISSUE_POST_KIND = 'issue-post'

/** One document write of the atomic post. The Firebase adapter turns these into batch ops. */
export type IssueWrite =
  | { readonly op: 'movement'; readonly id: string; readonly data: NewMovement }
  | { readonly op: 'batch'; readonly id: string; readonly patch: IssuePostBatch['patch'] }

/** Movements first, then the batch status (data-model "Post rule"). */
export function buildIssueWrites(batchId: string, batch: IssuePostBatch): IssueWrite[] {
  return [
    ...batch.movements.map((m): IssueWrite => ({ op: 'movement', id: m.id, data: m.data })),
    { op: 'batch', id: batchId, patch: batch.patch },
  ]
}

export interface IssueCommitPlan {
  readonly batchId: string
  /** The draft as the batch document should read when posted; the adapter saves it first. */
  readonly draftDoc: ReturnType<typeof toDraftDoc>
  readonly writes: readonly IssueWrite[]
}

export interface IssuePostDeps {
  readonly outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>
  /** Sends the plan as one atomic write. Resolves when the server acknowledges it. */
  readonly commit: (plan: IssueCommitPlan) => Promise<void>
  readonly checkServer: ServerCheck
}

export interface IssuePostInput {
  readonly id: string
  readonly draft: IssueDraft
  readonly items: readonly PostItem[]
  readonly stock: StockView
  readonly uid: string
  readonly deviceId: string
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today: string
}

export type IssuePostResult =
  | { readonly ok: false; readonly problems: readonly BatchProblem[] }
  | {
      readonly ok: true
      /** Settles when the server answers (never while offline). Never rejects. */
      readonly committed: Promise<PostOutcome>
    }

/**
 * Validates, queues the payload in the outbox, then sends the batch without waiting for the
 * server: it returns as soon as the outbox holds the entry, so the UI never blocks offline.
 */
export async function runIssuePost(
  input: IssuePostInput,
  deps: IssuePostDeps,
): Promise<IssuePostResult> {
  const problems = validateForPost(input.draft, { today: input.today, stock: input.stock })
  if (problems.length > 0) return { ok: false, problems }

  const batch = toPostBatch(input.draft, {
    id: input.id,
    items: input.items,
    uid: input.uid,
    deviceId: input.deviceId,
  })
  const plan: IssueCommitPlan = {
    batchId: input.id,
    draftDoc: toDraftDoc(input.draft),
    writes: buildIssueWrites(input.id, batch),
  }
  await deps.outbox.put({
    id: input.id,
    kind: ISSUE_POST_KIND,
    payload: { batchId: input.id, draft: input.draft, batch },
  })
  return { ok: true, committed: settlePost(input.id, plan, deps) }
}

/** App start: re-attach to issue posts that were pending when the app closed. */
export function reconcilePendingIssuePosts(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
  waitForPendingWrites: () => Promise<void>,
  checkServer: ServerCheck,
): Promise<ReattachResult[]> {
  return reconcilePendingPosts(outbox, waitForPendingWrites, checkServer, ISSUE_POST_KIND)
}
