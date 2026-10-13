import { describe, expect, it } from 'vitest'
import {
  coverage,
  draftTotals,
  nextBatchNumber,
  postedTotals,
  toDraftDoc,
  toMovements,
  toPostBatch,
  validateForPost,
  type BatchProblemCode,
  type IssueDraft,
} from '../../../src/domain/issue'
import {
  addRequested,
  addSubstitute,
  issueNegative,
  setItemReason,
} from '../../../src/domain/issueEdit'
import { MOVEMENT_TYPES } from '../../../src/domain/types'
import { draftOf, priced, stockOf, TODAY } from '../../helpers/issueFixtures'

const A = priced('AAA-01', 1000)
const B = priced('BBB-01', 250)
const S = priced('SUB-01', 1100)
const ITEMS = [A, B, S]

const stock = stockOf([
  { code: 'AAA-01', qty: 4, batchNo: 'B1', expiry: '2028-01' },
  { code: 'BBB-01', qty: 30, batchNo: 'C1', expiry: '2029-01' },
  { code: 'SUB-01', qty: 5, batchNo: 'S1', expiry: '2028-03' },
])
const ctx = { today: TODAY, stock }
const postCtx = { id: 'b1', items: ITEMS, uid: 'owner', deviceId: 'dev' }
const codes = (d: IssueDraft, c = ctx): BatchProblemCode[] =>
  validateForPost(d, c).map((p) => p.code)

/** 6 of A (4 in stock) and 24 of B: the short-by-2 case of the independent test. */
function shortDraft(): IssueDraft {
  let d = addRequested(draftOf(), B, 24, stock)
  d = addRequested(d, A, 6, stock)
  return d
}

describe('coverage check (FR-042 / post rule 1)', () => {
  it('a short item is uncovered until a substitute, a negative issue or a lower quantity', () => {
    const d = shortDraft()
    expect(coverage(d).find((c) => c.itemCode === 'AAA-01')).toMatchObject({
      requestedQty: 6,
      directQty: 4,
      substituteQty: 0,
      shortQty: 2,
    })
    expect(codes(d)).toContain('uncovered')

    const withSub = addSubstitute(d, 'AAA-01', 'SUB-01', 2, stock)
    expect(codes(withSub)).not.toContain('uncovered')

    const negative = issueNegative(d, 'AAA-01', 'مستعجل', stock)
    expect(codes(negative)).toEqual([])
  })

  it('issuing more than was requested blocks posting', () => {
    const d = addRequested(draftOf(), B, 2, stock)
    const over = { ...d, issued: d.issued.map((l) => ({ ...l, qty: 3 })) }
    expect(codes(over)).toContain('over-issued')
  })

  it('a line for an item nobody requested is refused', () => {
    const d = addRequested(draftOf(), B, 2, stock)
    const stray = { ...d, issued: [...d.issued, { ...d.issued[0]!, n: 2, itemCode: 'AAA-01' }] }
    expect(codes(stray)).toContain('bad-line')
  })
})

