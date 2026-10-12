import { describe, expect, it } from 'vitest'
import {
  alreadyImportedMessage,
  formatImportedAt,
  kindLabel,
  valueLabel,
} from '../../../src/ui/screens/importView'

describe('importView', () => {
  it('formats the import date in Cairo time, not the device zone', () => {
    // 2026-10-11T22:30:00Z is already 12 Oct in Cairo (UTC+3 in summer time).
    expect(formatImportedAt(Date.UTC(2026, 9, 11, 22, 30))).toBe('12/10/2026')
    expect(formatImportedAt(Date.UTC(2026, 9, 12, 12, 0))).toBe('12/10/2026')
  })

  it('words the FR-004 refusal, with or without a known date', () => {
    expect(alreadyImportedMessage(Date.UTC(2026, 9, 12, 12, 0))).toBe(
      'اتستورد قبل كده بتاريخ 12/10/2026',
    )
    expect(alreadyImportedMessage(0)).toBe('اتستورد قبل كده')
  })

  it('labels difference kinds and values', () => {
    expect(kindLabel('balance')).toBe('الرصيد')
    expect(kindLabel('status')).toBe('الحالة')
    expect(valueLabel(null)).toBe('—')
    expect(valueLabel(12)).toBe('12')
    expect(valueLabel('متاح')).toBe('متاح')
  })
})
