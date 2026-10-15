import { describe, expect, it } from 'vitest'
import { planPriceHeals } from '../../../src/data/priceHeal'
import { item, mov, ts } from '../../helpers/exportFixtures'

const T = (n: number): object => ts(1_760_000_000_000 + n * 1000)

/** A purchase: `bd` is its business date, `at` the order it reached the server. */
const buy = (id: string, bd: string, at: number, priceMinor: number, over = {}) =>
  mov({
    id,
    type: 'إضافة',
    itemCode: 'SCR-01',
    businessDate: bd,
    priceMinor,
    postedAt: T(at),
    source: { kind: 'receipt', id: `doc-${id}` },
    ...over,
  })

const itemAt = (priceMinor: number, at: number) => item('SCR-01', { priceMinor, updatedAt: T(at) })

describe('planPriceHeals: an older receipt that reached the server last', () => {
  // The laptop posted R2 (12 Oct, 150) online; the phone posted R1 (10 Oct, 120) offline and it
  // synced afterwards, so the item holds 120 although the latest purchase is 150.
  const r2 = buy('r2', '2026-10-12', 1, 15_000)
  const r1 = buy('r1', '2026-10-10', 5, 12_000)

  it('puts the latest purchase price back', () => {
    expect(planPriceHeals([itemAt(12_000, 5)], [r2, r1])).toEqual([
      { itemCode: 'SCR-01', priceMinor: 15_000 },
    ])
  })

  it('is settled once the price is the latest purchase price', () => {
    expect(planPriceHeals([itemAt(15_000, 6)], [r2, r1])).toEqual([])
  })

  it('leaves a price the owner set by hand after the late purchase', () => {
    expect(planPriceHeals([itemAt(12_000, 9)], [r2, r1])).toEqual([])
    expect(planPriceHeals([itemAt(13_000, 9)], [r2, r1])).toEqual([])
  })

  it('leaves a price that is not the late purchase price', () => {
    expect(planPriceHeals([itemAt(13_000, 5)], [r2, r1])).toEqual([])
  })

  it('does not count a cancelled purchase', () => {
    const cancelR2 = mov({
      id: 'rev-r2',
      type: 'تسوية',
      qty: -5,
      itemCode: 'SCR-01',
      reverses: 'r2',
      reason: 'غلط',
      postedAt: T(7),
      businessDate: '2026-10-13',
      source: { kind: 'manual', id: null },
    })
    // Only R1 is left: nothing to correct towards.
    expect(planPriceHeals([itemAt(12_000, 5)], [r2, r1, cancelR2])).toEqual([])
  })

  it('heals to the latest purchase that is still standing when the newest was cancelled', () => {
    const r3 = buy('r3', '2026-10-11', 2, 14_000)
    const cancelR2 = mov({
      id: 'rev-r2',
      type: 'تسوية',
      qty: -5,
      itemCode: 'SCR-01',
      reverses: 'r2',
      reason: 'غلط',
      postedAt: T(7),
      businessDate: '2026-10-13',
      source: { kind: 'manual', id: null },
    })
    expect(planPriceHeals([itemAt(12_000, 5)], [r2, r3, r1, cancelR2])).toEqual([
      { itemCode: 'SCR-01', priceMinor: 14_000 },
    ])
  })
})

describe('planPriceHeals: what it never touches', () => {
  it('needs two purchases', () => {
    expect(planPriceHeals([itemAt(12_000, 5)], [buy('r1', '2026-10-10', 5, 12_000)])).toEqual([])
    expect(planPriceHeals([itemAt(12_000, 5)], [])).toEqual([])
  })

  it('leaves purchases in order, whatever their prices', () => {
    const a = buy('a', '2026-10-10', 1, 12_000)
    const b = buy('b', '2026-10-12', 5, 15_000)
    expect(planPriceHeals([itemAt(15_000, 5)], [a, b])).toEqual([])
  })

  it('does not treat two lines of one receipt (same date, same post) as out of order', () => {
    const a = buy('a-L1', '2026-10-12', 5, 12_000)
    const b = buy('a-L2', '2026-10-12', 5, 15_000)
    expect(planPriceHeals([itemAt(15_000, 5)], [a, b])).toEqual([])
    expect(planPriceHeals([itemAt(12_000, 5)], [a, b])).toEqual([])
  })

  it('ignores movements that are not purchases: issues, returns, manual additions', () => {
    const r2 = buy('r2', '2026-10-12', 1, 15_000)
    const late = [
      buy('x1', '2026-10-10', 5, 12_000, { type: 'صرف' }),
      buy('x2', '2026-10-10', 5, 12_000, { type: 'مرتجع' }),
      buy('x3', '2026-10-10', 5, 12_000, { source: { kind: 'manual', id: null } }),
    ]
    expect(planPriceHeals([itemAt(12_000, 5)], [r2, ...late])).toEqual([])
  })

  it('counts imported purchases, which carry the item price they were imported with', () => {
    const imp = buy('imp-r5', '2026-08-01', 1, 12_000, {
      source: { kind: 'import', id: null, row: 5 },
    })
    const later = buy('r1', '2026-10-01', 2, 15_000)
    expect(planPriceHeals([itemAt(15_000, 2)], [imp, later])).toEqual([])
  })

  it('does nothing for an item whose update time is unknown', () => {
    const r2 = buy('r2', '2026-10-12', 1, 15_000)
    const r1 = buy('r1', '2026-10-10', 5, 12_000)
    const unknown = item('SCR-01', { priceMinor: 12_000, updatedAt: {} })
    expect(planPriceHeals([unknown], [r2, r1])).toEqual([])
  })

  it('works per item', () => {
    const r2 = buy('r2', '2026-10-12', 1, 15_000)
    const r1 = buy('r1', '2026-10-10', 5, 12_000)
    const other = buy('o1', '2026-10-10', 5, 500, { itemCode: 'SCR-02' })
    const items = [itemAt(12_000, 5), item('SCR-02', { priceMinor: 500, updatedAt: T(5) })]
    expect(planPriceHeals(items, [r2, r1, other])).toEqual([
      { itemCode: 'SCR-01', priceMinor: 15_000 },
    ])
  })
})
