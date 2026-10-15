import {
  toDraftDoc,
  toPostBatch,
  validateForPost,
  type ExistingReceipt,
  type PostBatch,
  type PostItem,
  type PostWarning,
  type ReceiptDraft,
  type ReceiptIssue,
} from '../domain/receipt'
import type { NewMovement } from '../domain/types'
import type { Outbox, ReconcileResult, ServerCheck } from './outbox'

/** The outbox `kind` of an entry that holds a receipt post (research R12). */
export const RECEIPT_POST_KIND = 'receipt-post'

/** One document write of the atomic post. The Firebase adapter turns these into batch ops. */
export type PostWrite =
  | { readonly op: 'movement'; readonly id: string; readonly data: NewMovement }
  | {
      readonly op: 'item'
      readonly code: string
      readonly priceMinor: number | null
      readonly addGtins: readonly string[]
    }
  | {
      readonly op: 'receipt'
      readonly id: string
      readonly patch: PostBatch['receiptPatch']
    }

/** Movements first, then item updates, then the receipt status (data-model "Post rule"). */
export function buildWrites(receiptId: string, batch: PostBatch): PostWrite[] {
  return [
    ...batch.movements.map((m): PostWrite => ({ op: 'movement', id: m.id, data: m.data })),
    ...batch.itemUpdates.map((u): PostWrite => ({
      op: 'item',
      code: u.code,
      priceMinor: u.priceMinor,
      addGtins: u.addGtins,
    })),
    { op: 'receipt', id: receiptId, patch: batch.receiptPatch },
  ]
}

export interface CommitPlan {
  readonly receiptId: string
  /** The draft as the receipt document should read when posted; the adapter saves it first. */
  readonly draftDoc: ReturnType<typeof toDraftDoc>
  readonly writes: readonly PostWrite[]
}

export interface PostDeps {
  readonly outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>
  /** Sends the plan as one atomic write. Resolves when the server acknowledges it. */
  readonly commit: (plan: CommitPlan) => Promise<void>
  readonly checkServer: ServerCheck
}

export interface PostInput {
  readonly id: string
  readonly draft: ReceiptDraft
  readonly items: readonly PostItem[]
  readonly existing: readonly ExistingReceipt[]
  readonly uid: string
  readonly deviceId: string
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today: string
}

/** `acked`: the server confirmed. `cleared`: it had already applied it. `failed`: kept in the outbox. */
export type PostOutcome = 'acked' | ReconcileResult

export type PostResult =
  | { readonly ok: false; readonly issues: readonly ReceiptIssue[] }
  | {
      readonly ok: true
      readonly warnings: readonly PostWarning[]
      /** Settles when the server answers (never while offline). Never rejects. */
      readonly committed: Promise<PostOutcome>
    }

export function messageOf(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : null
  const text = err instanceof Error ? err.message : String(err)
  return typeof code === 'string' ? `${code}: ${text}` : text
}

/**
 * Validates, queues the payload in the outbox, then sends the batch without waiting for the
 * server: it returns as soon as the outbox holds the entry, so the UI never blocks offline.
 * The outbox entry is cleared on ack; on a rejection the server is asked before giving up (R12).
 */
export async function runPost(input: PostInput, deps: PostDeps): Promise<PostResult> {
  const issues = validateForPost(input.draft, {
    today: input.today,
    existing: input.existing,
    selfId: input.id,
  })
  if (issues.length > 0) return { ok: false, issues }

  const batch = toPostBatch(input.draft, {
    id: input.id,
    items: input.items,
    uid: input.uid,
    deviceId: input.deviceId,
  })
  const plan: CommitPlan = {
    receiptId: input.id,
    draftDoc: toDraftDoc(input.draft),
    writes: buildWrites(input.id, batch),
  }
  await deps.outbox.put({
    id: input.id,
    kind: RECEIPT_POST_KIND,
    payload: { receiptId: input.id, draft: input.draft, batch },
  })
  return { ok: true, warnings: batch.warnings, committed: settlePost(input.id, plan, deps) }
}

export interface SettleDeps<TPlan> {
  readonly outbox: Pick<Outbox, 'markAcked' | 'reconcile'>
  readonly commit: (plan: TPlan) => Promise<void>
  readonly checkServer: (id: string, plan: TPlan) => Promise<boolean>
}

/** Sends a queued post and clears its outbox entry on ack; on a rejection asks the server (R12). */
export async function settlePost<TPlan>(
  id: string,
  plan: TPlan,
  deps: SettleDeps<TPlan>,
): Promise<PostOutcome> {
  try {
    await deps.commit(plan)
  } catch (err) {
    return deps.outbox.reconcile(id, (i) => deps.checkServer(i, plan), messageOf(err))
  }
  try {
    await deps.outbox.markAcked(id)
  } catch {
    // The server has it. A stale entry is cleared by the reconcile on the next app start.
  }
  return 'acked'
}

/**
 * On app start: for every pending receipt post, wait for the SDK's own queue to drain, then
 * compare with the server and clear or fail the entry.
 */
const TRANSIENT_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'network-request-failed',
  'resource-exhausted',
])

/** An error that says "could not reach the server", not "the server said no". */
export function isTransientError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : null
  return typeof code === 'string' && TRANSIENT_CODES.has(code.replace(/^firestore\//, ''))
}

export type ReattachResult = ReconcileResult | 'pending'

async function reattachOne(
  outbox: Pick<Outbox, 'markAcked' | 'markFailed'>,
  id: string,
  checkServer: ServerCheck,
  payload: unknown,
): Promise<ReattachResult> {
  try {
    if (await checkServer(id, payload)) {
      await outbox.markAcked(id)
      return 'cleared'
    }
    await outbox.markFailed(id, 'rejected after restart')
    return 'failed'
  } catch (err) {
    // Offline at restart: the ack may have landed before the app closed. Not a failure; ask again later.
    if (isTransientError(err)) return 'pending'
    await outbox.markFailed(id, `rejected after restart: ${messageOf(err)}`)
    return 'failed'
  }
}

export async function reconcilePendingPosts(
  outbox: Pick<Outbox, 'list' | 'markAcked' | 'markFailed'>,
  waitForPendingWrites: () => Promise<void>,
  checkServer: ServerCheck,
  kind: string = RECEIPT_POST_KIND,
): Promise<ReattachResult[]> {
  const pending = (await outbox.list()).filter((e) => e.kind === kind && e.status === 'pending')
  if (pending.length === 0) return []
  await waitForPendingWrites()
  const results: ReattachResult[] = []
  for (const entry of pending) {
    results.push(await reattachOne(outbox, entry.id, checkServer, entry.payload))
  }
  return results
}
