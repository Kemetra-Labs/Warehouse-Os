import { describe, expect, it } from 'vitest'
import {
  formatDiffMinor,
  formatDiffPercent,
  rankSubstitutes,
} from '../../../src/domain/substitutes'
import { item } from '../../helpers/receiptFixtures'

const cat = (code: string, priceMinor: number, category = 'نخاعي') =>
  item(code, { priceMinor, category })

const balances = (map: Record<string, number>) => (code: string) => map[code] ?? 0
const codes = (r: readonly { item: { code: string } }[]) => r.map((c) => c.item.code)

describe('rankSubstitutes', () => {
  const target = cat('T-1', 1000)

  it('keeps same-category items that are in stock, and never the item itself', () => {
    const items = [
      target,
      cat('A-1', 1100),
      cat('A-2', 900),
      cat('OUT-1', 1000), // no balance
      cat('NEG-1', 1000), // negative balance
      cat('OTHER-1', 1000, 'غير ده'),
    ]
    const ranked = rankSubstitutes(
      target,
      items,
      balances({ 'T-1': 50, 'A-1': 5, 'A-2': 2, 'NEG-1': -3, 'OTHER-1': 9 }),
    )
    expect(codes(ranked).sort()).toEqual(['A-1', 'A-2'])
  })

  it('skips inactive items', () => {
    const items = [target, item('X-1', { priceMinor: 1000, category: 'نخاعي', active: false })]
    expect(rankSubstitutes(target, items, balances({ 'X-1': 4 }))).toEqual([])
  })

  it('orders by absolute price difference, then by larger balance, then by code', () => {
    const items = [
      cat('FAR', 2000),
      cat('NEAR-LOW', 900), // |-100|
      cat('NEAR-HIGH', 1100), // |+100|, more stock
      cat('EXACT', 1000),
      cat('TIE-B', 1300),
      cat('TIE-A', 1300),
    ]
    const ranked = rankSubstitutes(
      target,
      items,
      balances({ FAR: 5, 'NEAR-LOW': 2, 'NEAR-HIGH': 7, EXACT: 1, 'TIE-A': 3, 'TIE-B': 3 }),
    )
    expect(codes(ranked)).toEqual(['EXACT', 'NEAR-HIGH', 'NEAR-LOW', 'TIE-A', 'TIE-B', 'FAR'])
  })

  it('the all-categories toggle also lists other categories', () => {
    const items = [cat('A-1', 1100), cat('B-1', 1000, 'DHS')]
    const stock = balances({ 'A-1': 1, 'B-1': 1 })
    expect(codes(rankSubstitutes(target, items, stock))).toEqual(['A-1'])
    expect(codes(rankSubstitutes(target, items, stock, { allCategories: true }))).toEqual([
      'B-1',
      'A-1',
    ])
  })

  it('reports the price difference in piastres and percent, and the balance', () => {
    const [only] = rankSubstitutes(target, [cat('A-1', 1500)], balances({ 'A-1': 4 }))
    expect(only).toMatchObject({ diffMinor: 500, balance: 4 })
    expect(only?.diffPercent).toBeCloseTo(50)
  })

  // Prices from the workbook screen in docs/design/mockups/issue-flow.html (no NAL fixture is
  // committed: the workbook is never in the repo), written out as explicit test data.
  describe('workbook prices', () => {
    const nal01 = cat('NAL-01', 289_570)
    const nalItems = [nal01, cat('NAL-07', 289_570), cat('NAL-09', 398_666), cat('NAL-11', 506_413)]
    const stock = balances({ 'NAL-01': 4, 'NAL-07': 3, 'NAL-09': 2, 'NAL-11': 9 })
    const ranked = rankSubstitutes(nal01, nalItems, stock)

    it('NAL-01 -> NAL-07 is +-0 and ranks first', () => {
      expect(ranked[0]?.item.code).toBe('NAL-07')
      expect(ranked[0]?.diffMinor).toBe(0)
      expect(formatDiffPercent(ranked[0]?.diffPercent ?? null, 0)).toBe('±0')
    })

    it('NAL-01 -> NAL-11 is +75%', () => {
      const nal11 = ranked.find((c) => c.item.code === 'NAL-11')
      expect(formatDiffPercent(nal11?.diffPercent ?? null, nal11?.diffMinor ?? 0)).toBe('+75%')
      expect(codes(ranked)).toEqual(['NAL-07', 'NAL-09', 'NAL-11'])
    })

    it('NAL-01 -> NAL-09 is +38%', () => {
      const nal09 = ranked.find((c) => c.item.code === 'NAL-09')
      expect(formatDiffPercent(nal09?.diffPercent ?? null, nal09?.diffMinor ?? 0)).toBe('+38%')
    })
  })
})

describe('diff formatting', () => {
  it('shows a signed amount in pounds, +-0 for nothing', () => {
    expect(formatDiffMinor(0)).toBe('±0')
    expect(formatDiffMinor(216_843)).toBe('+2,168.43')
    expect(formatDiffMinor(-500)).toBe('-5.00')
  })

  it('shows a rounded signed percent; a missing percent is a dash', () => {
    expect(formatDiffPercent(-12.4, -1)).toBe('-12%')
    expect(formatDiffPercent(null, 100)).toBe('—')
    expect(formatDiffPercent(0.2, 1)).toBe('±0%')
  })
})
