// @vitest-environment node
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { ImportError } from '../../../src/excel/errors'
import { readAuthorityMapping, type MappableItem } from '../../../src/excel/importAuthorityCodes'
import { bookToBuffer } from '../../helpers/workbook'

type Cell = string | number | null

const HEADER: Cell[] = ['الكود', 'كود الهيئة', 'تأكيد']

/** A one-sheet workbook the way the owner would send it back: header, then one row per item. */
function mapping(rows: readonly Cell[][], header: readonly Cell[] = HEADER): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([[...header], ...rows.map((r) => [...r])])
  XLSX.utils.book_append_sheet(wb, ws, 'الأكواد')
  return bookToBuffer(wb)
}

const item = (code: string, authorityCode: string | null = null): MappableItem => ({
  code,
  authorityCode,
})
const ITEMS: readonly MappableItem[] = [
  item('SCR-01'),
  item('SCR-02'),
  item('SCR-03'),
  item('PLT-01', '70000001'),
]

describe('readAuthorityMapping: confirmed rows', () => {
  it('turns each confirmed row into an update', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', 'نعم'],
        ['SCR-02', '150004771', '✓'],
      ]),
      ITEMS,
    )
    expect(res.updates).toEqual([
      { itemCode: 'SCR-01', authorityCode: '70000409' },
      { itemCode: 'SCR-02', authorityCode: '150004771' },
    ])
    expect(res.rejected).toEqual([])
    expect(res.unknownCodes).toEqual([])
    expect(res.skippedUnconfirmed).toBe(0)
  })

  it('reads a code stored as a number, with spaces, lower case or Arabic digits', () => {
    const res = readAuthorityMapping(
      mapping([
        ['scr-01 ', 70000409, 'نعم'],
        [' SCR-02', '١٥٠٠٠٤٧٧١', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.updates).toEqual([
      { itemCode: 'SCR-01', authorityCode: '70000409' },
      { itemCode: 'SCR-02', authorityCode: '150004771' },
    ])
  })

  it('accepts the usual ways of saying yes, whatever the case', () => {
    const yes = ['نعم', 'تم', 'أيوه', 'ايوه', '✓', '✔', 'x', 'X', 'yes', 'YES', 'true', 'TRUE', 1]
    for (const mark of yes) {
      const res = readAuthorityMapping(mapping([['SCR-01', '70000409', mark]]), ITEMS)
      expect(res.updates, `mark ${String(mark)}`).toHaveLength(1)
    }
  })

  it('finds the columns by their header wherever they sit, and ignores other columns', () => {
    const res = readAuthorityMapping(
      mapping(
        [['ملاحظة', 'SCR-01', 'اسم', '70000409', 'نعم']],
        ['ملاحظات', 'الكود', 'الاسم', 'كود الهيئة', 'تأكيد'],
      ),
      ITEMS,
    )
    expect(res.updates).toEqual([{ itemCode: 'SCR-01', authorityCode: '70000409' }])
  })
})

describe('readAuthorityMapping: unconfirmed rows', () => {
  it('skips rows with an empty or negative confirmation and counts them', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', null],
        ['SCR-02', '150004771', 'لا'],
        ['SCR-03', '70000410', 'ممكن'],
        ['SCR-03', '70000411', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.skippedUnconfirmed).toBe(3)
    expect(res.updates).toEqual([{ itemCode: 'SCR-03', authorityCode: '70000411' }])
  })

  it('does not report an unconfirmed row as unknown, rejected or a duplicate', () => {
    const res = readAuthorityMapping(
      mapping([
        ['NOP-01', '70000409', null],
        ['SCR-01', 'abc', null],
        ['SCR-02', '70000500', 'نعم'],
        ['SCR-03', '70000500', null],
      ]),
      ITEMS,
    )
    expect(res.unknownCodes).toEqual([])
    expect(res.rejected).toEqual([])
    expect(res.updates).toEqual([{ itemCode: 'SCR-02', authorityCode: '70000500' }])
  })

  it('ignores blank rows', () => {
    const res = readAuthorityMapping(
      mapping([
        [null, null, null],
        ['SCR-01', '70000409', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.updates).toHaveLength(1)
    expect(res.skippedUnconfirmed).toBe(0)
  })
})

describe('readAuthorityMapping: item codes', () => {
  it('lists confirmed item codes that are not in the app, once each', () => {
    const res = readAuthorityMapping(
      mapping([
        ['NOP-01', '70000409', 'نعم'],
        ['nop-01', '70000410', 'نعم'],
        ['???', '70000411', 'نعم'],
        ['SCR-01', '70000412', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.unknownCodes).toEqual(['NOP-01', '???'])
    expect(res.updates).toEqual([{ itemCode: 'SCR-01', authorityCode: '70000412' }])
  })
})

describe('readAuthorityMapping: rejected rows', () => {
  const reasons = (res: ReturnType<typeof readAuthorityMapping>) =>
    res.rejected.map((r) => `${r.itemCode}:${r.reason}`)

  it('rejects an authority code that is not 8 or 9 digits', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '1234567', 'نعم'],
        ['SCR-02', '1234567890', 'نعم'],
        ['SCR-03', 'AB123456', 'نعم'],
      ]),
      ITEMS,
    )
    expect(reasons(res)).toEqual([
      'SCR-01:invalid-code',
      'SCR-02:invalid-code',
      'SCR-03:invalid-code',
    ])
    expect(res.updates).toEqual([])
  })

  it('rejects an authority code written for two different items in the file', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', 'نعم'],
        ['SCR-02', '70000409', 'نعم'],
        ['SCR-03', '70000500', 'نعم'],
      ]),
      ITEMS,
    )
    expect(reasons(res)).toEqual(['SCR-01:duplicate-in-file', 'SCR-02:duplicate-in-file'])
    expect(res.updates).toEqual([{ itemCode: 'SCR-03', authorityCode: '70000500' }])
  })

  it('rejects an item that is given two different authority codes in the file', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', 'نعم'],
        ['SCR-01', '70000410', 'نعم'],
      ]),
      ITEMS,
    )
    expect(reasons(res)).toEqual(['SCR-01:duplicate-in-file', 'SCR-01:duplicate-in-file'])
    expect(res.updates).toEqual([])
  })

  it('treats the same pair written twice as one update', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', 'نعم'],
        ['SCR-01', '70000409', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.updates).toEqual([{ itemCode: 'SCR-01', authorityCode: '70000409' }])
    expect(res.rejected).toEqual([])
  })

  it('rejects an authority code another item already holds (FR-016)', () => {
    const res = readAuthorityMapping(mapping([['SCR-01', '70000001', 'نعم']]), ITEMS)
    expect(reasons(res)).toEqual(['SCR-01:held-by-other-item'])
    expect(res.rejected[0]?.heldBy).toBe('PLT-01')
    expect(res.updates).toEqual([])
  })

  it('does not overwrite a different code the item already has', () => {
    const res = readAuthorityMapping(mapping([['PLT-01', '70000999', 'نعم']]), ITEMS)
    expect(reasons(res)).toEqual(['PLT-01:already-different'])
    expect(res.updates).toEqual([])
  })

  it('counts a row that matches what the item already holds as unchanged', () => {
    const res = readAuthorityMapping(mapping([['PLT-01', '70000001', 'نعم']]), ITEMS)
    expect(res.unchanged).toBe(1)
    expect(res.updates).toEqual([])
    expect(res.rejected).toEqual([])
  })

  it('carries the sheet row number of each rejection', () => {
    const res = readAuthorityMapping(
      mapping([
        ['SCR-01', '70000409', 'نعم'],
        ['SCR-02', 'bad', 'نعم'],
      ]),
      ITEMS,
    )
    expect(res.rejected[0]).toMatchObject({ row: 3, itemCode: 'SCR-02', authorityCode: 'bad' })
  })
})

