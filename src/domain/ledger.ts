import {
  MOVEMENT_TYPES,
  UNSPECIFIED_BATCH_LABEL,
  type Movement,
  type MovementSource,
  type NewMovement,
} from './types'

type EffectInput = Pick<Movement, 'type' | 'qty'>
type LedgerRow = Pick<Movement, 'type' | 'qty' | 'itemCode' | 'batchNo' | 'expiry'>

export interface BatchBalance {
  readonly batchNo: string | null
  readonly expiry: string | null
  readonly balance: number
  /** Display label: the batch number, or "تشغيلة غير محددة" for the null bucket. */
  readonly label: string
}

/** Signed effect on the balance: workbook `H - I + J + K`. */
export function effect(m: EffectInput): number {
  return m.type === MOVEMENT_TYPES.ISSUE ? -m.qty : m.qty
}

export function itemBalances(movements: readonly LedgerRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of movements) {
    out.set(m.itemCode, (out.get(m.itemCode) ?? 0) + effect(m))
  }
  return out
}

/** Total of صرف quantities per item. Reversals (تسوية) never reduce it. */
export function issuedTotals(movements: readonly LedgerRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of movements) {
    if (m.type === MOVEMENT_TYPES.ISSUE) {
      out.set(m.itemCode, (out.get(m.itemCode) ?? 0) + m.qty)
    }
  }
  return out
}

/** Earliest expiry first; batches with no expiry, then the unspecified bucket, last. */
function compareBatches(a: BatchBalance, b: BatchBalance): number {
  if (a.batchNo === null && b.batchNo !== null) return 1
  if (b.batchNo === null && a.batchNo !== null) return -1
  if (a.expiry !== b.expiry) {
    if (a.expiry === null) return 1
    if (b.expiry === null) return -1
    return a.expiry < b.expiry ? -1 : 1
  }
  return (a.batchNo ?? '').localeCompare(b.batchNo ?? '')
}

export function batchBalances(movements: readonly LedgerRow[], itemCode: string): BatchBalance[] {
  const groups = new Map<
    string,
    { batchNo: string | null; expiry: string | null; balance: number }
  >()
  for (const m of movements) {
    if (m.itemCode !== itemCode) continue
    const key = `${m.batchNo ?? ''}\u0000${m.expiry ?? ''}`
    const prev = groups.get(key)
    groups.set(key, {
      batchNo: m.batchNo,
      expiry: m.expiry,
      balance: (prev?.balance ?? 0) + effect(m),
    })
  }
  return [...groups.values()]
    .map((g) => ({ ...g, label: g.batchNo ?? UNSPECIFIED_BATCH_LABEL }))
    .sort(compareBatches)
}

export interface ReversalContext {
  readonly reason: string
  readonly businessDate: string
  readonly deviceId: string
  readonly createdBy: string
  readonly source: MovementSource
}

export type ReversibleMovement = LedgerRow & Pick<Movement, 'priceMinor'> & { readonly id: string }

/**
 * A reversal is a تسوية with the negated effect of the original (same item, batch and
 * price), `reverses` set, and the deterministic id `rev-{id}`.
 */
export function buildReversal(
  original: ReversibleMovement,
  ctx: ReversalContext,
): { id: string; data: NewMovement } {
  const reason = ctx.reason.trim()
  if (reason === '') throw new Error('A reversal needs a reason')
  return {
    id: `rev-${original.id}`,
    data: {
      type: MOVEMENT_TYPES.ADJUST,
      itemCode: original.itemCode,
      qty: -effect(original),
      businessDate: ctx.businessDate,
      priceMinor: original.priceMinor,
      batchNo: original.batchNo,
      expiry: original.expiry,
      docNumber: null,
      reference: null,
      note: null,
      supplier: null,
      source: ctx.source,
      substituteFor: null,
      reverses: original.id,
      reason,
      deviceId: ctx.deviceId,
      createdBy: ctx.createdBy,
    },
  }
}
