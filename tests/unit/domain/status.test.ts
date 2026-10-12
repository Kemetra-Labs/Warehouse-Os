import { describe, expect, it } from 'vitest'
import {
  itemStatus,
  monthsOfConsumption,
  pendingSettlement,
  reorderPoint,
} from '../../../src/domain/status'
import { STATUS_LABELS } from '../../../src/domain/types'

const settings = { coverageMonths: 1.5, defaultReorder: 5 }

describe('monthsOfConsumption', () => {
  it('reproduces the workbook: 2026-08-01 to 2026-10-09 is 2 months', () => {
    expect(monthsOfConsumption(['2026-08-01', '2026-09-15', '2026-10-09'])).toBe(2)
  })
  it('is at least 1', () => {
    expect(monthsOfConsumption(['2026-08-01', '2026-08-05'])).toBe(1)
    expect(monthsOfConsumption(['2026-08-01'])).toBe(1)
    expect(monthsOfConsumption([])).toBe(1)
  })
  it('rounds (45 days -> 2, 44 days -> 1)', () => {
    expect(monthsOfConsumption(['2026-01-01', '2026-02-15'])).toBe(2)
    expect(monthsOfConsumption(['2026-01-01', '2026-02-14'])).toBe(1)
  })
  it('is order independent', () => {
    expect(monthsOfConsumption(['2026-10-09', '2026-08-01'])).toBe(2)
  })
})

describe('reorderPoint', () => {
  it('uses the manual value when > 0', () => {
    expect(reorderPoint({ reorderManual: 12, issued: 100 }, settings, 2)).toBe(12)
  })
  it('ignores a manual value of 0 or null', () => {
    expect(reorderPoint({ reorderManual: 0, issued: 10 }, settings, 2)).toBe(8)
    expect(reorderPoint({ reorderManual: null, issued: 10 }, settings, 2)).toBe(8)
  })
  it('computes ceil(issued / months * coverage), at least 1', () => {
    expect(reorderPoint({ reorderManual: null, issued: 10 }, settings, 2)).toBe(8) // 7.5
    expect(reorderPoint({ reorderManual: null, issued: 4 }, settings, 2)).toBe(3) // 3 exactly
    expect(reorderPoint({ reorderManual: null, issued: 1 }, settings, 4)).toBe(1) // 0.375
  })
  it('falls back to the default when nothing was issued', () => {
    expect(reorderPoint({ reorderManual: null, issued: 0 }, settings, 2)).toBe(5)
  })
})

describe('itemStatus', () => {
  it('uses the exact labels', () => {
    expect(STATUS_LABELS.OVERDRAWN).toBe('تجاوز — رصيد سالب')
    expect(itemStatus(-1, 5)).toBe('تجاوز — رصيد سالب')
    expect(itemStatus(0, 5)).toBe('نافد')
    expect(itemStatus(5, 5)).toBe('يحتاج طلب')
    expect(itemStatus(1, 5)).toBe('يحتاج طلب')
    expect(itemStatus(6, 5)).toBe('متاح')
  })
})

describe('pendingSettlement', () => {
  it('is true only for a negative balance', () => {
    expect(pendingSettlement(-1)).toBe(true)
    expect(pendingSettlement(0)).toBe(false)
    expect(pendingSettlement(3)).toBe(false)
  })
})
