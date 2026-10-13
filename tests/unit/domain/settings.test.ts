import { describe, expect, it } from 'vitest'
import { deriveLedger, type MovementDoc } from '../../../src/data/deriveLedger'
import { DEFAULT_SETTINGS } from '../../../src/data/convert'
import { emptySeen } from '../../../src/data/seenStore'
import {
  parseCoverageInput,
  parseReorderInput,
  reorderImpact,
  settingsPatch,
  validateSettings,
} from '../../../src/domain/settings'
import { MOVEMENT_TYPES, type Item } from '../../../src/domain/types'
import { item } from '../../helpers/receiptFixtures'

describe('validateSettings', () => {
  it('accepts coverage above zero and a default reorder point of 1 or more', () => {
    expect(validateSettings({ coverageMonths: 1.5, defaultReorder: 5 })).toEqual({})
    expect(validateSettings({ coverageMonths: 0.25, defaultReorder: 1 })).toEqual({})
  })

  it('rejects coverage months of zero, negative, missing or not a number', () => {
    for (const bad of [0, -1, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const errors = validateSettings({ coverageMonths: bad, defaultReorder: 5 })
      expect(errors.coverageMonths).toBeDefined()
      expect(errors.defaultReorder).toBeUndefined()
    }
  })

  it('rejects a default reorder point below 1, fractional, or missing', () => {
    for (const bad of [0, -2, 2.5, null]) {
      const errors = validateSettings({ coverageMonths: 1.5, defaultReorder: bad })
      expect(errors.defaultReorder).toBeDefined()
      expect(errors.coverageMonths).toBeUndefined()
    }
  })

  it('reports both fields when both are wrong', () => {
    const errors = validateSettings({ coverageMonths: 0, defaultReorder: 0 })
    expect(Object.keys(errors).sort()).toEqual(['coverageMonths', 'defaultReorder'])
  })
})

describe('typed input', () => {
  it('reads coverage months with a dot, a comma or Arabic digits', () => {
    expect(parseCoverageInput('1.5')).toBe(1.5)
    expect(parseCoverageInput('2')).toBe(2)
    expect(parseCoverageInput('١٫٥')).toBe(1.5)
    expect(parseCoverageInput('1,5')).toBe(1.5)
  })

  it('refuses coverage that is empty, zero, negative or text', () => {
    for (const bad of ['', ' ', '0', '-1', 'abc', '1.2.3']) {
      expect(parseCoverageInput(bad)).toBeNull()
    }
  })

  it('reads a whole number for the default reorder point', () => {
    expect(parseReorderInput('5')).toBe(5)
    expect(parseReorderInput('٧')).toBe(7)
    expect(parseReorderInput('')).toBeNull()
    expect(parseReorderInput('2.5')).toBeNull()
    expect(parseReorderInput('-1')).toBeNull()
  })
})

describe('settingsPatch', () => {
  it('keeps only the two editable fields', () => {
    expect(settingsPatch({ coverageMonths: 2, defaultReorder: 8 })).toEqual({
      coverageMonths: 2,
      defaultReorder: 8,
    })
  })

  it('refuses an invalid draft', () => {
    expect(() => settingsPatch({ coverageMonths: 0, defaultReorder: 8 })).toThrow()
  })
})

describe('reorder points are recomputed after a settings change', () => {
  const ts = (ms: number): object => ({ toMillis: () => ms })
  const move = (
    itemCode: string,
    type: MovementDoc['type'],
    qty: number,
    businessDate: string,
    id: string,
  ): MovementDoc => ({
    id,
    type,
    itemCode,
    qty,
    businessDate,
    postedAt: ts(Date.parse(businessDate)),
    priceMinor: 100,
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
  })

  // Two months of history (60 days). A issued 10 in total; B never issued; C has a manual point.
  const items: readonly Item[] = [
    item('AAA-01', { page: 1 }),
    item('AAA-02', { page: 2 }),
    item('AAA-03', { page: 3, reorderManual: 9 }),
  ]
  const movements: readonly MovementDoc[] = [
    move('AAA-01', MOVEMENT_TYPES.ADD, 50, '2026-08-01', 'm1'),
    move('AAA-01', MOVEMENT_TYPES.ISSUE, 10, '2026-09-30', 'm2'),
    move('AAA-02', MOVEMENT_TYPES.ADD, 4, '2026-08-01', 'm3'),
    move('AAA-03', MOVEMENT_TYPES.ADD, 4, '2026-08-01', 'm4'),
  ]

  const reorderOf = (settings: typeof DEFAULT_SETTINGS) => {
    const view = deriveLedger({ items, movements, settings, seen: emptySeen(0) })
    return Object.fromEntries(view.rows.map((r) => [r.item.code, r.reorder]))
  }

  it('moves the computed point with the coverage months, and the default with the default', () => {
    const before = reorderOf(DEFAULT_SETTINGS) // 2 months: 10 / 2 * 1.5 = 7.5 -> 8
    expect(before).toEqual({ 'AAA-01': 8, 'AAA-02': 5, 'AAA-03': 9 })
    const after = reorderOf({ ...DEFAULT_SETTINGS, coverageMonths: 3, defaultReorder: 2 })
    // 10 / 2 * 3 = 15; nothing issued -> the new default; a manual point is not touched.
    expect(after).toEqual({ 'AAA-01': 15, 'AAA-02': 2, 'AAA-03': 9 })
  })

  it('counts the items whose point changes', () => {
    const next = { ...DEFAULT_SETTINGS, coverageMonths: 3, defaultReorder: 2 }
    expect(reorderImpact(items, movements, DEFAULT_SETTINGS, next)).toBe(2)
  })

  it('counts nothing when the settings are the same', () => {
    expect(reorderImpact(items, movements, DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBe(0)
  })

  it('counts only the default when only the default changes', () => {
    const next = { ...DEFAULT_SETTINGS, defaultReorder: 6 }
    expect(reorderImpact(items, movements, DEFAULT_SETTINGS, next)).toBe(1)
  })
})
