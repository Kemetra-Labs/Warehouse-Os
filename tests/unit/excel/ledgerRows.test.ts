// @vitest-environment node
// The business date must survive any device time zone. Set Cairo before any Date exists.
process.env.TZ = 'Africa/Cairo'

import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'
import type { MovementDoc } from '../../../src/data/deriveLedger'
import { ledgerExportedPatch } from '../../../src/data/repos/settings'
import {
  capacityCheck,
  COL,
  dateFromIso,
  LEDGER_CAPACITY,
  ledgerPasteSteps,
  ledgerRowOf,
  noteText,
  planLedgerExport,
  selectExportable,
  usedLedgerRows,
} from '../../../src/excel/ledgerPlan'
import { buildLedgerWorkbook, ledgerFile, ledgerFileName } from '../../../src/excel/ledgerRows'
import { serialToIso } from '../../../src/excel/serial'
import { mov, nameOf, ts } from '../../helpers/exportFixtures'

vi.mock('../../../src/data/firebase', () => ({ getFirebase: () => ({ db: {} }) }))

const FORMULA_COLUMNS = [0, 1, 5, 6, 7, 9, 13, 14] // A B F G H J N O

describe('the time zone of this run', () => {
  it('is Cairo (otherwise the date tests prove nothing)', () => {
    // Cairo is UTC+2 in January; getTimezoneOffset is minutes behind UTC.
    expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(-120)
  })
})

describe('selectExportable', () => {
  it('never exports an imported movement, so the first export after an import is empty', () => {
    const imported = [
      mov({ id: 'imp-r5', source: { kind: 'import', id: null, row: 5 } }),
      mov({ id: 'imp-r6', source: { kind: 'import', id: null, row: 6 } }),
    ]
    expect(selectExportable(imported, [])).toEqual([])
  })

  it('skips the ids already recorded as exported and keeps the rest', () => {
    const a = mov({ id: 'a' })
    const b = mov({ id: 'b' })
    expect(selectExportable([a, b], ['a']).map((m) => m.id)).toEqual(['b'])
    expect(selectExportable([a, b], ['a', 'b'])).toEqual([])
  })

  it('orders by business date, then posting time, then id', () => {
    const late = mov({ id: 'late', businessDate: '2026-10-13', postedAt: ts(1) })
    const secondPosted = mov({ id: 'x2', businessDate: '2026-10-12', postedAt: ts(200) })
    const firstPosted = mov({ id: 'x1', businessDate: '2026-10-12', postedAt: ts(100) })
    const tieB = mov({ id: 'tie-b', businessDate: '2026-10-11', postedAt: ts(5) })
    const tieA = mov({ id: 'tie-a', businessDate: '2026-10-11', postedAt: ts(5) })
    const picked = selectExportable([late, secondPosted, tieB, firstPosted, tieA], [])
    expect(picked.map((m) => m.id)).toEqual(['tie-a', 'tie-b', 'x1', 'x2', 'late'])
  })

  it('does not change the list it is given', () => {
    const list = [mov({ businessDate: '2026-10-13' }), mov({ businessDate: '2026-10-01' })]
    const before = list.map((m) => m.id)
    selectExportable(list, [])
    expect(list.map((m) => m.id)).toEqual(before)
  })
})

