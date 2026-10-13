import { describe, expect, it } from 'vitest'
import {
  buildManualMovement,
  suggestSettlement,
  validateManual,
  type ManualInput,
} from '../../../src/domain/adjust'
import {
  MAX_BATCH_WRITES,
  movementsOfDocument,
  planIssueCancel,
  planReceiptCancel,
  priceRestores,
  type CancelOutcome,
  type CancelPlan,
  type StoredMovement,
} from '../../../src/domain/cancel'
import { toPostBatch as toIssueBatch } from '../../../src/domain/issue'
import { addRequested, addSubstitute } from '../../../src/domain/issueEdit'
import { batchBalances, effect, itemBalances } from '../../../src/domain/ledger'
import { toPostBatch as toReceiptBatch, type PlannedMovement } from '../../../src/domain/receipt'
import { draftOf, priced, stockOf } from '../../helpers/issueFixtures'
import { ITEM_A, ITEM_B, TODAY, draftWith, goodLine } from '../../helpers/receiptFixtures'

const POSTED = { uid: 'owner', deviceId: 'dev' }

/** A planned movement as the ledger holds it once posted. */
function stored(m: PlannedMovement): StoredMovement {
  return { ...m.data, id: m.id }
}

function mustPlan(outcome: CancelOutcome): CancelPlan {
  if (!outcome.ok) throw new Error(`expected a plan, got ${outcome.problem.code}`)
  return outcome.plan
}

const base = (movements: readonly StoredMovement[], expectedMovements: number) => ({
  docId: 'r1',
  status: 'posted' as const,
  reason: 'استلام بالغلط',
  today: TODAY,
  ...POSTED,
  movements,
  expectedMovements,
})

describe('receipt cancel', () => {
  // Line 1 changes ITEM_A's price (1250 -> 1500), line 2 counts nothing, line 3 keeps ITEM_B's.
  const draft = draftWith([
    goodLine(1, ITEM_A, { countedQty: 5, invoicedQty: 5, priceMinor: 1500, prevPriceMinor: 1250 }),
    goodLine(2, ITEM_B, { countedQty: 0, invoicedQty: 4, diffReason: 'لم يصل' }),
    goodLine(3, ITEM_B, { countedQty: 3, invoicedQty: 3, scannedGtin: '6009999999991' }),
  ])
  const posted = toReceiptBatch(draft, {
    id: 'r1',
    items: [
      { code: ITEM_A.code, priceMinor: 1250, gtins: [] },
      { code: ITEM_B.code, priceMinor: 800, gtins: [] },
    ],
    ...POSTED,
  })
  const movements = posted.movements.map(stored)
  const items = [
    { code: ITEM_A.code, priceMinor: 1500 },
    { code: ITEM_B.code, priceMinor: 800 },
  ]
  const input = { ...base(movements, 2), priceUpdates: posted.priceUpdates, items }

  it('reverses every movement the receipt wrote, and nothing for a line that counted 0', () => {
    expect(posted.movements.map((m) => m.id)).toEqual(['r1-L1', 'r1-L3'])
    const plan = mustPlan(planReceiptCancel(input))
    expect(plan.reversals.map((r) => r.id)).toEqual(['rev-r1-L1', 'rev-r1-L3'])
    const [first, second] = plan.reversals.map((r) => r.data)
    expect(first).toMatchObject({
      type: 'تسوية',
      itemCode: ITEM_A.code,
      qty: -5,
      reverses: 'r1-L1',
      reason: 'استلام بالغلط',
      priceMinor: 1500,
      batchNo: 'B1',
      businessDate: TODAY,
      source: { kind: 'receipt', id: 'r1' },
    })
    expect(second).toMatchObject({ qty: -3, reverses: 'r1-L3' })
  })

  it('brings every balance back to what it was before the receipt', () => {
    const plan = mustPlan(planReceiptCancel(input))
    const after = [...movements, ...plan.reversals.map(stored)]
    expect(itemBalances(after).get(ITEM_A.code)).toBe(0)
    expect(itemBalances(after).get(ITEM_B.code)).toBe(0)
    expect(batchBalances(after, ITEM_A.code).every((b) => b.balance === 0)).toBe(true)
  })

  it('restores the price while the item still holds the price the receipt set', () => {
    const plan = mustPlan(planReceiptCancel(input))
    expect(plan.priceRestores).toEqual([{ itemCode: ITEM_A.code, priceMinor: 1250 }])
  })

  it('keeps the current price when a later receipt changed it again', () => {
    const later = [{ code: ITEM_A.code, priceMinor: 1700 }, items[1]!]
    const plan = mustPlan(planReceiptCancel({ ...input, items: later }))
    expect(plan.priceRestores).toEqual([])
  })

  it('never touches a GTIN link: the plan has no item write but the price', () => {
    const plan = mustPlan(planReceiptCancel(input))
    expect(Object.keys(plan).sort()).toEqual(['patch', 'priceRestores', 'reversals'])
    for (const restore of plan.priceRestores) {
      expect(Object.keys(restore).sort()).toEqual(['itemCode', 'priceMinor'])
    }
  })

  it('sets exactly the status and the reason on the document', () => {
    const plan = mustPlan(planReceiptCancel({ ...input, reason: '  اتكرر  ' }))
    expect(plan.patch).toEqual({ status: 'cancelled', cancelReason: 'اتكرر' })
  })

  it('priceRestores skips an update that changed nothing and an unknown item', () => {
    expect(
      priceRestores(
        [
          { itemCode: 'A', fromMinor: 5, toMinor: 5 },
          { itemCode: 'GONE', fromMinor: 1, toMinor: 2 },
        ],
        [{ code: 'A', priceMinor: 5 }],
      ),
    ).toEqual([])
  })
})

