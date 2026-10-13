import { buildReversal, type ReversibleMovement } from './ledger'
import type { PlannedMovement, PriceUpdate } from './receipt'
import type { Movement, MovementSource, Receipt } from './types'

/** The two documents that can be cancelled. Their movements carry `source.kind` of the same name. */
export type CancelKind = 'receipt' | 'issue'

/** A movement as stored: enough to find the ones a document wrote and to reverse them. */
export type StoredMovement = ReversibleMovement & {
  readonly source: MovementSource
  readonly reverses: Movement['reverses']
}

export type CancelProblemCode =
  'not-posted' | 'no-reason' | 'incomplete' | 'already-reversed' | 'too-large'

export interface CancelProblem {
  readonly code: CancelProblemCode
  /** Arabic text for the user. */
  readonly message: string
}

/** A reversal restores an item's price to what it was before the receipt. */
export interface PriceRestore {
  readonly itemCode: string
  readonly priceMinor: number
}

/** What the document patch of a cancel says; the adapter adds `cancelledAt: serverTimestamp()`. */
export interface CancelPatch {
  readonly status: 'cancelled'
  readonly cancelReason: string
}

export interface CancelPlan {
  /** One `rev-{id}` تسوية per movement the document wrote. */
  readonly reversals: readonly PlannedMovement[]
  /** Receipts only. Items whose price a later receipt changed are left alone. */
  readonly priceRestores: readonly PriceRestore[]
  readonly patch: CancelPatch
}

export type CancelOutcome =
  | { readonly ok: true; readonly plan: CancelPlan }
  | { readonly ok: false; readonly problem: CancelProblem }

export interface CancelInput {
  readonly kind: CancelKind
  readonly docId: string
  readonly status: Receipt['status']
  readonly reason: string
  /** Today in Cairo, `YYYY-MM-DD`: the business date of the reversals. */
  readonly today: string
  readonly uid: string
  readonly deviceId: string
  /** Every movement the app knows. The ones this document wrote are picked out here. */
  readonly movements: readonly StoredMovement[]
  /**
   * How many movements the document wrote when it was posted. A smaller number found means the
   * movements have not all loaded, and cancelling then would leave stock unreversed for good.
   */
  readonly expectedMovements: number
}

/** The Firestore batch limit. A cancel is one atomic batch. */
export const MAX_BATCH_WRITES = 500

const problem = (code: CancelProblemCode, message: string): CancelOutcome => ({
  ok: false,
  problem: { code, message },
})

const STATUS_MESSAGES: Readonly<Record<Receipt['status'], string>> = {
  draft: 'المستند ده لسه ما اتعتمدش، فمينفعش يتلغي. امسحه من المسودات.',
  posted: '',
  cancelled: 'المستند ده اتلغى قبل كده.',
}

/** The id of the movement a reversal would be written under. */
export const reversalId = (movementId: string): string => `rev-${movementId}`

/** The movements the document wrote itself: its lines, never a reversal of them. */
export function movementsOfDocument(
  movements: readonly StoredMovement[],
  kind: CancelKind,
  docId: string,
): StoredMovement[] {
  return movements.filter(
    (m) => m.source.kind === kind && m.source.id === docId && m.reverses === null,
  )
}

function checkInput(input: CancelInput, own: readonly StoredMovement[]): CancelOutcome | null {
  if (input.status !== 'posted') return problem('not-posted', STATUS_MESSAGES[input.status])
  if (input.reason.trim() === '') return problem('no-reason', 'اكتب سبب الإلغاء.')
  if (own.length !== input.expectedMovements) {
    return problem('incomplete', 'حركات المستند لسه بتتحمّل. استنى لحظة وجرّب تاني.')
  }
  const reversed = new Set(
    input.movements.flatMap((m) => (m.reverses === null ? [] : [m.reverses])),
  )
  if (own.some((m) => reversed.has(m.id))) {
    return problem('already-reversed', 'فيه حركات من المستند ده اتعكست قبل كده.')
  }
  return null
}

function planFor(input: CancelInput, priceRestores: readonly PriceRestore[]): CancelOutcome {
  const own = movementsOfDocument(input.movements, input.kind, input.docId)
  const refused = checkInput(input, own)
  if (refused) return refused
  const ctx = {
    reason: input.reason,
    businessDate: input.today,
    deviceId: input.deviceId,
    createdBy: input.uid,
    source: { kind: input.kind, id: input.docId },
  }
  const reversals = own.map((m) => buildReversal(m, ctx))
  if (reversals.length + priceRestores.length + 1 > MAX_BATCH_WRITES) {
    return problem('too-large', 'المستند كبير أوي ومينفعش يتلغي مرة واحدة.')
  }
  return {
    ok: true,
    plan: {
      reversals,
      priceRestores,
      patch: { status: 'cancelled', cancelReason: input.reason.trim() },
    },
  }
}

/** Cancels a posted issue batch: a reversal for every movement it wrote, then the status. */
export function planIssueCancel(input: Omit<CancelInput, 'kind'>): CancelOutcome {
  return planFor({ ...input, kind: 'issue' }, [])
}

export interface ReceiptCancelInput extends Omit<CancelInput, 'kind'> {
  /** The price changes the receipt made when it was posted (`receipt.priceUpdates`). */
  readonly priceUpdates: readonly PriceUpdate[]
  /** The items as they are now. */
  readonly items: readonly { readonly code: string; readonly priceMinor: number }[]
}

/**
 * The price a cancel gives back: an item goes back to its price before the receipt only while it
 * still holds the price the receipt set. A later receipt that changed it again wins.
 */
export function priceRestores(
  updates: readonly PriceUpdate[],
  items: ReceiptCancelInput['items'],
): PriceRestore[] {
  const current = new Map(items.map((i) => [i.code, i.priceMinor]))
  return updates
    .filter((u) => u.fromMinor !== u.toMinor && current.get(u.itemCode) === u.toMinor)
    .map((u) => ({ itemCode: u.itemCode, priceMinor: u.fromMinor }))
}

/**
 * Cancels a posted receipt (data-model "Cancel rule"): a reversal per line movement, the price
 * restore where it still applies, then the status. GTIN links the receipt made are kept: the
 * barcode-to-item fact is still true, so the plan never touches them.
 */
export function planReceiptCancel(input: ReceiptCancelInput): CancelOutcome {
  const { priceUpdates, items, ...rest } = input
  return planFor({ ...rest, kind: 'receipt' }, priceRestores(priceUpdates, items))
}