describe('ledgerRowOf', () => {
  const full = mov({
    type: 'إضافة',
    itemCode: 'SCR-01',
    qty: 8,
    businessDate: '2026-10-12',
    supplier: 'شركة الأمل',
    docNumber: 'D-77',
    reference: 'INV-9',
    note: 'ناقص من المورد',
    batchNo: 'B-1',
    expiry: '2028-03',
  })

  it('fills columns C D E I K L M P Q R and nothing else', () => {
    const row = ledgerRowOf(full, nameOf)
    expect(row).toHaveLength(18)
    expect(row[COL.date]).toEqual(new Date(Date.UTC(2026, 9, 12)))
    expect(row[COL.type]).toBe('إضافة')
    expect(row[COL.code]).toBe('SCR-01')
    expect(row[COL.qty]).toBe(8)
    expect(row[COL.supplier]).toBe('شركة الأمل')
    expect(row[COL.docNumber]).toBe('D-77')
    expect(row[COL.note]).toBe('ناقص من المورد')
    expect(row[COL.reference]).toBe('INV-9')
    expect(row[COL.batchNo]).toBe('B-1')
    // A month-only expiry becomes the last day of that month.
    expect(row[COL.expiry]).toEqual(new Date(Date.UTC(2028, 2, 31)))
    for (const col of FORMULA_COLUMNS) expect(row[col]).toBeNull()
  })

  it('leaves empty fields null, never an empty string', () => {
    const row = ledgerRowOf(mov({ supplier: '', note: '  ' }), nameOf)
    expect(row[COL.supplier]).toBeNull()
    expect(row[COL.note]).toBeNull()
    expect(row[COL.batchNo]).toBeNull()
    expect(row[COL.expiry]).toBeNull()
    expect(row.some((c) => c === '')).toBe(false)
  })

  it('keeps a signed تسوية negative, and a مرتجع positive', () => {
    expect(ledgerRowOf(mov({ type: 'تسوية', qty: -3 }), nameOf)[COL.qty]).toBe(-3)
    expect(ledgerRowOf(mov({ type: 'تسوية', qty: 2 }), nameOf)[COL.qty]).toBe(2)
    const ret = ledgerRowOf(mov({ type: 'مرتجع', qty: 2 }), nameOf)
    expect([ret[COL.type], ret[COL.qty]]).toEqual(['مرتجع', 2])
  })

  it('exports a reversal as its تسوية row, with the reason in the note column', () => {
    const reversal = mov({ id: 'rev-x', type: 'تسوية', qty: -5, reverses: 'x', reason: 'اتكرر' })
    const row = ledgerRowOf(reversal, nameOf)
    expect([row[COL.type], row[COL.qty], row[COL.note]]).toEqual(['تسوية', -5, 'اتكرر'])
  })

  it('writes the substitute once, by name, with the reason', () => {
    const sub = mov({
      type: 'صرف',
      note: 'بدل SCR-09',
      substituteFor: { itemCode: 'SCR-09', qty: 2 },
      reason: 'رصيد سالب',
    })
    expect(noteText(sub, nameOf)).toBe('بدل صنف SCR-09 - رصيد سالب')
    // A person's own note is kept next to it.
    const own: MovementDoc = { ...sub, note: 'مستعجل' }
    expect(noteText(own, nameOf)).toBe('مستعجل - بدل صنف SCR-09 - رصيد سالب')
  })

  it('falls back to the code when the substitute is unknown', () => {
    const sub = mov({ substituteFor: { itemCode: 'ZZZ-99', qty: 1 } })
    expect(noteText(sub, () => null)).toBe('بدل ZZZ-99')
  })
})

describe('dates', () => {
  it('builds a UTC-midnight date, so the Cairo zone cannot move the day', () => {
    const date = dateFromIso('2026-01-01')
    expect(date?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(dateFromIso('2026-1-1')).toBeNull()
    expect(dateFromIso('nope')).toBeNull()
  })

  it('writes the same calendar day into the file that the movement has (under TZ=Africa/Cairo)', async () => {
    const days = ['2026-01-01', '2026-03-31', '2026-10-12', '2026-12-31']
    const plan = planLedgerExport(
      days.map((d, i) => mov({ id: `d${i}`, businessDate: d, expiry: d })),
      [],
      nameOf,
    )
    const { bytes } = await ledgerFile(plan)
    // Read the raw serials with the same reader the import uses.
    const ws = XLSX.read(bytes, { type: 'array', cellDates: false }).Sheets['سطور الحركات']
    expect(ws).toBeDefined()
    days.forEach((day, i) => {
      const business = ws?.[`C${i + 1}`] as XLSX.CellObject
      const expiry = ws?.[`R${i + 1}`] as XLSX.CellObject
      expect(serialToIso(Number(business.v))).toBe(day)
      expect(serialToIso(Number(expiry.v))).toBe(day)
    })
    // And exceljs reads a UTC-midnight Date back.
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.slice().buffer)
    const back = book.worksheets[0]?.getCell('C3').value
    expect(back).toBeInstanceOf(Date)
    expect((back as Date).getTime()).toBe(Date.UTC(2026, 9, 12))
  })
})