describe('a negative issue needs a reason (FR-044)', () => {
  it('asks for it, and stops asking once the item has one', () => {
    const noReason = addRequested(draftOf(), A, 6, stock)
    // Force the overflow without a reason, as a batch change or a sync would.
    const raw = {
      ...noReason,
      issued: noReason.issued.map((l) => ({ ...l, qty: 6 })),
    }
    expect(codes(raw)).toContain('negative-reason')
    expect(codes(setItemReason(raw, 'AAA-01', 'مستعجل'))).not.toContain('negative-reason')
  })

  it('a blank reason does not count', () => {
    const d = issueNegative(addRequested(draftOf(), A, 6, stock), 'AAA-01', 'x', stock)
    expect(codes(setItemReason(d, 'AAA-01', '   '))).toContain('negative-reason')
  })

  it('sums issued quantity per item: two lines within the balance, not together', () => {
    const base = addRequested(draftOf(), A, 4, stock)
    const line = base.issued[0]!
    const split = {
      ...base,
      requested: [{ itemCode: 'AAA-01', qty: 6, priceMinor: 1000 }],
      issued: [
        { ...line, qty: 3 },
        { ...line, n: 2, qty: 3 },
      ],
    }
    expect(codes(split)).toEqual(['negative-reason'])
  })

  it('sums per batch: the item has stock, but not in the batch the lines use', () => {
    const twoBatches = stockOf([
      { code: 'AAA-01', qty: 3, batchNo: 'B1', expiry: '2028-01' },
      { code: 'AAA-01', qty: 9, batchNo: 'B2', expiry: '2029-01' },
    ])
    const d = addRequested(draftOf(), A, 5, twoBatches)
    const line = d.issued[0]!
    const only = { ...d, issued: [{ ...line, batchNo: 'B1', expiry: '2028-01', qty: 5 }] }
    expect(validateForPost(only, { today: TODAY, stock: twoBatches }).map((p) => p.code)).toEqual([
      'negative-reason',
    ])
  })

  it('a substitute that also serves a second item can pass line by line and still go negative', () => {
    const tight = stockOf([
      { code: 'AAA-01', qty: 0 },
      { code: 'BBB-01', qty: 0 },
      { code: 'SUB-01', qty: 3, batchNo: 'S1', expiry: '2028-03' },
    ])
    let d = addRequested(addRequested(draftOf(), A, 2, tight), B, 2, tight)
    d = addSubstitute(d, 'AAA-01', 'SUB-01', 2, tight)
    d = addSubstitute(d, 'BBB-01', 'SUB-01', 1, tight)
    // 2 + 1 fits the 3 in stock; push the second request to 2 as a stale draft would.
    const stale = {
      ...d,
      issued: d.issued.map((l) => (l.forItemCode === 'BBB-01' ? { ...l, qty: 2 } : l)),
    }
    const found = validateForPost(stale, { today: TODAY, stock: tight }).map((p) => p.code)
    expect(found).toContain('negative-reason')
  })
})

describe('header checks', () => {
  const ready = (): IssueDraft => addRequested(draftOf(), B, 2, stock)

  it('a ready draft has no problems', () => {
    expect(codes(ready())).toEqual([])
  })

  it('needs at least one requested line', () => {
    expect(codes(draftOf())).toEqual(['no-lines'])
  })

  it('needs the representative name', () => {
    expect(codes({ ...ready(), rep: '  ' })).toEqual(['no-rep'])
  })

  it('permit numbers are digits only', () => {
    expect(codes({ ...ready(), permits: ['1001', '10x1'] })).toEqual(['bad-permit'])
  })

  it('a business date in the future is rejected', () => {
    expect(codes({ ...ready(), businessDate: '2026-10-13' })).toEqual(['future-date'])
    expect(codes({ ...ready(), businessDate: TODAY })).toEqual([])
  })

  it('a business date that is not a real day is rejected', () => {
    expect(codes({ ...ready(), businessDate: '2026-02-31' })).toEqual(['bad-date'])
    expect(codes({ ...ready(), businessDate: 'امبارح' })).toEqual(['bad-date'])
  })
})

describe('local sequential numbering (R10)', () => {
  it('is the highest number seen plus one, and 1 for the first batch', () => {
    expect(nextBatchNumber([])).toBe(1)
    expect(nextBatchNumber([{ number: 3 }, { number: 13 }, { number: 7 }])).toBe(14)
  })

  it('counts cancelled batches too, so a number that may already be printed is never reused', () => {
    const all = [
      { number: 2, status: 'posted' },
      { number: 9, status: 'cancelled' },
    ]
    expect(nextBatchNumber(all)).toBe(10)
  })
})

