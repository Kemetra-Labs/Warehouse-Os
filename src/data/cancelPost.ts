/**
 * Cancelling a posted document, and posting a return or an adjustment, through the outbox
 * (research R12). Pure like `receiptPost.ts`: the Firebase writes and the server checks are
 * injected, so this is tested with fake-indexeddb and fakes.
 *
 * Nothing posted is ever edited. A cancel writes new `rev-*` movements and moves the document
 * from posted to cancelled in one atomic batch; its ids are deterministic and create-only, so a
 * retry can never write a reversal twice.
 */
import {
  buildManualMovement,
  validateManual,
  type ManualContext,
  type ManualInput,
  type ManualProblem,
} from '../domain/adjust'
import {
  planIssueCancel,
  planReceiptCancel,
  type CancelInput,
  type CancelOutcome,
  type CancelPlan,
  type CancelProblem,
  type ReceiptCancelInput,
} from '../domain/cancel'
import type { NewMovement } from '../domain/types'
import type { Outbox, ServerCheck } from './outbox'
import { settlePost, type PostOutcome } from './receiptPost'

export const RECEIPT_CANCEL_KIND = 'receipt-cancel'
export const ISSUE_CANCEL_KIND = 'issue-cancel'
export const MANUAL_MOVEMENT_KIND = 'manual-movement'

export type CancelCollection = 'receipts' | 'issueBatches'

/** One document write of the atomic cancel. The Firebase adapter turns these into batch ops. */
export type CancelWrite =
  | { readonly op: 'movement'; readonly id: string; readonly data: NewMovement }
  | { readonly op: 'item-price'; readonly code: string; readonly priceMinor: number }
  | { readonly op: 'doc'; readonly reason: string }

export interface CancelCommitPlan {
  readonly collection: CancelCollection
  readonly docId: string
  readonly writes: readonly CancelWrite[]
}

/** What the outbox stores for a cancel: enough to describe it and to send it again. */
export interface CancelPayload extends CancelCommitPlan {
  /** Words for the unsent screen, e.g. "إذن 19808953". */
  readonly label: string
  readonly reason: string
}

const CANCEL_PREFIX = 'cancel-'

/**
 * The outbox id of a cancel. It is not the document id: the post of the same document may still
 * be waiting in the outbox under that id, and the cancel must never overwrite it.
 */
export const cancelEntryId = (docId: string): string => `${CANCEL_PREFIX}${docId}`

/** The document an outbox cancel id belongs to. */
export const docIdOfCancelEntry = (entryId: string): string =>
  entryId.startsWith(CANCEL_PREFIX) ? entryId.slice(CANCEL_PREFIX.length) : entryId

/** Reversals first, then the price restores, then the document status (data-model "Cancel rule"). */
export function buildCancelWrites(plan: CancelPlan): CancelWrite[] {
  return [
    ...plan.reversals.map((m): CancelWrite => ({ op: 'movement', id: m.id, data: m.data })),
    ...plan.priceRestores.map((p): CancelWrite => ({
      op: 'item-price',
      code: p.itemCode,
      priceMinor: p.priceMinor,
    })),
    { op: 'doc', reason: plan.patch.cancelReason },
  ]
}

export interface CancelDeps {
  readonly outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>
  /** Sends the plan as one atomic write. Resolves when the server acknowledges it. */
  readonly commit: (plan: CancelCommitPlan) => Promise<void>
  /** True when the server already holds the document as cancelled. Gets the outbox id. */
  readonly checkServer: ServerCheck
}

export type CancelAttempt =
  | { readonly ok: false; readonly problem: CancelProblem }
  | {
      readonly ok: true
      /** Settles when the server answers (never while offline). Never rejects. */
      readonly committed: Promise<PostOutcome>
    }

async function send(
  outcome: CancelOutcome,
  collection: CancelCollection,
  docId: string,
  label: string,
  deps: CancelDeps,
): Promise<CancelAttempt> {
  if (!outcome.ok) return outcome
  const commitPlan: CancelCommitPlan = {
    collection,
    docId,
    writes: buildCancelWrites(outcome.plan),
  }
  const payload: CancelPayload = { ...commitPlan, label, reason: outcome.plan.patch.cancelReason }
  const entryId = cancelEntryId(docId)
  await deps.outbox.put({
    id: entryId,
    kind: collection === 'receipts' ? RECEIPT_CANCEL_KIND : ISSUE_CANCEL_KIND,
    payload,
  })
  return { ok: true, committed: settlePost(entryId, commitPlan, deps) }
}

export interface ReceiptCancelRequest extends Omit<ReceiptCancelInput, 'status' | 'docId'> {
  readonly receipt: { readonly id: string; readonly status: ReceiptCancelInput['status'] }
  readonly label: string
}

/** Plans, queues in the outbox and sends the cancel of a receipt, without waiting for the server. */
export function runReceiptCancel(
  request: ReceiptCancelRequest,
  deps: CancelDeps,
): Promise<CancelAttempt> {
  const { receipt, label, ...rest } = request
  const outcome = planReceiptCancel({ ...rest, docId: receipt.id, status: receipt.status })
  return send(outcome, 'receipts', receipt.id, label, deps)
}

export interface IssueCancelRequest extends Omit<CancelInput, 'kind'> {
  readonly label: string
}

/** Plans, queues in the outbox and sends the cancel of an issue batch. */
export function runIssueCancel(
  request: IssueCancelRequest,
  deps: CancelDeps,
): Promise<CancelAttempt> {
  const { label, ...input } = request
  return send(planIssueCancel(input), 'issueBatches', input.docId, label, deps)
}

/** What the outbox stores for a return or an adjustment. */
export interface ManualPayload {
  readonly id: string
  readonly movement: NewMovement
}

export interface ManualDeps {
  readonly outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>
  readonly commit: (payload: ManualPayload) => Promise<void>
  /** True when the server already holds movement `id`. */
  readonly checkServer: ServerCheck
}

export type ManualAttempt =
  | { readonly ok: false; readonly problems: readonly ManualProblem[] }
  | { readonly ok: true; readonly committed: Promise<PostOutcome> }

/**
 * Validates, queues and sends a return or an adjustment as a new movement. The id is a UUID made
 * once by the caller, so pressing the button twice or retrying writes it at most once.
 */
export async function runManualMovement(
  input: { readonly id: string; readonly form: ManualInput } & ManualContext,
  deps: ManualDeps,
): Promise<ManualAttempt> {
  const problems = validateManual(input.form, input.today)
  if (problems.length > 0) return { ok: false, problems }
  const payload: ManualPayload = { id: input.id, movement: buildManualMovement(input.form, input) }
  await deps.outbox.put({ id: input.id, kind: MANUAL_MOVEMENT_KIND, payload })
  return { ok: true, committed: settlePost(input.id, payload, deps) }
}