describe('buildLedgerWorkbook', () => {
  const movements = [
    mov({ id: 'a', businessDate: '2026-10-11', type: 'إضافة', qty: 10, itemCode: 'SCR-01' }),
    mov({ id: 'b', businessDate: '2026-10-12', type: 'تسوية', qty: -2, itemCode: 'SCR-02' }),
  ]

  async function reload(plan = planLedgerExport(movements, [], nameOf)) {
    const { bytes } = await ledgerFile(plan)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.slice().buffer)
    return book
  }

  it('is one sheet, right to left, with the rows from A1 in table order', async () => {
    const book = await reload()
    expect(book.worksheets).toHaveLength(1)
    const sheet = book.worksheets[0]
    expect(sheet?.views[0]).toMatchObject({ rightToLeft: true })
    expect([sheet?.getCell('D1').value, sheet?.getCell('E1').value]).toEqual(['إضافة', 'SCR-01'])
    expect(sheet?.getCell('I1').value).toBe(10)
    expect([sheet?.getCell('D2').value, sheet?.getCell('I2').value]).toEqual(['تسوية', -2])
  })

  it('follows the contract for every sheet: A4 portrait, fit to one page wide, Arial', async () => {
    const sheet = (await reload()).worksheets[0]
    expect(sheet?.pageSetup.paperSize).toBe(9)
    expect(sheet?.pageSetup.orientation).toBe('portrait')
    expect(sheet?.pageSetup.fitToPage).toBe(true)
    expect(sheet?.pageSetup.fitToWidth).toBe(1)
    expect(sheet?.pageSetup.showGridLines).toBeFalsy()
    expect(sheet?.getCell('E1').font?.name).toBe('Arial')
    expect(sheet?.getCell('C1').font?.name).toBe('Arial')
    expect(sheet?.getCell('T2').font?.name).toBe('Arial')
  })

  it('leaves the formula columns and the empty inputs truly empty', async () => {
    const sheet = (await reload()).worksheets[0]
    for (const rowNo of [1, 2]) {
      for (const col of FORMULA_COLUMNS) {
        expect(sheet?.getRow(rowNo).getCell(col + 1).value).toBeNull()
      }
      // K supplier, L docNumber, M, P, Q and R are empty on these movements: null, not ''.
      for (const letter of ['K', 'L', 'M', 'P', 'Q', 'R']) {
        expect(sheet?.getCell(`${letter}${rowNo}`).value).toBeNull()
      }
    }
    // The raw file has no cell record for them at all.
    const bytes = (await ledgerFile(planLedgerExport(movements, [], nameOf))).bytes
    const raw = XLSX.read(bytes, { type: 'array' }).Sheets['سطور الحركات']
    for (const addr of ['A1', 'B1', 'F1', 'G1', 'H1', 'J1', 'N1', 'O1', 'K1', 'L1', 'M1']) {
      expect(raw?.[addr]).toBeUndefined()
    }
  })

  it('puts the steps in column T, outside the rows to copy', async () => {
    const sheet = (await reload()).worksheets[0]
    expect(String(sheet?.getCell('T3').value)).toContain('A1:R2')
    expect(String(sheet?.getCell('T4').value)).toContain('Ctrl+C')
    expect(sheet?.columnCount).toBe(20)
  })

  it('says there is nothing to paste when there are no rows', async () => {
    const sheet = (await reload(planLedgerExport([], [], nameOf))).worksheets[0]
    expect(sheet?.getCell('T1').value).toBe('مفيش سطور جديدة للصق.')
    expect(sheet?.getCell('A1').value).toBeNull()
  })

  it('builds the workbook without going through bytes', () => {
    expect(buildLedgerWorkbook({ rows: [] }).worksheets).toHaveLength(1)
  })
})