describe('readAuthorityMapping: bad files', () => {
  const expectError = (fn: () => unknown, code: string): void => {
    try {
      fn()
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError)
      expect((err as ImportError).code).toBe(code)
      expect((err as ImportError).message).toMatch(/[؀-ۿ]/)
      return
    }
    throw new Error('expected an ImportError')
  }

  it('refuses a file without the three headers, naming what is missing', () => {
    expectError(
      () => readAuthorityMapping(mapping([['SCR-01', '70000409']], ['الكود', 'كود الهيئة']), ITEMS),
      'bad-header',
    )
    expectError(
      () =>
        readAuthorityMapping(mapping([['SCR-01', 'x', 'نعم']], ['كود', 'الهيئة', 'تأكيد']), ITEMS),
      'bad-header',
    )
  })

  it('refuses something that is not an xlsx file', () => {
    const text = new TextEncoder().encode('الكود,كود الهيئة').buffer as ArrayBuffer
    expectError(() => readAuthorityMapping(text, ITEMS), 'unreadable-file')
  })

  it('does not stumble over header wording: spaces and direction marks are ignored', () => {
    const res = readAuthorityMapping(
      mapping([['SCR-01', '70000409', 'نعم']], ['‏الكود ', ' كود  الهيئة', 'تأكيد‏']),
      ITEMS,
    )
    expect(res.updates).toHaveLength(1)
  })
})
