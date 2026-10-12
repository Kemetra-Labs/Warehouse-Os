/**
 * Parity (FR-003, SC-001): the app's balances and statuses against the workbook's cached
 * columns L and N of "الأرصدة اللحظية".
 *
 * - Always runs against the generated fixture (cached values computed from the RAW dates).
 * - Runs against the real workbook only when WORKBOOK_PATH is set (mandatory before release):
 *     WORKBOOK_PATH="<path to the .xlsx>" npm run test:parity
 *   Expected there: 97 items, 237 ledger rows (5 with quantity 0 skipped -> 232 movements), 97/97 balances. The file is only read from the
 *   given path; it is never copied into the repository.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { importWorkbook } from '../../src/excel/importWorkbook'
import { computeParity, DATE_NOTE, type ParityReport } from '../../src/excel/parity'
import { TYPO_DATE } from '../../src/excel/serial'
import type { ImportResult } from '../../src/excel/types'
import { correctedFixtureBuffer, fixtureBuffer, toArrayBuffer } from '../helpers/workbook'

function parityOf(r: ImportResult, remappedCount = r.remappedRows.length): ParityReport {
  return computeParity({
    items: r.items,
    movements: r.movements,
    cached: r.cached,
    remappedCount,
  })
}

describe('parity against the fixture', () => {
  const result = importWorkbook(fixtureBuffer())

  it('matches every balance', () => {
    const report = parityOf(result)
    expect(report.total).toBe(8)
    expect(report.balanceMatched).toBe(8)
    expect(report.diffs.filter((d) => d.kind === 'balance')).toEqual([])
  })

  it('lists status-only differences with the six-dates note while the typo date remains', () => {
    const report = parityOf(result)
    const statusDiffs = report.diffs.filter((d) => d.kind === 'status')
    expect(statusDiffs.map((d) => d.code).sort()).toEqual(['CCC-01', 'CCC-02'])
    expect(report.statusMatched).toBe(6)
    for (const d of statusDiffs) {
      expect(d.reason).toContain(DATE_NOTE)
      expect(d.app).not.toEqual(d.workbook)
    }
  })

  it('omits the note when the workbook has no remapped dates', () => {
    const report = parityOf(result, 0)
    for (const d of report.diffs) expect(d.reason).not.toContain(DATE_NOTE)
  })

  it('matches balances and statuses once the dates are corrected in the workbook', () => {
    const corrected = importWorkbook(correctedFixtureBuffer())
    expect(corrected.remappedRows).toEqual([])
    const report = parityOf(corrected)
    expect(report.balanceMatched).toBe(8)
    expect(report.statusMatched).toBe(8)
    expect(report.diffs).toEqual([])
  })

  it('reports a wrong balance and items missing on either side', () => {
    const tampered = {
      ...result,
      items: result.items.filter((i) => i.code !== 'AAA-01'),
      cached: [
        ...result.cached.filter((c) => c.code !== 'BBB-01'),
        { code: 'ZZZ-99', row: 99, balance: 1, status: 'متاح' },
      ].map((c) => (c.code === 'AAA-02' ? { ...c, balance: 999 } : c)),
    }
    const kinds = new Map(parityOf(tampered).diffs.map((d) => [`${d.code}:${d.kind}`, d]))
    expect(kinds.get('AAA-02:balance')).toMatchObject({ app: 23, workbook: 999 })
    expect(kinds.has('BBB-01:missing-in-workbook')).toBe(true)
    expect(kinds.has('AAA-01:missing-in-app')).toBe(true)
    expect(kinds.has('ZZZ-99:missing-in-app')).toBe(true)
  })

  it('adds no date note to a status difference that comes with a balance difference', () => {
    const wrongBalance = {
      ...result,
      cached: result.cached.map((c) => (c.code === 'CCC-01' ? { ...c, balance: 11 } : c)),
    }
    const diffs = parityOf(wrongBalance).diffs.filter((d) => d.code === 'CCC-01')
    expect(diffs.map((d) => d.kind).sort()).toEqual(['balance', 'status'])
    expect(diffs.find((d) => d.kind === 'status')?.reason).not.toContain(DATE_NOTE)
  })

  it('treats a non-numeric cached balance as a difference', () => {
    const broken = {
      ...result,
      cached: result.cached.map((c) => (c.code === 'AAA-01' ? { ...c, balance: null } : c)),
    }
    expect(parityOf(broken).balanceMatched).toBe(7)
  })
})

const WORKBOOK_PATH = process.env.WORKBOOK_PATH

describe.skipIf(!WORKBOOK_PATH)('parity against the real workbook (WORKBOOK_PATH)', () => {
  let result: ImportResult
  beforeAll(() => {
    result = importWorkbook(toArrayBuffer(readFileSync(WORKBOOK_PATH ?? '')))
  })

  it('imports 97 items (47 with a GTIN) and 232 movements (237 rows, 5 zero-quantity skipped)', () => {
    expect(result.items).toHaveLength(97)
    expect(result.gtinCount).toBe(47)
    expect(result.movements).toHaveLength(232)
    expect(result.skippedZeroRows).toHaveLength(5)
    // FR-005: 6 rows, 2 إضافة and 4 صرف. Row numbers are printed in case the count is off.
    const remapped = result.movements.filter((m) => result.remappedRows.includes(m.row))
    const label = `remapped rows: ${result.remappedRows.join(', ')}`
    expect(remapped, label).toHaveLength(6)
    expect(
      remapped.filter((m) => m.type === 'إضافة'),
      label,
    ).toHaveLength(2)
    expect(
      remapped.filter((m) => m.type === 'صرف'),
      label,
    ).toHaveLength(4)
  })

  it('has the expected movement mix', () => {
    const by = (type: string) => result.movements.filter((m) => m.type === type).length
    expect(by('إضافة')).toBe(143)
    expect(by('صرف')).toBe(89)
    expect(result.movements.filter((m) => m.note === 'رصيد افتتاحي')).toHaveLength(89)
    expect(result.movements.filter((m) => m.note === 'تسوية عجز الجرد')).toHaveLength(35)
  })

  it('matches 97/97 balances; status differences come only from the six dates', () => {
    const report = parityOf(result)
    expect(report.total).toBe(97)
    expect(report.balanceMatched).toBe(97)
    expect(report.diffs.filter((d) => d.kind !== 'status')).toEqual([])
    // Put the six dates back as the workbook has them: every status must then agree.
    const original = result.movements.map((m) =>
      result.remappedRows.includes(m.row) ? { ...m, businessDate: TYPO_DATE } : m,
    )
    const asWorkbook = computeParity({
      items: result.items,
      movements: original,
      cached: result.cached,
      remappedCount: 0,
    })
    expect(asWorkbook.statusMatched).toBe(97)
  })
})
