import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { buildFixtureBook } from '../../scripts/make-fixture.mjs'

const FIXTURE = resolve(import.meta.dirname, '..', 'fixtures', 'mini-workbook.xlsx')

/** An exact-size ArrayBuffer (a Node Buffer's `.buffer` may be a larger shared pool). */
export function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export function fixtureBuffer(): ArrayBuffer {
  return toArrayBuffer(readFileSync(FIXTURE))
}

export function bookToBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** The fixture with the 2026-01-08 row already corrected (cached statuses recomputed). */
export function correctedFixtureBuffer(): ArrayBuffer {
  return bookToBuffer(buildFixtureBook({ correctedDates: true }))
}

/** Reads the fixture, lets `edit` change it in memory, and returns the new .xlsx bytes. */
export function mutateFixture(edit: (wb: XLSX.WorkBook) => void): ArrayBuffer {
  const wb = XLSX.read(new Uint8Array(fixtureBuffer()), { type: 'array', cellDates: false })
  edit(wb)
  return bookToBuffer(wb)
}

export function sheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`fixture has no sheet ${name}`)
  return ws
}

export function setCell(
  ws: XLSX.WorkSheet,
  col: string,
  row: number,
  value: string | number | null,
): void {
  const addr = XLSX.utils.encode_cell({ c: XLSX.utils.decode_col(col), r: row - 1 })
  if (value === null) delete ws[addr]
  else ws[addr] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value }
}

export function getCell(ws: XLSX.WorkSheet, col: string, row: number): unknown {
  const cell = ws[XLSX.utils.encode_cell({ c: XLSX.utils.decode_col(col), r: row - 1 })] as
    XLSX.CellObject | undefined
  return cell?.v
}
