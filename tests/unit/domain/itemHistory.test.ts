import { describe, expect, it } from 'vitest'
import {
  buildHistory,
  describeDocument,
  type HistoryMovement,
} from '../../../src/domain/itemHistory'
import { MOVEMENT_TYPES } from '../../../src/domain/types'

const millisOf = (t: unknown): number => (t as { ms: number }).ms

let seq = 0
function move(
  over: Partial<HistoryMovement> & Pick<HistoryMovement, 'type' | 'qty'>,
): HistoryMovement {
  seq += 1
  return {
    id: `m${seq}`,
    itemCode: 'SCR-01',
    businessDate: '2026-09-01',
    postedAt: { ms: seq },
    priceMinor: 1000,
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'import', id: null },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: 'd',
    createdBy: 'u',
    ...over,
  }
}

describe('buildHistory', () => {
  it('lists the item’s movements oldest first with the balance after each', () => {
    const rows = buildHistory(
      [
        move({ id: 'c', type: MOVEMENT_TYPES.ISSUE, qty: 3, businessDate: '2026-09-10' }),
        move({ id: 'a', type: MOVEMENT_TYPES.ADD, qty: 10, businessDate: '2026-09-01' }),
        move({ id: 'b', type: MOVEMENT_TYPES.ISSUE, qty: 4, businessDate: '2026-09-05' }),
        move({ id: 'x', itemCode: 'SCR-99', type: MOVEMENT_TYPES.ADD, qty: 99 }),
      ],
      'SCR-01',
      millisOf,
    )
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows.map((r) => r.effect)).toEqual([10, -4, -3])
    expect(rows.map((r) => r.balanceAfter)).toEqual([10, 6, 3])
  })

  it('breaks a same-day tie by posting time, then by id', () => {
    const rows = buildHistory(
      [
        move({ id: 'z', type: MOVEMENT_TYPES.ADD, qty: 1, postedAt: { ms: 5 } }),
        move({ id: 'y', type: MOVEMENT_TYPES.ADD, qty: 1, postedAt: { ms: 9 } }),
        move({ id: 'b', type: MOVEMENT_TYPES.ADD, qty: 1, postedAt: { ms: 5 } }),
      ],
      'SCR-01',
      millisOf,
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'z', 'y'])
  })

  it('treats a return as an increase and a signed adjustment as it is', () => {
    const rows = buildHistory(
      [
        move({ id: 'a', type: MOVEMENT_TYPES.ADD, qty: 10 }),
        move({ id: 'b', type: MOVEMENT_TYPES.RETURN, qty: 2, postedAt: { ms: 90 } }),
        move({ id: 'c', type: MOVEMENT_TYPES.ADJUST, qty: -5, postedAt: { ms: 91 } }),
      ],
      'SCR-01',
      millisOf,
    )
    expect(rows.map((r) => r.balanceAfter)).toEqual([10, 12, 7])
  })

  it('links a reversal and its original in both directions, and keeps both in the balance', () => {
    const rows = buildHistory(
      [
        move({ id: 'a', type: MOVEMENT_TYPES.ADD, qty: 10 }),
        move({ id: 'b', type: MOVEMENT_TYPES.ISSUE, qty: 4, postedAt: { ms: 20 } }),
        move({
          id: 'rev-b',
          type: MOVEMENT_TYPES.ADJUST,
          qty: 4,
          reverses: 'b',
          reason: 'غلط في الصنف',
          businessDate: '2026-09-02',
          postedAt: { ms: 30 },
        }),
      ],
      'SCR-01',
      millisOf,
    )
    const [a, b, rev] = rows
    expect(a).toMatchObject({ reversedBy: null, reverses: null })
    expect(b).toMatchObject({ reversedBy: 'rev-b', reverses: null })
    expect(rev).toMatchObject({ reversedBy: null, reverses: 'b' })
    expect(rows.map((r) => r.balanceAfter)).toEqual([10, 6, 10])
  })

  it('is not changed by the order it receives movements in, and does not mutate them', () => {
    const input = Object.freeze([
      move({ id: 'a', type: MOVEMENT_TYPES.ADD, qty: 5 }),
      move({ id: 'b', type: MOVEMENT_TYPES.ISSUE, qty: 1, businessDate: '2026-09-02' }),
    ])
    const forward = buildHistory(input, 'SCR-01', millisOf)
    const backward = buildHistory([...input].reverse(), 'SCR-01', millisOf)
    expect(backward).toEqual(forward)
  })

  it('returns an empty list for an item with no movements', () => {
    expect(buildHistory([], 'SCR-01', millisOf)).toEqual([])
  })
})

describe('describeDocument', () => {
  it('names a receipt by its delivery note and invoice, and links to it', () => {
    const doc = describeDocument(
      move({
        type: MOVEMENT_TYPES.ADD,
        qty: 1,
        docNumber: '19808953',
        reference: 'INV-7',
        source: { kind: 'receipt', id: 'r1' },
      }),
    )
    expect(doc.label).toContain('19808953')
    expect(doc.label).toContain('INV-7')
    expect(doc.link).toBe('/receive/r1')
  })

  it('names an issue by its batch and permits, and links to it', () => {
    const doc = describeDocument(
      move({
        type: MOVEMENT_TYPES.ISSUE,
        qty: 1,
        docNumber: '1001 - 1002',
        reference: 'دفعة 14',
        source: { kind: 'issue', id: 'b1' },
      }),
    )
    expect(doc.label).toContain('دفعة 14')
    expect(doc.label).toContain('1001 - 1002')
    expect(doc.link).toBe('/issue/b1')
  })

  it('names and links the reversal of a receipt line or an issue line, which has no reference', () => {
    for (const [kind, link] of [
      ['receipt', '/receive/r1'],
      ['issue', '/issue/r1'],
    ] as const) {
      const doc = describeDocument(
        move({
          type: MOVEMENT_TYPES.ADJUST,
          qty: -1,
          reverses: 'r1-L1',
          reason: 'خطأ',
          source: { kind, id: 'r1' },
        }),
      )
      expect(doc.label).not.toBe('')
      expect(doc.link).toBe(link)
    }
  })

  it('says an imported row came from the workbook, with no link', () => {
    const doc = describeDocument(move({ type: MOVEMENT_TYPES.ADD, qty: 1, docNumber: '55' }))
    expect(doc.label).toContain('الإكسيل')
    expect(doc.label).toContain('55')
    expect(doc.link).toBeNull()
  })

  it('shows the reason of a manual movement and the substitute it stands for', () => {
    const manual = describeDocument(
      move({
        type: MOVEMENT_TYPES.ADJUST,
        qty: -1,
        reason: 'جرد',
        source: { kind: 'manual', id: null },
      }),
    )
    expect(manual.label).toContain('جرد')
    expect(manual.link).toBeNull()
  })
})
