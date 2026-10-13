import { describe, expect, it } from 'vitest'
import {
  addLine,
  canAddLine,
  isBlankDraft,
  isExpired,
  lacksExpiredReason,
  lineDiff,
  lineFromItem,
  patchLine,
  removeLine,
  resolveLine,
  unresolvedLine,
} from '../../../src/domain/receiptEdit'
import { newDraft, newLine } from '../../../src/domain/receipt'
import type { Item } from '../../../src/domain/types'

const item = (code: string, over: Partial<Item> = {}): Item => ({
  code,
  page: 1,
  category: 'c',
  nameAr: `صنف ${code}`,
  nameEn: '',
  material: '',
  size: '',
  unit: 'قطعة',
  supplier: '',
  gtins: [],
  authorityCode: null,
  priceMinor: 1000,
  reorderManual: null,
  active: true,
  updatedAt: {},
  ...over,
})

describe('lineFromItem / unresolvedLine', () => {
  it('prefills price and previous price from the item and starts counting at 1', () => {
    const l = lineFromItem(3, item('AAA-01', { priceMinor: 1250 }), { gtin: '6001234567890' })
    expect(l).toMatchObject({
      n: 3,
      itemCode: 'AAA-01',
      scannedGtin: '6001234567890',
      priceMinor: 1250,
      prevPriceMinor: 1250,
      countedQty: 1,
      invoicedQty: 0,
      batchNo: null,
      expiry: null,
    })
  })

  it('carries GS1 batch and expiry, and an authority code as printed', () => {
    const l = lineFromItem(1, item('AAA-01'), {
      batchNo: 'B7',
      expiry: '2031-03-31',
      authorityCode: '70000409',
    })
    expect(l).toMatchObject({ batchNo: 'B7', expiry: '2031-03-31', authorityCode: '70000409' })
    expect(l.scannedGtin).toBeNull()
  })

  it('an unknown GTIN gives a line with no item', () => {
    expect(unresolvedLine(2, '6221234567893', {})).toMatchObject({
      n: 2,
      itemCode: null,
      scannedGtin: '6221234567893',
      countedQty: 1,
      priceMinor: 0,
    })
  })
})

describe('draft edits are immutable', () => {
  const base = newDraft('2026-10-12')

  it('addLine numbers the line after the last one', () => {
    const one = addLine(base, newLine(99))
    const two = addLine(one, newLine(99))
    expect(base.lines).toHaveLength(0)
    expect(two.lines.map((l) => l.n)).toEqual([1, 2])
  })

  it('patchLine changes one line and leaves the original alone', () => {
    const d = addLine(addLine(base, newLine(0)), newLine(0))
    const next = patchLine(d, 2, { countedQty: 5 })
    expect(next.lines[1]?.countedQty).toBe(5)
    expect(d.lines[1]?.countedQty).toBe(0)
    expect(next.lines[0]).toBe(d.lines[0])
  })

  it('removeLine renumbers so numbers stay 1..N', () => {
    const d = addLine(addLine(addLine(base, newLine(0)), newLine(0)), newLine(0))
    const next = removeLine(d, 2)
    expect(next.lines.map((l) => l.n)).toEqual([1, 2])
  })
})

describe('resolveLine', () => {
  it('sets the item, keeps a typed price, and fills the price when none was typed', () => {
    const unknown = { ...unresolvedLine(1, '6221234567893', {}), invoicedQty: 4 }
    const resolved = resolveLine(unknown, item('NAL-01', { priceMinor: 5000 }))
    expect(resolved).toMatchObject({
      itemCode: 'NAL-01',
      priceMinor: 5000,
      prevPriceMinor: 5000,
      scannedGtin: '6221234567893',
    })
    const typed = resolveLine(
      { ...unknown, priceMinor: 5200 },
      item('NAL-01', { priceMinor: 5000 }),
    )
    expect(typed).toMatchObject({ priceMinor: 5200, prevPriceMinor: 5000 })
  })
})

describe('expiry and add rules', () => {
  const line = (over: object) => ({ ...newLine(1), countedQty: 1, ...over })

  it('a month expiry covers the whole month', () => {
    expect(isExpired(line({ expiry: '2026-10' }), '2026-10-12')).toBe(false)
    expect(isExpired(line({ expiry: '2026-09' }), '2026-10-12')).toBe(true)
    expect(isExpired(line({ expiry: '2026-10-11' }), '2026-10-12')).toBe(true)
    expect(isExpired(line({ expiry: null }), '2026-10-12')).toBe(false)
    expect(isExpired(line({ expiry: 'junk' }), '2026-10-12')).toBe(false)
  })

  it('an expired batch needs a reason only when something was counted', () => {
    const expired = line({ expiry: '2026-01' })
    expect(lacksExpiredReason(expired, '2026-10-12')).toBe(true)
    expect(lacksExpiredReason({ ...expired, expiredReason: 'تعويض' }, '2026-10-12')).toBe(false)
    expect(lacksExpiredReason({ ...expired, countedQty: 0 }, '2026-10-12')).toBe(false)
  })

  it('canAddLine blocks an expired batch with no reason and an unreadable expiry', () => {
    const today = '2026-10-12'
    expect(canAddLine(line({ expiry: '2031-03' }), today)).toBe(true)
    expect(canAddLine(line({ expiry: '2026-01' }), today)).toBe(false)
    expect(canAddLine(line({ expiry: '2026-01', expiredReason: 'x' }), today)).toBe(true)
    expect(canAddLine(line({ expiry: 'junk' }), today)).toBe(false)
  })

  it('lineDiff is counted minus invoiced', () => {
    expect(lineDiff(line({ invoicedQty: 50, countedQty: 48 }))).toBe(-2)
  })
})

describe('isBlankDraft', () => {
  it('a draft with no lines and no header text has nothing worth saving', () => {
    expect(isBlankDraft(newDraft('2026-10-12'))).toBe(true)
    expect(isBlankDraft({ ...newDraft('2026-10-12'), supplier: '  ' })).toBe(true)
  })

  it('any header text or any line makes it worth saving', () => {
    expect(isBlankDraft({ ...newDraft('2026-10-12'), deliveryNo: '19808953' })).toBe(false)
    expect(isBlankDraft({ ...newDraft('2026-10-12'), supplyOrderNo: 'A' })).toBe(false)
    expect(isBlankDraft(addLine(newDraft('2026-10-12'), newLine(1)))).toBe(false)
  })
})
