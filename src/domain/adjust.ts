import type { BatchBalance } from './ledger'
import { MOVEMENT_TYPES, type NewMovement } from './types'

/** A return (مرتجع, adds stock back) or a signed adjustment (تسوية, up or down). */
export type ManualKind = 'return' | 'adjust'

export interface ManualInput {
  readonly kind: ManualKind
  readonly itemCode: string
  /** A return is more than 0. An adjustment is signed and never 0. */
  readonly qty: number
  readonly batchNo: string | null
  readonly expiry: string | null
  /** The unit price now: it is snapshotted on the movement (constitution II). */
  readonly priceMinor: number
  readonly reason: string
  /** `YYYY-MM-DD`. */
  readonly businessDate: string
}

export interface ManualContext {
  /** Today in Cairo, `YYYY-MM-DD`: a business date may not be after it. */
  readonly today: string
  readonly uid: string
  readonly deviceId: string
}

export type ManualProblemCode = 'qty' | 'reason' | 'date'

export interface ManualProblem {
  readonly code: ManualProblemCode
  /** Arabic text for the user. */
  readonly message: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function qtyProblem(input: ManualInput): ManualProblem | null {
  if (!Number.isInteger(input.qty) || input.qty === 0) {
    return { code: 'qty', message: 'اكتب كمية صحيحة، مش صفر.' }
  }
  if (input.kind === 'return' && input.qty < 0) {
    return { code: 'qty', message: 'كمية المرتجع لازم تكون أكبر من صفر.' }
  }
  return null
}

/** Everything that blocks saving a return or an adjustment, in Arabic. Empty means it can go. */
export function validateManual(input: ManualInput, today: string): ManualProblem[] {
  const out: ManualProblem[] = []
  const qty = qtyProblem(input)
  if (qty) out.push(qty)
  if (input.reason.trim() === '') out.push({ code: 'reason', message: 'اكتب السبب.' })
  if (!DAY.test(input.businessDate)) {
    out.push({ code: 'date', message: 'التاريخ مش صحيح.' })
  } else if (input.businessDate > today) {
    out.push({ code: 'date', message: 'التاريخ ما ينفعش يكون في المستقبل.' })
  }
  return out
}

/**
 * The movement of a return or an adjustment, always new: a posted movement is never edited.
 * It is a manual entry (`source.kind: 'manual'`), with the reason on it. Throws when the input is
 * not valid: `validateManual` comes first.
 */
export function buildManualMovement(input: ManualInput, ctx: ManualContext): NewMovement {
  const problems = validateManual(input, ctx.today)
  if (problems.length > 0) throw new Error(problems.map((p) => p.message).join(' '))
  return {
    type: input.kind === 'return' ? MOVEMENT_TYPES.RETURN : MOVEMENT_TYPES.ADJUST,
    itemCode: input.itemCode,
    qty: input.qty,
    businessDate: input.businessDate,
    priceMinor: input.priceMinor,
    batchNo: input.batchNo,
    expiry: input.expiry,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'manual', id: null },
    substituteFor: null,
    reverses: null,
    reason: input.reason.trim(),
    deviceId: ctx.deviceId,
    createdBy: ctx.uid,
  }
}

export interface Settlement {
  /** How many to add so the balance reaches 0. */
  readonly qty: number
  readonly batchNo: string | null
  readonly expiry: string | null
}

/**
 * What clears a pending settlement (balance below 0): add the shortfall to the batch that is
 * below zero, so that batch returns to 0 instead of leaving a negative one next to a positive one.
 * Null when the item is not below zero.
 */
export function suggestSettlement(
  batches: readonly BatchBalance[],
  balance: number,
): Settlement | null {
  if (balance >= 0) return null
  const lowest = batches.reduce<BatchBalance | null>(
    (low, b) => (b.balance < 0 && (low === null || b.balance < low.balance) ? b : low),
    null,
  )
  if (lowest === null) return { qty: -balance, batchNo: null, expiry: null }
  return { qty: -lowest.balance, batchNo: lowest.batchNo, expiry: lowest.expiry }
}
