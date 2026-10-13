import { describe, expect, it } from 'vitest'
import {
  addRequested,
  addSubstitute,
  aggregateRequested,
  issueNegative,
  parsePermit,
  removeRequested,
  removeSubstitute,
  setItemReason,
  setLineBatch,
  setRequestedQty,
} from '../../../src/domain/issueEdit'
import { allocateFefo, linesNeedingReason } from '../../../src/domain/issueStock'
import { draftOf, priced, stockOf } from '../../helpers/issueFixtures'

const A = priced('AAA-01', 1000)
const stock = stockOf([
  { code: 'AAA-01', qty: 3, batchNo: 'OLD', expiry: '2027-01' },
  { code: 'AAA-01', qty: 10, batchNo: 'NEW', expiry: '2029-06' },
  { code: 'SUB-01', qty: 5, batchNo: 'S1', expiry: '2028-01' },
])
const shortStock = stockOf([{ code: 'AAA-01', qty: 4, batchNo: 'B1', expiry: '2028-01' }])
const withSub = (subQty: number) =>
  stockOf([
    { code: 'AAA-01', qty: 4, batchNo: 'B1', expiry: '2028-01' },
    { code: 'SUB-01', qty: subQty, batchNo: 'S1', expiry: '2028-01' },
  ])

describe('aggregation per item (FR-041)', () => {
  it('merges the same item into one line and sums its quantity', () => {
    const merged = aggregateRequested([
      { itemCode: 'AAA-01', qty: 2, priceMinor: 1000 },
      { itemCode: 'BBB-01', qty: 1, priceMinor: 500 },
      { itemCode: 'AAA-01', qty: 4, priceMinor: 1000 },
    ])
    expect(merged).toEqual([
      { itemCode: 'AAA-01', qty: 6, priceMinor: 1000 },
      { itemCode: 'BBB-01', qty: 1, priceMinor: 500 },
    ])
  })

  it('adding the same item from a second permit raises the one line', () => {
    let draft = addRequested(draftOf(), A, 2, stock)
    draft = addRequested(draft, A, 3, stock)
    expect(draft.requested).toEqual([{ itemCode: 'AAA-01', qty: 5, priceMinor: 1000 }])
  })

  it('ignores a quantity that is not a positive whole number', () => {
    const base = draftOf()
    expect(addRequested(base, A, 0, stock)).toBe(base)
    expect(addRequested(base, A, -2, stock)).toBe(base)
    expect(addRequested(base, A, 1.5, stock)).toBe(base)
  })

  it('does not mutate the draft it is given', () => {
    const base = draftOf()
    addRequested(base, A, 2, stock)
    expect(base.requested).toEqual([])
    expect(base.issued).toEqual([])
  })
})

describe('FEFO default batch (FR-046)', () => {
  it('issues from the earliest-expiring batch first and stores it on the line', () => {
    const draft = addRequested(draftOf(), A, 2, stock)
    expect(draft.issued).toEqual([
      {
        n: 1,
        itemCode: 'AAA-01',
        qty: 2,
        batchNo: 'OLD',
        expiry: '2027-01',
        forItemCode: null,
        negativeReason: null,
      },
    ])
  })

  it('spills into the next batch when the earliest one runs out', () => {
    const draft = addRequested(draftOf(), A, 5, stock)
    expect(draft.issued.map((l) => [l.batchNo, l.qty])).toEqual([
      ['OLD', 3],
      ['NEW', 2],
    ])
  })

  it('skips batches with no stock', () => {
    const empty = stockOf([
      { code: 'AAA-01', qty: 2, batchNo: 'OLD', expiry: '2027-01' },
      { code: 'AAA-01', qty: 2, batchNo: 'OLD', expiry: '2027-01', issued: true },
      { code: 'AAA-01', qty: 6, batchNo: 'NEW', expiry: '2029-06' },
    ])
    const draft = addRequested(draftOf(), A, 1, empty)
    expect(draft.issued.map((l) => l.batchNo)).toEqual(['NEW'])
  })

  it('the user can change the batch of a line', () => {
    const draft = addRequested(draftOf(), A, 2, stock)
    const moved = setLineBatch(draft, 1, { batchNo: 'NEW', expiry: '2029-06' }, stock)
    expect(moved.issued[0]).toMatchObject({ batchNo: 'NEW', expiry: '2029-06', qty: 2 })
  })

  it('allocateFefo caps at stock unless overflow is allowed', () => {
    const batches = stock.batches('AAA-01')
    expect(allocateFefo(batches, 20, false).reduce((s, p) => s + p.qty, 0)).toBe(13)
    expect(allocateFefo(batches, 20, true).reduce((s, p) => s + p.qty, 0)).toBe(20)
    expect(allocateFefo([], 2, true)).toEqual([{ batchNo: null, expiry: null, qty: 2 }])
    expect(allocateFefo([], 2, false)).toEqual([])
  })
})

