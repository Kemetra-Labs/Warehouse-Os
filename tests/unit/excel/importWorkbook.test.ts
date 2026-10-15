/**
 * Mapping tests for contracts/excel-import.md, run against the generated fixture
 * (`npm run fixture`) and in-memory edits of it.
 *
 * Time zones: the date rules must not depend on the machine's zone, so every test runs twice,
 * with `process.env.TZ` set to UTC and to Africa/Cairo before the import code runs. Node
 * re-reads TZ when it is assigned at runtime; `beforeAll` asserts the switch really happened
 * (a Cairo date in January has a non-zero UTC offset), so the suite cannot pass vacuously.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ImportError } from '../../../src/excel/errors'
import { importWorkbook } from '../../../src/excel/importWorkbook'
import { serialToIso } from '../../../src/excel/serial'
import { fixtureBuffer, getCell, mutateFixture, setCell, sheet } from '../../helpers/workbook'

const MOVEMENTS = 'سجل الحركات'
const ITEMS = 'القائمة الاساسية'
const BALANCES = 'الأرصدة اللحظية'

function expectImportError(fn: () => unknown, code: string): ImportError {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(ImportError)
    const e = err as ImportError
    expect(e.code).toBe(code)
    expect(e.message).toMatch(/[؀-ۿ]/)
    return e
  }
  throw new Error('expected an ImportError')
}

describe.each(['UTC', 'Africa/Cairo'])('importWorkbook (TZ=%s)', (zone) => {
  const originalTz = process.env.TZ

  beforeAll(() => {
    process.env.TZ = zone
    const offset = new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()
    if (zone === 'UTC') expect(offset).toBe(0)
    else expect(offset).not.toBe(0)
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  describe('items', () => {
    const result = () => importWorkbook(fixtureBuffer())
    const byCode = (code: string) => {
      const item = result().items.find((i) => i.code === code)
      if (!item) throw new Error(`no item ${code}`)
      return item
    }

    it('reads every item row until column D is empty', () => {
      expect(result().items).toHaveLength(8)
    })

    it('maps the columns to item fields', () => {
      expect(byCode('AAA-02')).toMatchObject({
        page: 2,
        category: 'فئة أ',
        nameAr: 'صنف تجريبي باء',
        nameEn: 'Test item A2',
        material: 'معدن',
        size: '4 مم',
        unit: 'قطعة',
        supplier: 'مورد تجريبي 1',
        priceMinor: 800,
        active: true,
        reorderManual: null,
      })
    })

    it('turns "غير محددة" and the em dash into empty strings', () => {
      expect(byCode('AAA-01')).toMatchObject({ material: '', size: '' })
    })

    it('converts the price to minor units without float drift', () => {
      expect(byCode('AAA-01').priceMinor).toBe(1250)
      expect(byCode('BBB-03').priceMinor).toBe(9999)
    })

    it('reads the manual reorder point and the stopped state', () => {
      expect(byCode('BBB-01').reorderManual).toBe(8)
      expect(byCode('CCC-02').active).toBe(false)
    })

    it('keeps a GTIN of 8 or 13 digits from a numeric cell and rejects the rest', () => {
      const r = result()
      expect(byCode('AAA-01').gtins).toEqual(['6001234567890'])
      expect(byCode('AAA-02').gtins).toEqual(['12345678'])
      expect(byCode('BBB-03').gtins).toEqual([])
      expect(r.gtinCount).toBe(4)
      expect(r.rejectedGtins).toEqual([{ row: 9, value: '12345' }])
      expect(r.warnings.some((w) => w.includes('صف 9') && w.includes('12345'))).toBe(true)
    })

    it('does not create an opening movement from column I (FR-002)', () => {
      const r = result()
      expect(r.openingBalances['AAA-01']).toBe(50)
      expect(r.movements).toHaveLength(20)
      const openings = r.movements.filter((m) => m.note === 'رصيد افتتاحي')
      expect(openings).toHaveLength(7)
      expect(openings.every((m) => m.id.startsWith('imp-r'))).toBe(true)
    })
  })

  describe('movements', () => {
    const all = () => importWorkbook(fixtureBuffer()).movements
    const row = (n: number) => {
      const m = all().find((x) => x.row === n)
      if (!m) throw new Error(`no movement at row ${n}`)
      return m
    }

    it('uses imp-r{row} ids and the workbook row order', () => {
      const ids = all().map((m) => m.id)
      expect(ids[0]).toBe('imp-r5')
      expect(ids.at(-1)).toBe('imp-r24')
      expect(new Set(ids).size).toBe(20)
    })

    it('reads the input columns', () => {
      expect(row(14)).toMatchObject({
        type: 'إضافة',
        itemCode: 'CCC-03',
        qty: 15,
        supplier: 'مورد تجريبي 3',
        docNumber: 'INV-77',
        batchNo: 'LOT-9',
        expiry: '2028-03-31',
        reference: null,
        note: null,
      })
      expect(row(12)).toMatchObject({ type: 'صرف', reference: 'دفعة 1' })
      expect(row(22)).toMatchObject({ type: 'تسوية', qty: -1 })
    })

    it('converts numeric invoice and batch numbers to text', () => {
      expect(row(12).docNumber).toBe('1001')
      expect(row(21).batchNo).toBe('12345')
    })

    it('reads an expiry written as text', () => {
      expect(row(21).expiry).toBe('2027-06')
    })

    it('computes dates from Excel serials, whatever the time zone', () => {
      expect(row(5).businessDate).toBe('2026-08-01')
      expect(row(12).businessDate).toBe('2026-08-10')
      expect(row(24).businessDate).toBe('2026-09-21')
    })

    it('remaps 2026-01-08 to 2026-08-01 and reports the row (FR-005)', () => {
      const r = importWorkbook(fixtureBuffer())
      expect(r.remappedRows).toEqual([23])
      expect(r.movements.find((m) => m.row === 23)?.businessDate).toBe('2026-08-01')
      expect(r.movements.some((m) => m.businessDate === '2026-01-08')).toBe(false)
    })

    it('ignores the formula columns (A, B, F, G, H, J, N, O)', () => {
      const base = importWorkbook(fixtureBuffer()).movements
      const edited = importWorkbook(
        mutateFixture((wb) => {
          const ws = sheet(wb, MOVEMENTS)
          for (const col of ['A', 'B', 'G', 'H', 'J', 'N']) setCell(ws, col, 5, 999999)
          setCell(ws, 'O', 5, 'خطأ')
        }),
      ).movements
      expect(edited).toEqual(base)
    })

    it('warns, without failing, when the name in column F differs from the item', () => {
      const r = importWorkbook(
        mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'F', 6, 'اسم تاني')),
      )
      expect(r.warnings.some((w) => w.includes('صف 6'))).toBe(true)
      expect(r.movements).toHaveLength(20)
    })

    it('drops an unreadable expiry with a warning', () => {
      const r = importWorkbook(
        mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'R', 14, 'قريبا')),
      )
      expect(r.movements.find((m) => m.row === 14)?.expiry).toBeNull()
      expect(r.warnings.some((w) => w.includes('صف 14'))).toBe(true)
    })

    it('refuses an error cell (#N/A) in the quantity instead of reading its error code', () => {
      const e = expectImportError(
        () =>
          importWorkbook(
            mutateFixture((wb) => {
              sheet(wb, MOVEMENTS).I6 = { t: 'e', v: 42, w: '#N/A' }
            }),
          ),
        'bad-row',
      )
      expect(e.message).toContain('صف 6')
    })

    it('refuses an error cell in the item price', () => {
      expectImportError(
        () =>
          importWorkbook(
            mutateFixture((wb) => {
              sheet(wb, ITEMS).K5 = { t: 'e', v: 7, w: '#DIV/0!' }
            }),
          ),
        'bad-row',
      )
    })

    it('accepts an ISO date typed as text', () => {
      const r = importWorkbook(
        mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'C', 6, '2026-08-05')),
      )
      expect(r.movements.find((m) => m.row === 6)?.businessDate).toBe('2026-08-05')
    })

    it('honours the 1904 date system', () => {
      const r = importWorkbook(
        mutateFixture((wb) => {
          const ws = sheet(wb, MOVEMENTS)
          for (let n = 5; n <= 24; n += 1) {
            setCell(ws, 'C', n, Number(getCell(ws, 'C', n)) - 1462)
          }
          wb.Workbook = { ...wb.Workbook, WBProps: { date1904: true } }
        }),
      )
      expect(r.movements.find((m) => m.row === 12)?.businessDate).toBe('2026-08-10')
      expect(r.remappedRows).toEqual([23])
    })
  })

  describe('cached balances', () => {
    it('reads an error cell in L as no balance, never as its error code', () => {
      const cached = importWorkbook(
        mutateFixture((wb) => {
          const ws = sheet(wb, BALANCES)
          const row = Array.from({ length: 40 }, (_, i) => i + 1).find((r) =>
            /^[A-Z]{3}-\d+$/.test(String(getCell(ws, 'C', r) ?? '')),
          )
          if (row === undefined) throw new Error('no item row in the balances sheet')
          ws[`L${row}`] = { t: 'e', v: 42, w: '#N/A' }
        }),
      ).cached
      expect(cached.some((c) => c.balance === 42)).toBe(false)
      expect(cached.filter((c) => c.balance === null)).toHaveLength(1)
    })

    it('reads L and N for rows whose column C is an item code, skipping the total row', () => {
      const cached = importWorkbook(fixtureBuffer()).cached
      expect(cached).toHaveLength(8)
      expect(cached[0]).toMatchObject({ code: 'AAA-01', balance: 30 })
      expect(cached.find((c) => c.code === 'BBB-03')).toMatchObject({
        balance: -4,
        status: 'تجاوز — رصيد سالب',
      })
    })
  })

  describe('named errors (nothing is returned, so nothing can be written)', () => {
    it.each([ITEMS, MOVEMENTS, BALANCES])('missing sheet "%s"', (name) => {
      const buf = mutateFixture((wb) => {
        wb.SheetNames = wb.SheetNames.filter((n) => n !== name)
        delete wb.Sheets[name]
      })
      const err = expectImportError(() => importWorkbook(buf), 'missing-sheet')
      expect(err.message).toContain(name)
    })

    it('wrong header in A4:R4', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'E', 4, 'كود'))
      const err = expectImportError(() => importWorkbook(buf), 'bad-header')
      expect(err.message).toContain('العمود E')
    })

    it('a missing header cell', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'R', 4, null))
      expectImportError(() => importWorkbook(buf), 'bad-header')
    })

    it('headers with extra spaces or line breaks still match', () => {
      const buf = mutateFixture((wb) => {
        const ws = sheet(wb, MOVEMENTS)
        setCell(ws, 'G', 4, ' الخامة /\nالمواصفة ')
        setCell(ws, 'L', 4, 'رقم  الفاتورة / الإذن')
      })
      expect(importWorkbook(buf).movements).toHaveLength(20)
    })

    it('a file that is not a workbook', () => {
      const junk = new TextEncoder().encode('not a workbook').buffer as ArrayBuffer
      expectImportError(() => importWorkbook(junk), 'unreadable-file')
    })

    it('an unknown movement type', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'D', 8, 'بيع'))
      expect(expectImportError(() => importWorkbook(buf), 'bad-row').message).toContain('صف 8')
    })

    it('a movement for a code that is not an item', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'E', 8, 'ZZZ-99'))
      expectImportError(() => importWorkbook(buf), 'bad-row')
    })

    it('skips a zero-quantity row with a warning instead of failing', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'I', 12, 0))
      const result = importWorkbook(buf)
      expect(result.skippedZeroRows).toEqual([12])
      expect(result.movements.some((m) => m.row === 12)).toBe(false)
      expect(result.warnings.some((w) => w.includes('صف 12') && w.includes('صفر'))).toBe(true)
    })

    it.each([-3, 1.5])('an invalid quantity %s on a صرف row', (qty) => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'I', 12, qty))
      expectImportError(() => importWorkbook(buf), 'bad-row')
    })

    it('an invalid date', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, MOVEMENTS), 'C', 8, 'امبارح'))
      expectImportError(() => importWorkbook(buf), 'bad-row')
    })

    it('a duplicate item code', () => {
      const buf = mutateFixture((wb) => setCell(sheet(wb, ITEMS), 'C', 6, 'AAA-01'))
      expectImportError(() => importWorkbook(buf), 'duplicate-code')
    })

    it('an invalid item code, price or an empty item list', () => {
      expectImportError(
        () => importWorkbook(mutateFixture((wb) => setCell(sheet(wb, ITEMS), 'C', 5, 'bad'))),
        'bad-row',
      )
      expectImportError(
        () => importWorkbook(mutateFixture((wb) => setCell(sheet(wb, ITEMS), 'K', 5, 'abc'))),
        'bad-row',
      )
      expectImportError(
        () =>
          importWorkbook(
            mutateFixture((wb) => {
              for (let n = 5; n <= 12; n += 1) setCell(sheet(wb, ITEMS), 'D', n, null)
            }),
          ),
        'no-items',
      )
    })
  })
})

describe('serialToIso', () => {
  it('matches known serials', () => {
    expect(serialToIso(45292)).toBe('2024-01-01')
    expect(serialToIso(45351)).toBe('2024-02-29')
    expect(serialToIso(45658)).toBe('2025-01-01')
    expect(serialToIso(45658.75)).toBe('2025-01-01')
    expect(serialToIso(61)).toBe('1900-03-01')
  })

  it('rejects values that are not dates', () => {
    expect(serialToIso(0)).toBeNull()
    expect(serialToIso(Number.NaN)).toBeNull()
    expect(serialToIso(5_000_000)).toBeNull()
  })
})
