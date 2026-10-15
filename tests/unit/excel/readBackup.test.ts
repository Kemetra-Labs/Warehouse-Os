// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  backupFile,
  ITEMS_SHEET,
  MOVEMENTS_SHEET,
  type BackupData,
} from '../../../src/excel/backup'
import { readBackup } from '../../../src/excel/readBackup'
import { item, mov } from '../../helpers/exportFixtures'

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

function withoutKey<T extends object>(value: T, key: keyof T): Partial<T> {
  const copy = { ...value }
  delete copy[key]
  return copy
}

const DATA: BackupData = {
  items: [
    item('SCR-01', {
      page: 1,
      authorityCode: '123456789',
      reorderManual: 6,
      gtins: ['6221234567890', '12345670'],
      nameEn: 'Bone screw',
      active: true,
    }),
    item('SCR-02', { page: 2, gtins: [], priceMinor: 999, active: false }),
  ],
  movements: [
    mov({
      id: 'r1-L1',
      type: 'إضافة',
      qty: 10,
      batchNo: 'LOT7',
      expiry: '2028-03',
      docNumber: '70000409',
      supplier: 'إيجي فيكس',
      source: { kind: 'receipt', id: 'r1' },
    }),
    mov({
      id: 'b1-L1',
      type: 'صرف',
      itemCode: 'SCR-01',
      qty: 3,
      batchNo: 'LOT7',
      expiry: '2028-03',
      reference: '1001',
      note: 'بدل SCR-02',
      source: { kind: 'issue', id: 'b1' },
      substituteFor: { itemCode: 'SCR-02', qty: 3 },
    }),
    mov({
      id: 'rev-b1-L1',
      type: 'تسوية',
      itemCode: 'SCR-01',
      qty: 3,
      reverses: 'b1-L1',
      reason: 'اتكرر',
      source: { kind: 'manual', id: null },
    }),
    mov({ id: 'imp-r7', itemCode: 'SCR-02', source: { kind: 'import', id: null, row: 7 } }),
  ],
  receipts: [],
  issueBatches: [],
}

async function read(data: BackupData = DATA, edit?: (book: ExcelJS.Workbook) => void) {
  const file = await backupFile(data, '2026-10-12')
  if (!edit) return readBackup(toBuffer(file.bytes))
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(toBuffer(file.bytes))
  edit(book)
  return readBackup(toBuffer(new Uint8Array(await book.xlsx.writeBuffer())))
}

describe('readBackup', () => {
  it('reads back every item field the backup keeps (all but the server stamp)', async () => {
    const r = await read()
    expect(r.errors).toEqual([])
    expect(r.items).toEqual(DATA.items.map((i) => withoutKey(i, 'updatedAt')))
  })

  it('reads back every movement field the backup keeps (all but postedAt)', async () => {
    const r = await read()
    expect(r.errors).toEqual([])
    expect(r.movements).toEqual(DATA.movements.map((m) => withoutKey(m, 'postedAt')))
  })

  it('refuses a file that is not a backup', async () => {
    const book = new ExcelJS.Workbook()
    book.addWorksheet('ورقة')
    const bytes = new Uint8Array(await book.xlsx.writeBuffer())
    const r = await readBackup(toBuffer(bytes))
    expect(r.items).toEqual([])
    expect(r.errors[0]).toContain('مش ملف نسخة احتياطية')
    expect(readBackup(new ArrayBuffer(8)).errors[0]).toContain('مش ملف')
  })

  it('reports a row that does not parse, with its sheet and row', async () => {
    const r = await read(DATA, (book) => {
      book.getWorksheet(MOVEMENTS_SHEET)!.getCell('D3').value = 'كثير' // qty of the 2nd movement
    })
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain(`${MOVEMENTS_SHEET}، صف 3`)
    expect(r.errors[0]).toContain('b1-L1')
  })

  it('reports a movement of an item that is not in the file, and a duplicate id', async () => {
    const r = await read({
      ...DATA,
      movements: [mov({ id: 'x1', itemCode: 'ZZZ-99' }), mov({ id: 'x1' })],
    })
    expect(r.errors.some((e) => e.includes('ZZZ-99'))).toBe(true)
    expect(r.errors.some((e) => e.includes('x1') && e.includes('مكرر'))).toBe(true)
  })

  it('reports a reversal the rules would refuse, and a normal movement that reverses', async () => {
    const r = await read({
      ...DATA,
      movements: [
        mov({ id: 'rev-a', type: 'تسوية', qty: 1, reverses: 'zzz', reason: 'س' }),
        mov({ id: 'b', reverses: 'a' }),
      ],
    })
    expect(r.errors.some((e) => e.includes('rev-a') && e.includes('عكس'))).toBe(true)
    expect(r.errors.some((e) => e.includes('بتعكس'))).toBe(true)
  })

  it('reports a missing column by name', async () => {
    const r = await read(DATA, (book) => {
      book.getWorksheet(ITEMS_SHEET)!.getCell('B1').value = 'عمود تاني'
    })
    expect(r.errors[0]).toContain('أعمدة ناقصة')
    expect(r.errors[0]).toContain('الصفحة')
  })
})