describe('a short item', () => {
  it('issues what is there and leaves the rest uncovered', () => {
    const draft = addRequested(draftOf(), A, 6, shortStock)
    expect(draft.issued.map((l) => l.qty)).toEqual([4])
    expect(draft.requested[0]?.qty).toBe(6)
  })

  it('a substitute is issued from the substitute item, tagged with the requested one', () => {
    const both = withSub(5)
    let draft = addRequested(draftOf(), A, 6, both)
    draft = addSubstitute(draft, 'AAA-01', 'SUB-01', 2, both)
    expect(draft.issued.map((l) => [l.itemCode, l.qty, l.forItemCode])).toEqual([
      ['AAA-01', 4, null],
      ['SUB-01', 2, 'AAA-01'],
    ])
    expect(draft.issued[1]).toMatchObject({
      batchNo: 'S1',
      expiry: '2028-01',
      negativeReason: null,
    })
  })

  it('a substitute is capped at the shortage and at the substitute stock', () => {
    const both = withSub(1)
    let draft = addRequested(draftOf(), A, 6, both)
    draft = addSubstitute(draft, 'AAA-01', 'SUB-01', 9, both)
    expect(draft.issued.find((l) => l.itemCode === 'SUB-01')?.qty).toBe(1)
    // The substitute has nothing left, so a second pick changes nothing.
    expect(addSubstitute(draft, 'AAA-01', 'SUB-01', 1, both)).toBe(draft)
  })

  it('removing a substitute restores the shortage', () => {
    const both = withSub(5)
    let draft = addRequested(draftOf(), A, 6, both)
    draft = addSubstitute(draft, 'AAA-01', 'SUB-01', 2, both)
    draft = removeSubstitute(draft, 'AAA-01', 'SUB-01', both)
    expect(draft.issued.map((l) => l.itemCode)).toEqual(['AAA-01'])
  })

  it('lowering the requested quantity shrinks the issued lines', () => {
    let draft = addRequested(draftOf(), A, 5, stock)
    draft = setRequestedQty(draft, 'AAA-01', 2, stock)
    expect(draft.issued.map((l) => [l.batchNo, l.qty])).toEqual([['OLD', 2]])
    expect(draft.requested[0]?.qty).toBe(2)
  })

  it('removing a requested item drops its lines and its substitutes', () => {
    const both = withSub(5)
    let draft = addRequested(draftOf(), A, 6, both)
    draft = addSubstitute(draft, 'AAA-01', 'SUB-01', 2, both)
    draft = removeRequested(draft, 'AAA-01')
    expect(draft.requested).toEqual([])
    expect(draft.issued).toEqual([])
  })
})

describe('issuing beyond the balance', () => {
  it('a negative issue covers the shortage from the item itself and carries the reason', () => {
    let draft = addRequested(draftOf(), A, 6, shortStock)
    draft = issueNegative(draft, 'AAA-01', 'مندوب مستعجل', shortStock)
    expect(draft.issued.reduce((s, l) => s + l.qty, 0)).toBe(6)
    expect(draft.issued.every((l) => l.negativeReason === 'مندوب مستعجل')).toBe(true)
  })

  it('a reason that is no longer needed is dropped when the quantity comes back within stock', () => {
    let draft = addRequested(draftOf(), A, 6, shortStock)
    draft = issueNegative(draft, 'AAA-01', 'مندوب مستعجل', shortStock)
    draft = setRequestedQty(draft, 'AAA-01', 3, shortStock)
    expect(draft.issued.map((l) => l.negativeReason)).toEqual([null])
  })

  it('setItemReason writes the reason on every line of the item', () => {
    let draft = addRequested(draftOf(), A, 5, stock)
    draft = setItemReason(draft, 'AAA-01', 'سبب')
    expect(draft.issued.map((l) => l.negativeReason)).toEqual(['سبب', 'سبب'])
  })
})

describe('the negative check sums per item and per batch', () => {
  const line = (n: number, qty: number, batchNo: string, forItemCode: string | null = null) => ({
    n,
    itemCode: 'AAA-01',
    qty,
    batchNo,
    expiry: null,
    forItemCode,
    negativeReason: null,
  })
  const one = stockOf([
    { code: 'AAA-01', qty: 5, batchNo: 'B1' },
    { code: 'AAA-01', qty: 5, batchNo: 'B2' },
  ])
  const flagged = (lines: ReturnType<typeof line>[]) => [...linesNeedingReason(lines, one)].sort()

  it('two lines that are each within the balance but not together need a reason', () => {
    expect(flagged([line(1, 4, 'B1'), line(2, 4, 'B1')])).toEqual([1, 2])
  })

  it('lines in different batches that fit their batches need none', () => {
    expect(flagged([line(1, 4, 'B1'), line(2, 4, 'B2')])).toEqual([])
  })

  it('one batch over its balance flags it even when the item as a whole has stock', () => {
    expect(flagged([line(1, 7, 'B1')])).toEqual([1])
  })

  it('a substitute serving two requested items counts against the substitute once', () => {
    expect(flagged([line(1, 3, 'B1', 'X-1'), line(2, 3, 'B1', 'Y-1')])).toEqual([1, 2])
  })

  it('a batch the ledger does not know has no stock', () => {
    expect(flagged([line(1, 1, 'GHOST')])).toEqual([1])
  })
})

describe('permit numbers', () => {
  it('keeps digits only; Arabic-Indic digits are converted', () => {
    expect(parsePermit('12345')).toBe('12345')
    expect(parsePermit(' ١٢٣ ')).toBe('123')
    expect(parsePermit('12a')).toBeNull()
    expect(parsePermit('')).toBeNull()
    expect(parsePermit('4 5')).toBeNull()
  })
})
