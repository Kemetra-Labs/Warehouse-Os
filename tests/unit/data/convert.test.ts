import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  parseDocs,
  parseSettings,
  stripUndefined,
  toMillis,
} from '../../../src/data/convert'
import { itemSchema } from '../../../src/domain/types'

describe('stripUndefined', () => {
  it('turns undefined into null, deeply, without mutating', () => {
    const input = { a: undefined, b: { c: undefined, d: 1 }, e: [undefined, 2] }
    const out = stripUndefined(input)
    expect(out).toEqual({ a: null, b: { c: null, d: 1 }, e: [null, 2] })
    expect(input.a).toBeUndefined()
  })
  it('leaves non-plain objects (sentinels, dates) alone', () => {
    class FieldValueLike {}
    const sentinel = new FieldValueLike()
    const d = new Date(0)
    const out = stripUndefined({ s: sentinel, d })
    expect(out.s).toBe(sentinel)
    expect(out.d).toBe(d)
  })
})

describe('toMillis', () => {
  it('reads Timestamp-like, Date and seconds objects; else 0', () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5)
    expect(toMillis(new Date(7))).toBe(7)
    expect(toMillis({ seconds: 2, nanoseconds: 3_000_000 })).toBe(2003)
    expect(toMillis(null)).toBe(0)
    expect(toMillis('x')).toBe(0)
  })
})

const goodItem = {
  code: 'NAL-04',
  page: 8,
  category: 'مسامير',
  nameAr: 'مسمار',
  priceMinor: 100,
  updatedAt: {},
}

describe('parseDocs', () => {
  it('returns parsed rows with defaults and collects invalid docs as errors', () => {
    const { ok, errors } = parseDocs(itemSchema, [
      { id: 'NAL-04', data: goodItem },
      { id: 'bad', data: { code: 'x' } },
    ])
    expect(ok).toHaveLength(1)
    expect(ok[0]?.value.active).toBe(true)
    expect(ok[0]?.value.gtins).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.id).toBe('bad')
  })
})

describe('settings', () => {
  it('defaults to coverage 1.5 and reorder 5', () => {
    expect(DEFAULT_SETTINGS.coverageMonths).toBe(1.5)
    expect(DEFAULT_SETTINGS.defaultReorder).toBe(5)
  })
  it('parseSettings falls back to defaults for a missing or invalid doc', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ coverageMonths: -3 })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ coverageMonths: 2 }).coverageMonths).toBe(2)
  })
})