describe('issue cancel', () => {
  const A = priced('SCR-01', 1000)
  const S = priced('SCR-02', 1200)
  const stock = stockOf([
    { code: 'SCR-01', qty: 4, batchNo: 'B1', expiry: '2028-01' },
    { code: 'SCR-02', qty: 5, batchNo: 'S1', expiry: '2028-03' },
  ])
  // 6 asked of SCR-01 (4 in stock), 2 covered by the substitute SCR-02.
  const draft = addSubstitute(addRequested(draftOf(), A, 6, stock), 'SCR-01', 'SCR-02', 2, stock)
  const posted = toIssueBatch(draft, { id: 'b1', items: [A, S], ...POSTED })
  const movements = posted.movements.map(stored)
  const input = { ...base(movements, 2), docId: 'b1' }

  it('reverses each issue movement, the substitute with + on the substitute item', () => {
    const plan = mustPlan(planIssueCancel(input))
    expect(plan.reversals.map((r) => r.id)).toEqual(['rev-b1-L1', 'rev-b1-L2'])
    expect(plan.reversals[0]?.data).toMatchObject({
      type: 'تسوية',
      itemCode: 'SCR-01',
      qty: 4,
      priceMinor: 1000,
      batchNo: 'B1',
      reverses: 'b1-L1',
      source: { kind: 'issue', id: 'b1' },
    })
    expect(plan.reversals[1]?.data).toMatchObject({ itemCode: 'SCR-02', qty: 2, priceMinor: 1200 })
    expect(plan.priceRestores).toEqual([])
  })

  it('returns both balances, and each reversal cancels the effect of its original', () => {
    const plan = mustPlan(planIssueCancel(input))
    const reversals = plan.reversals.map(stored)
    movements.forEach((m, i) => expect(effect(m) + effect(reversals[i]!)).toBe(0))
  })

  it('leaves the issued total of the movements alone: a reversal is a تسوية', () => {
    const plan = mustPlan(planIssueCancel(input))
    expect(plan.reversals.every((r) => r.data.type === 'تسوية')).toBe(true)
  })
})

describe('what a cancel refuses', () => {
  const draft = draftWith([goodLine(1, ITEM_A, { countedQty: 2, invoicedQty: 2 })])
  const posted = toReceiptBatch(draft, {
    id: 'r1',
    items: [{ code: ITEM_A.code, priceMinor: 1250, gtins: [] }],
    ...POSTED,
  })
  const movements = posted.movements.map(stored)
  const input = { ...base(movements, 1), priceUpdates: [], items: [] }
  const code = (outcome: CancelOutcome): string => (outcome.ok ? 'ok' : outcome.problem.code)

  it('refuses a blank reason', () => {
    expect(code(planReceiptCancel({ ...input, reason: '   ' }))).toBe('no-reason')
    expect(code(planIssueCancel({ ...input, reason: '' }))).toBe('no-reason')
  })

  it('refuses a second cancel and a draft', () => {
    const cancelled = planReceiptCancel({ ...input, status: 'cancelled' })
    expect(code(cancelled)).toBe('not-posted')
    expect(!cancelled.ok && cancelled.problem.message).toContain('اتلغى')
    expect(code(planReceiptCancel({ ...input, status: 'draft' }))).toBe('not-posted')
  })

  it('refuses when the movements of the document have not all loaded', () => {
    expect(code(planReceiptCancel({ ...input, movements: [] }))).toBe('incomplete')
    expect(code(planReceiptCancel({ ...input, expectedMovements: 2 }))).toBe('incomplete')
  })

  it('refuses a movement that was already reversed', () => {
    const plan = mustPlan(planReceiptCancel(input))
    const withReversal = [...movements, ...plan.reversals.map(stored)]
    expect(code(planReceiptCancel({ ...input, movements: withReversal }))).toBe('already-reversed')
  })

  it('ignores the movements of other documents and the reversals of this one', () => {
    const other: StoredMovement = {
      ...movements[0]!,
      id: 'x-L1',
      source: { kind: 'receipt', id: 'x' },
    }
    const plan = mustPlan(planReceiptCancel(input))
    const all = [...movements, other, ...plan.reversals.map(stored)]
    expect(movementsOfDocument(all, 'receipt', 'r1').map((m) => m.id)).toEqual(['r1-L1'])
    expect(movementsOfDocument(all, 'issue', 'r1')).toEqual([])
  })

  it('refuses a batch that would not fit in one atomic write', () => {
    const many = Array.from({ length: MAX_BATCH_WRITES }, (_, i) => ({
      ...movements[0]!,
      id: `r1-L${i + 1}`,
    }))
    expect(
      code(planReceiptCancel({ ...input, movements: many, expectedMovements: many.length })),
    ).toBe('too-large')
  })
})

