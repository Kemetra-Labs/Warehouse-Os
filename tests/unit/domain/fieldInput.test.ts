import { describe, expect, it } from 'vitest'
import {
  formatDay,
  formatExpiry,
  formatPriceInput,
  parseExpiryInput,
  parsePriceInput,
  parseQtyInput,
} from '../../../src/domain/fieldInput'

describe('parseExpiryInput', () => {
  it('reads month/year as YYYY-MM', () => {
    expect(parseExpiryInput('03/2031')).toEqual({ kind: 'ok', value: '2031-03' })
    expect(parseExpiryInput('3-2031')).toEqual({ kind: 'ok', value: '2031-03' })
    expect(parseExpiryInput('2031-03')).toEqual({ kind: 'ok', value: '2031-03' })
  })

  it('reads a full day as YYYY-MM-DD and rejects impossible days', () => {
    expect(parseExpiryInput('15/03/2031')).toEqual({ kind: 'ok', value: '2031-03-15' })
    expect(parseExpiryInput('2031-03-15')).toEqual({ kind: 'ok', value: '2031-03-15' })
    expect(parseExpiryInput('31/02/2031')).toEqual({ kind: 'bad' })
  })

  it('accepts Arabic-Indic digits', () => {
    expect(parseExpiryInput('٠٣/٢٠٣١')).toEqual({ kind: 'ok', value: '2031-03' })
  })

  it('treats blank as empty and nonsense or month 13 as bad', () => {
    expect(parseExpiryInput('  ')).toEqual({ kind: 'empty' })
    expect(parseExpiryInput('13/2031')).toEqual({ kind: 'bad' })
    expect(parseExpiryInput('soon')).toEqual({ kind: 'bad' })
    expect(parseExpiryInput('03/31')).toEqual({ kind: 'bad' })
  })
})

describe('formatExpiry', () => {
  it('shows month/year or day/month/year, and blank for null', () => {
    expect(formatExpiry('2031-03')).toBe('03/2031')
    expect(formatExpiry('2031-03-15')).toBe('15/03/2031')
    expect(formatExpiry(null)).toBe('')
    expect(formatExpiry('garbage')).toBe('garbage')
  })
})

describe('parseQtyInput', () => {
  it('reads whole numbers, blank as 0, and rejects the rest', () => {
    expect(parseQtyInput('48')).toBe(48)
    expect(parseQtyInput('٤٨')).toBe(48)
    expect(parseQtyInput('')).toBe(0)
    expect(parseQtyInput('4.5')).toBeNull()
    expect(parseQtyInput('-1')).toBeNull()
    expect(parseQtyInput('abc')).toBeNull()
  })
})

describe('parsePriceInput / formatPriceInput', () => {
  it('reads pounds into piastres, tolerating commas and Arabic digits', () => {
    expect(parsePriceInput('5290')).toBe(529000)
    expect(parsePriceInput('5,290.5')).toBe(529050)
    expect(parsePriceInput('١٢٫٥')).toBe(1250)
  })

  it('rejects blank, more than two decimals and non-numbers', () => {
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('1.234')).toBeNull()
    expect(parsePriceInput('x')).toBeNull()
  })

  it('reads a comma only as a thousands separator, never as a decimal point', () => {
    expect(parsePriceInput('1,250')).toBe(125000)
    expect(parsePriceInput('١٬٢٥٠٫٥')).toBe(125050)
    expect(parsePriceInput('12,5')).toBeNull()
    expect(parsePriceInput('12,50')).toBeNull()
    expect(parsePriceInput('1,5')).toBeNull()
    expect(parsePriceInput('1,2345')).toBeNull()
  })

  it('formats piastres without separators for editing', () => {
    expect(formatPriceInput(529000)).toBe('5290')
    expect(formatPriceInput(1250)).toBe('12.5')
    expect(formatPriceInput(0)).toBe('0')
  })
})

describe('formatDay', () => {
  it('shows a day as DD/MM/YYYY and leaves anything else alone', () => {
    expect(formatDay('2026-10-12')).toBe('12/10/2026')
    expect(formatDay('')).toBe('')
    expect(formatDay('soon')).toBe('soon')
  })
})