describe('toMovements', () => {
  function posted(): IssueDraft {
    const d = shortDraft()
    return addSubstitute(d, 'AAA-01', 'SUB-01', 2, stock)
  }

  it('writes one صرف per issued line with the batch reference and the substitute link', () => {
    const moves = toMovements(posted(), postCtx)
    expect(moves.map((m) => m.id)).toEqual(['b1-L1', 'b1-L2', 'b1-L3'])
    const [b, a, sub] = moves
    expect(b?.data).toMatchObject({
      type: MOVEMENT_TYPES.ISSUE,
      itemCode: 'BBB-01',
      qty: 24,
      reference: 'دفعة 14',
      substituteFor: null,
      source: { kind: 'issue', id: 'b1' },
      businessDate: TODAY,
      createdBy: 'owner',
      deviceId: 'dev',
    })
    expect(a?.data).toMatchObject({ itemCode: 'AAA-01', qty: 4, batchNo: 'B1', expiry: '2028-01' })
    expect(sub?.data).toMatchObject({
      itemCode: 'SUB-01',
      qty: 2,
      substituteFor: { itemCode: 'AAA-01', qty: 2 },
      reference: 'دفعة 14',
      priceMinor: 1100,
    })
  })

  it('the requested item is untouched by the substitute: no movement carries it for 2', () => {
    const moves = toMovements(posted(), postCtx)
    const forA = moves.filter((m) => m.data.itemCode === 'AAA-01')
    expect(forA.map((m) => m.data.qty)).toEqual([4])
  })

  it('carries the permit numbers and the negative reason', () => {
    const d = issueNegative(shortDraft(), 'AAA-01', 'مستعجل', stock)
    const moves = toMovements({ ...d, permits: ['1001', '1002'] }, postCtx)
    const a = moves.find((m) => m.data.itemCode === 'AAA-01')
    expect(a?.data.reason).toBe('مستعجل')
    expect(a?.data.docNumber).toBe('1001 - 1002')
  })

  it('stamps the price at posting on every movement', () => {
    const moves = toMovements(posted(), postCtx)
    expect(moves.map((m) => m.data.priceMinor)).toEqual([250, 1000, 1100])
  })

  it('refuses a line whose item is unknown', () => {
    expect(() => toMovements(posted(), { ...postCtx, items: [A] })).toThrow(/BBB-01/)
  })
})

describe('totals from prices at posting (FR-045)', () => {
  const covered = (): IssueDraft => addSubstitute(shortDraft(), 'AAA-01', 'SUB-01', 2, stock)

  it('requested, issued and difference come from the item prices', () => {
    // requested: 24 x 250 + 6 x 1000 = 12000. issued: 24 x 250 + 4 x 1000 + 2 x 1100 = 12200.
    expect(draftTotals(covered(), (c) => ITEMS.find((i) => i.code === c)?.priceMinor ?? 0)).toEqual(
      { requestedMinor: 12_000, issuedMinor: 12_200, differenceMinor: 200 },
    )
  })

  it('the posted batch snapshots the prices and its totals ignore a later price change', () => {
    const batch = toPostBatch(covered(), postCtx)
    expect(batch.patch).toMatchObject({
      status: 'posted',
      requestedValueMinor: 12_000,
      issuedValueMinor: 12_200,
    })
    expect(batch.patch.requested).toEqual([
      { itemCode: 'BBB-01', qty: 24, priceMinor: 250 },
      { itemCode: 'AAA-01', qty: 6, priceMinor: 1000 },
    ])

    const stored = { ...toDraftDoc(covered()), ...batch.patch }
    const before = postedTotals(stored)

    // A later receipt raises every price by half. The posted totals are the stored ones.
    const later = ITEMS.map((i) => ({ ...i, priceMinor: Math.round(i.priceMinor * 1.5) }))
    expect(postedTotals(stored)).toEqual(before)
    expect(before).toEqual({ requestedMinor: 12_000, issuedMinor: 12_200, differenceMinor: 200 })
    // Only a draft follows live prices; the movements already written keep theirs.
    expect(
      draftTotals(covered(), (c) => later.find((i) => i.code === c)?.priceMinor ?? 0).issuedMinor,
    ).toBe(18_300)
    expect(batch.movements.map((m) => m.data.priceMinor)).toEqual([250, 1000, 1100])
  })

  it('a draft that was saved with an older price is re-snapshotted at posting', () => {
    const d = covered()
    const stale = { ...d, requested: d.requested.map((r) => ({ ...r, priceMinor: 1 })) }
    const batch = toPostBatch(stale, postCtx)
    expect(batch.patch.requested.map((r) => r.priceMinor)).toEqual([250, 1000])
  })
})

describe('the draft document', () => {
  it('writes only fields the rules accept, as a draft', () => {
    const doc = toDraftDoc(addRequested(draftOf(), B, 2, stock))
    expect(Object.keys(doc).sort()).toEqual(
      [
        'cancelReason',
        'cancelledAt',
        'businessDate',
        'issued',
        'issuedValueMinor',
        'number',
        'permits',
        'postedAt',
        'rep',
        'requested',
        'requestedValueMinor',
        'status',
      ].sort(),
    )
    expect(doc).toMatchObject({ status: 'draft', postedAt: null, cancelledAt: null, number: 14 })
  })
})
