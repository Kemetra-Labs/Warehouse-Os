import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  fromMinor,
  lineTotalMinor,
  percentDiff,
  toMinor,
} from '../../../src/domain/money'

describe('toMinor', () => {
  it('converts pounds to piastres', () => {
    expect(toMinor(5118.1)).toBe(511810)
    expect(toMinor(22545.96)).toBe(2254596)
    expect(toMinor(0)).toBe(0)
  })
  it('is float safe', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toMinor(1.005)).toBe(101)
    expect(toMinor(19.99)).toBe(1999)
    expect(toMinor(4.35)).toBe(435)
  })
  it('rounds half away from zero and avoids -0', () => {
    expect(toMinor(-1.005)).toBe(-101)
    expect(Object.is(toMinor(-0.001), 0)).toBe(true)
  })
})

describe('fromMinor', () => {
  it('converts piastres to pounds', () => {
    expect(fromMinor(511810)).toBe(5118.1)
    expect(fromMinor(1)).toBe(0.01)
  })
})

describe('formatMoney', () => {
  it('uses Western digits, thousands separators and 2 decimals', () => {
    expect(formatMoney(2254596)).toBe('22,545.96')
    expect(formatMoney(511810)).toBe('5,118.10')
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(5)).toBe('0.05')
    expect(formatMoney(100000000)).toBe('1,000,000.00')
  })
  it('formats negatives', () => {
    expect(formatMoney(-123456)).toBe('-1,234.56')
  })
})

describe('lineTotalMinor', () => {
  it('multiplies qty by unit price', () => {
    expect(lineTotalMinor(3, 12550)).toBe(37650)
  })
})

describe('percentDiff', () => {
  it('returns the change relative to the previous value', () => {
    expect(percentDiff(10000, 11000)).toBeCloseTo(10)
    expect(percentDiff(10000, 9000)).toBeCloseTo(-10)
    expect(percentDiff(10000, 10000)).toBe(0)
  })
  it('is null when the previous value is 0', () => {
    expect(percentDiff(0, 500)).toBeNull()
  })
})