describe('return and adjustment', () => {
  const ctx = { today: TODAY, uid: 'owner', deviceId: 'dev' }
  const manual = (over: Partial<ManualInput> = {}): ManualInput => ({
    kind: 'return',
    itemCode: 'SCR-01',
    qty: 3,
    batchNo: 'B1',
    expiry: '2028-01',
    priceMinor: 1250,
    reason: 'رجع من المندوب',
    businessDate: TODAY,
    ...over,
  })

  it('builds a مرتجع that adds stock, as a manual entry with its reason', () => {
    const movement = buildManualMovement(manual(), ctx)
    expect(movement).toMatchObject({
      type: 'مرتجع',
      qty: 3,
      source: { kind: 'manual', id: null },
      reason: 'رجع من المندوب',
      reverses: null,
      batchNo: 'B1',
      priceMinor: 1250,
    })
    expect(effect(movement)).toBe(3)
  })

  it('builds a signed تسوية either way', () => {
    const up = buildManualMovement(manual({ kind: 'adjust', qty: 4 }), ctx)
    const down = buildManualMovement(manual({ kind: 'adjust', qty: -2 }), ctx)
    expect([up.type, effect(up)]).toEqual(['تسوية', 4])
    expect([down.type, effect(down)]).toEqual(['تسوية', -2])
  })

  it('trims the reason', () => {
    expect(buildManualMovement(manual({ reason: '  جرد  ' }), ctx).reason).toBe('جرد')
  })

  it('needs a reason', () => {
    expect(validateManual(manual({ reason: '  ' }), TODAY).map((p) => p.code)).toEqual(['reason'])
    expect(() => buildManualMovement(manual({ reason: '' }), ctx)).toThrow()
  })

  it('refuses a return of 0 or below, an adjustment of 0, and a fraction', () => {
    expect(validateManual(manual({ qty: 0 }), TODAY).map((p) => p.code)).toEqual(['qty'])
    expect(validateManual(manual({ qty: -1 }), TODAY).map((p) => p.code)).toEqual(['qty'])
    expect(validateManual(manual({ kind: 'adjust', qty: 0 }), TODAY).map((p) => p.code)).toEqual([
      'qty',
    ])
    expect(validateManual(manual({ kind: 'adjust', qty: 1.5 }), TODAY).map((p) => p.code)).toEqual([
      'qty',
    ])
    expect(validateManual(manual({ kind: 'adjust', qty: -1 }), TODAY)).toEqual([])
  })

  it('refuses a date in the future or a malformed one', () => {
    expect(validateManual(manual({ businessDate: '2026-10-13' }), TODAY)[0]?.code).toBe('date')
    expect(validateManual(manual({ businessDate: '13/10/2026' }), TODAY)[0]?.code).toBe('date')
  })
})

describe('suggestSettlement', () => {
  const batches = batchBalances(
    [
      { type: 'إضافة', qty: 4, itemCode: 'A', batchNo: 'N1', expiry: '2027-01' },
      { type: 'صرف', qty: 6, itemCode: 'A', batchNo: 'N2', expiry: '2028-01' },
      { type: 'صرف', qty: 1, itemCode: 'A', batchNo: null, expiry: null },
    ],
    'A',
  )

  it('adds the shortfall to the batch that is below zero, not to the item as a whole', () => {
    // Balance 4 - 6 - 1 = -3, but the deepest batch is N2 at -6.
    expect(suggestSettlement(batches, -3)).toEqual({ qty: 6, batchNo: 'N2', expiry: '2028-01' })
  })

  it('suggests nothing when the item is not below zero', () => {
    expect(suggestSettlement(batches, 0)).toBeNull()
    expect(suggestSettlement(batches, 5)).toBeNull()
  })

  it('falls back to the unspecified batch when no single batch is negative', () => {
    expect(suggestSettlement([], -2)).toEqual({ qty: 2, batchNo: null, expiry: null })
  })
})