describe('file name and steps', () => {
  it('is named by the first and last business date', () => {
    const plan = planLedgerExport(
      [mov({ businessDate: '2026-10-01' }), mov({ businessDate: '2026-10-09' })],
      [],
      nameOf,
    )
    expect(ledgerFileName(plan)).toBe('سطور-الحركات-2026-10-01-2026-10-09.xlsx')
  })

  it('names the exact rows to select', () => {
    const steps = ledgerPasteSteps(37)
    expect(steps.join(' ')).toContain('A1:R37')
    expect(steps.join(' ')).toContain('Skip blanks')
  })
})

describe('capacity (table rows 5-595)', () => {
  it('has room for 591 rows', () => {
    expect(LEDGER_CAPACITY).toBe(591)
  })

  it('does not warn at exactly 591 and warns at 592', () => {
    expect(capacityCheck(500, 91).over).toBe(false)
    expect(capacityCheck(500, 91).warning).toBeNull()
    const over = capacityCheck(500, 92)
    expect(over.over).toBe(true)
    expect(over.free).toBe(91)
    expect(over.warning).toContain('91')
  })

  it('counts imported rows by their workbook row (skipped zero rows still occupy one)', () => {
    const imported = [
      mov({ id: 'imp-r5', source: { kind: 'import', id: null, row: 5 } }),
      mov({ id: 'imp-r241', source: { kind: 'import', id: null, row: 241 } }),
    ]
    // Rows 5-241 are used: 237 rows, plus 3 already pasted.
    expect(usedLedgerRows(imported, 3)).toBe(240)
    expect(usedLedgerRows([], 0)).toBe(0)
  })

  it('warns from the plan once used plus new rows pass row 595', () => {
    const imported = mov({ id: 'imp-r590', source: { kind: 'import', id: null, row: 590 } })
    const fresh = Array.from({ length: 7 }, (_, i) => mov({ id: `n${i}` }))
    // Rows 5-590 are used (586), so 5 are free and 7 are new.
    const plan = planLedgerExport([imported, ...fresh], [], nameOf)
    expect(plan.capacity.over).toBe(true)
    expect(plan.capacity.warning).not.toBeNull()
    expect(planLedgerExport([imported, ...fresh.slice(0, 5)], [], nameOf).capacity.over).toBe(false)
  })
})

describe('planLedgerExport', () => {
  it('is empty right after an import', () => {
    const plan = planLedgerExport(
      [mov({ id: 'imp-r5', source: { kind: 'import', id: null, row: 5 } })],
      [],
      nameOf,
    )
    expect(plan.rows).toEqual([])
    expect(plan.ids).toEqual([])
    expect([plan.from, plan.to]).toEqual([null, null])
  })

  it('lists the ids that "تم اللصق" records, and is empty once they are recorded', () => {
    const list = [mov({ id: 'a' }), mov({ id: 'b', businessDate: '2026-10-13' })]
    const first = planLedgerExport(list, [], nameOf)
    expect(first.ids).toEqual(['a', 'b'])
    expect([first.from, first.to]).toEqual(['2026-10-12', '2026-10-13'])
    expect(planLedgerExport(list, first.ids, nameOf).rows).toEqual([])
  })
})

describe('marking the exported ids', () => {
  it('unions the ids with arrayUnion (never rewrites the array) and stamps the export time', async () => {
    const { arrayUnion, FieldValue } = await import('firebase/firestore')
    const patch = ledgerExportedPatch(['a', 'b'])
    expect(patch.lastLedgerExportedIds.isEqual(arrayUnion('a', 'b'))).toBe(true)
    expect(patch.lastLedgerExportedIds.isEqual(arrayUnion('a'))).toBe(false)
    expect(patch.lastLedgerExportAt).toBeInstanceOf(FieldValue)
  })
})
