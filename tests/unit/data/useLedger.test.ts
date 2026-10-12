import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/data/convert'
import { deriveLedger, type MovementDoc } from '../../../src/data/deriveLedger'
import {
  emptySeen,
  loadSeen,
  markSeen,
  saveSeen,
  type SeenState,
} from '../../../src/data/seenStore'
import type { Item } from '../../../src/domain/types'

const ts = (ms: number): object => ({ toMillis: () => ms })

function item(code: string, extra: Partial<Item> = {}): Item {
  return {
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
    priceMinor: 100,
    reorderManual: null,
    active: true,
    updatedAt: ts(0),
    ...extra,
  }
}

let n = 0
function mov(
  itemCode: string,
  type: MovementDoc['type'],
  qty: number,
  date: string,
  postedMs: number,
  extra: Partial<MovementDoc> = {},
): MovementDoc {
  n += 1
  return {
    id: `m${n}`,
    type,
    itemCode,
    qty,
    businessDate: date,
    postedAt: ts(postedMs),
    priceMinor: 100,
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'manual', id: null },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: 'd',
    createdBy: 'u',
    ...extra,
  }
}

const seen0: SeenState = { baseline: 0, byItem: {} }

describe('deriveLedger', () => {
  const items = [item('AAA-01'), item('BBB-02'), item('CCC-03'), item('DDD-04')]
  const movements = [
    mov('AAA-01', 'إضافة', 100, '2026-01-01', 10),
    mov('AAA-01', 'صرف', 90, '2026-01-31', 20), // balance 10, issued 90 over 1 month
    mov('BBB-02', 'إضافة', 10, '2026-01-01', 30),
    mov('BBB-02', 'صرف', 10, '2026-01-02', 40), // out
    mov('CCC-03', 'صرف', 2, '2026-01-02', 50), // negative
  ]

  it('computes balances, statuses, reorder points and tallies', () => {
    const v = deriveLedger({ items, movements, settings: DEFAULT_SETTINGS, seen: seen0 })
    const a = v.byCode.get('AAA-01')
    expect(a?.balance).toBe(10)
    expect(a?.issued).toBe(90)
    expect(a?.reorder).toBe(135)
    expect(a?.status).toBe('يحتاج طلب')
    expect(v.byCode.get('BBB-02')?.status).toBe('نافد')
    expect(v.byCode.get('CCC-03')?.status).toBe('تجاوز — رصيد سالب')
    expect(v.byCode.get('CCC-03')?.pendingSettlement).toBe(true)
    expect(v.byCode.get('DDD-04')?.reorder).toBe(5)
    expect(v.byCode.get('DDD-04')?.status).toBe('نافد')
    expect(v.tally).toEqual({ needsReorder: 1, out: 2, pendingSettlements: 1 })
    expect(v.pendingSettlements).toEqual(['CCC-03'])
    expect(v.months).toBe(1)
  })

  it('keeps inactive items as rows but out of the tally', () => {
    const v = deriveLedger({
      items: [item('AAA-01', { active: false })],
      movements: [],
      settings: DEFAULT_SETTINGS,
      seen: seen0,
    })
    expect(v.rows).toHaveLength(1)
    expect(v.tally).toEqual({ needsReorder: 0, out: 0, pendingSettlements: 0 })
  })

  it('uses a manual reorder point', () => {
    const v = deriveLedger({
      items: [item('AAA-01', { reorderManual: 50 })],
      movements: [mov('AAA-01', 'إضافة', 40, '2026-01-01', 1)],
      settings: DEFAULT_SETTINGS,
      seen: seen0,
    })
    expect(v.byCode.get('AAA-01')?.reorder).toBe(50)
    expect(v.byCode.get('AAA-01')?.status).toBe('يحتاج طلب')
  })

  it('gives batch balances per item', () => {
    const v = deriveLedger({
      items: [item('AAA-01')],
      settings: DEFAULT_SETTINGS,
      seen: seen0,
      movements: [
        mov('AAA-01', 'إضافة', 5, '2026-01-01', 1, { batchNo: 'B1', expiry: '2027-01' }),
        mov('AAA-01', 'صرف', 2, '2026-01-02', 2, { batchNo: 'B1', expiry: '2027-01' }),
        mov('AAA-01', 'إضافة', 1, '2026-01-03', 3),
      ],
    })
    expect(v.batchBalancesFor('AAA-01').map((b) => [b.label, b.balance])).toEqual([
      ['B1', 3],
      ['تشغيلة غير محددة', 1],
    ])
  })

  it('flags changedSinceSeen from the latest postedAt vs the device seenAt', () => {
    const base = { items, movements, settings: DEFAULT_SETTINGS }
    expect(deriveLedger({ ...base, seen: { baseline: 100, byItem: {} } }).changedCodes).toEqual([])
    const v = deriveLedger({ ...base, seen: { baseline: 25, byItem: {} } })
    expect(v.changedCodes).toEqual(['BBB-02', 'CCC-03'])
    const w = deriveLedger({ ...base, seen: { baseline: 25, byItem: { 'BBB-02': 45 } } })
    expect(w.changedCodes).toEqual(['CCC-03'])
    expect(w.byCode.get('DDD-04')?.changedSinceSeen).toBe(false)
  })
})

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial))
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

describe('seenStore', () => {
  it('first load sets the baseline to now and persists it', () => {
    const st = memoryStorage()
    expect(loadSeen(st, () => 500)).toEqual({ baseline: 500, byItem: {} })
    expect(loadSeen(st, () => 900).baseline).toBe(500)
  })
  it('markSeen returns a new state and persists', () => {
    const st = memoryStorage()
    const s0 = emptySeen(1)
    const s1 = markSeen(s0, 'AAA-01', 77, st)
    expect(s1).not.toBe(s0)
    expect(s0.byItem).toEqual({})
    expect(loadSeen(st, () => 0).byItem['AAA-01']).toBe(77)
  })
  it('survives corrupt data and throwing storage', () => {
    const corrupt = memoryStorage({ 'warehouse.seen.v1': '{oops' })
    expect(loadSeen(corrupt, () => 9)).toEqual({ baseline: 9, byItem: {} })
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(loadSeen(blocked, () => 3)).toEqual({ baseline: 3, byItem: {} })
    expect(() => saveSeen(emptySeen(1), blocked)).not.toThrow()
    expect(markSeen(emptySeen(1), 'A', 2, blocked).byItem['A']).toBe(2)
  })
})
