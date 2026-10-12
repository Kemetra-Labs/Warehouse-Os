import { describe, expect, it } from 'vitest'
import {
  batchBalances,
  buildReversal,
  effect,
  issuedTotals,
  itemBalances,
} from '../../../src/domain/ledger'
import {
  MOVEMENT_TYPES as T,
  UNSPECIFIED_BATCH_LABEL,
  type Movement,
} from '../../../src/domain/types'

type M = Pick<Movement, 'type' | 'qty' | 'itemCode' | 'batchNo' | 'expiry'>
const m = (
  type: M['type'],
  qty: number,
  itemCode = 'SCR-01',
  batchNo: string | null = null,
  expiry: string | null = null,
): M => ({ type, qty, itemCode, batchNo, expiry })

describe('effect', () => {
  it('adds for إضافة and مرتجع, subtracts for صرف, keeps sign for تسوية', () => {
    expect(effect(m(T.ADD, 10))).toBe(10)
    expect(effect(m(T.ISSUE, 4))).toBe(-4)
    expect(effect(m(T.RETURN, 2))).toBe(2)
    expect(effect(m(T.ADJUST, -3))).toBe(-3)
    expect(effect(m(T.ADJUST, 3))).toBe(3)
  })
})

describe('itemBalances', () => {
  it('sums effects per item and does not mutate input', () => {
    const input = [
      m(T.ADD, 10),
      m(T.ISSUE, 4),
      m(T.RETURN, 1),
      m(T.ADJUST, -2),
      m(T.ADD, 7, 'PLA-12'),
    ]
    const copy = structuredClone(input)
    const b = itemBalances(input)
    expect(b.get('SCR-01')).toBe(5)
    expect(b.get('PLA-12')).toBe(7)
    expect(input).toEqual(copy)
  })

  it('can go negative', () => {
    expect(itemBalances([m(T.ISSUE, 3)]).get('SCR-01')).toBe(-3)
  })
})

describe('batchBalances', () => {
  const list = [
    m(T.ADD, 10, 'SCR-01', 'B1', '2027-03'),
    m(T.ISSUE, 4, 'SCR-01', 'B1', '2027-03'),
    m(T.ADD, 5, 'SCR-01', 'B2', '2026-12'),
    m(T.ADD, 3, 'SCR-01'),
    m(T.ADD, 9, 'PLA-12', 'B1', '2027-03'),
  ]

  it('groups by batch and expiry for one item', () => {
    const rows = batchBalances(list, 'SCR-01')
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.batchNo === 'B1')?.balance).toBe(6)
    expect(rows.find((r) => r.batchNo === 'B2')?.balance).toBe(5)
  })

  it('puts a null batch in the unspecified bucket', () => {
    const row = batchBalances(list, 'SCR-01').find((r) => r.batchNo === null)
    expect(row?.balance).toBe(3)
    expect(row?.label).toBe(UNSPECIFIED_BATCH_LABEL)
    expect(UNSPECIFIED_BATCH_LABEL).toBe('تشغيلة غير محددة')
  })

  it('orders by earliest expiry first, unspecified last', () => {
    expect(batchBalances(list, 'SCR-01').map((r) => r.batchNo)).toEqual(['B2', 'B1', null])
  })

  it('returns an empty list for an unknown item', () => {
    expect(batchBalances(list, 'XXX-99')).toEqual([])
  })
})

describe('issuedTotals', () => {
  it('counts only صرف, per item, ignoring reversals and returns', () => {
    const t = issuedTotals([
      m(T.ISSUE, 4),
      m(T.ISSUE, 6),
      m(T.ADD, 100),
      m(T.RETURN, 2),
      m(T.ADJUST, 5),
      m(T.ISSUE, 1, 'PLA-12'),
    ])
    expect(t.get('SCR-01')).toBe(10)
    expect(t.get('PLA-12')).toBe(1)
  })
})

describe('buildReversal', () => {
  const ctx = {
    reason: 'خطأ في الإدخال',
    businessDate: '2026-10-12',
    deviceId: 'dev-1',
    createdBy: 'uid-1',
    source: { kind: 'manual', id: null } as const,
  }
  const original = {
    id: 'imp-r12',
    type: T.ISSUE,
    itemCode: 'SCR-01',
    qty: 4,
    batchNo: 'B1',
    expiry: '2027-03',
    priceMinor: 12550,
  }

  it('negates the effect as a تسوية with same item, batch and price', () => {
    const { id, data } = buildReversal(original, ctx)
    expect(id).toBe('rev-imp-r12')
    expect(data.type).toBe(T.ADJUST)
    expect(data.qty).toBe(4)
    expect(data.itemCode).toBe('SCR-01')
    expect(data.batchNo).toBe('B1')
    expect(data.expiry).toBe('2027-03')
    expect(data.priceMinor).toBe(12550)
    expect(data.reverses).toBe('imp-r12')
    expect(data.reason).toBe('خطأ في الإدخال')
    expect(data.createdBy).toBe('uid-1')
  })

  it('reverses an إضافة with a negative qty and a تسوية with the opposite sign', () => {
    expect(buildReversal({ ...original, type: T.ADD, qty: 10 }, ctx).data.qty).toBe(-10)
    expect(buildReversal({ ...original, type: T.ADJUST, qty: -3 }, ctx).data.qty).toBe(3)
    expect(buildReversal({ ...original, type: T.RETURN, qty: 2 }, ctx).data.qty).toBe(-2)
  })

  it('cancels the original effect in the balance', () => {
    const { data } = buildReversal(original, ctx)
    const b = itemBalances([{ ...original }, data])
    expect(b.get('SCR-01')).toBe(0)
  })

  it('rejects an empty reason', () => {
    expect(() => buildReversal(original, { ...ctx, reason: '  ' })).toThrow()
  })
})
