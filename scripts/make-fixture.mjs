// Writes tests/fixtures/mini-workbook.xlsx: a small FAKE workbook shaped like the real one
// (contracts/excel-import.md). Items, prices and movements are invented; nothing is copied
// from the user's workbook. Run with `npm run fixture`.
//
// Cached values in "الأرصدة اللحظية" (L balance, N status) are computed here with the same
// rules as src/domain, from the RAW dates, like the real workbook: the 2026-01-08 row is NOT
// corrected, so months-of-consumption is 9 and two statuses differ from the app's (months = 2).
// `buildFixtureBook({ correctedDates: true })` produces the corrected variant for tests.
//
// SheetJS CE cannot write Excel table definitions, so the "الحركات" table (A4:R595) is not
// recreated. The import checks the A4:R4 header text instead, so it does not need it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as XLSX from 'xlsx'

const ITEMS_SHEET = 'القائمة الاساسية'
const MOVEMENTS_SHEET = 'سجل الحركات'
const BALANCES_SHEET = 'الأرصدة اللحظية'
const TYPO_DATE = '2026-01-08'
const CORRECTED_DATE = '2026-08-01'
const STATUS = {
  OVERDRAWN: 'تجاوز — رصيد سالب',
  OUT: 'نافد',
  REORDER: 'يحتاج طلب',
  AVAILABLE: 'متاح',
}

const ITEM_HEADERS = [
  'م',
  'الفئة',
  'الكود',
  'الصنف',
  'الاسم الإنجليزي المعتمد / Item Name (English)',
  'الخامة',
  'المقاس / المواصفة',
  'الوحدة',
  'الرصيد الافتتاحي (ثابت)',
  'الرصيد الحالي',
  'سعر القطعة (ج)',
  'قيمة المخزون',
  'الشركة الموردة',
  'GTIN',
  'الأمان',
  'حالة الصنف',
  'ملاحظة',
  'حد الطلب (يدوي)',
]
const MOVEMENT_HEADERS = [
  'م',
  'مسلسل الصنف',
  'التاريخ',
  'نوع الحركة',
  'الكود',
  'الصنف',
  'الخامة / المواصفة',
  'الوحدة',
  'الكمية',
  'الأثر على الرصيد',
  'الشركة الموردة',
  'رقم الفاتورة / الإذن',
  'ملاحظات',
  'الرصيد الجاري بعد الحركة',
  'تحقق',
  'المرجع',
  'رقم التشغيلة',
  'تاريخ الانتهاء',
]

// [page, category, code, nameAr, nameEn, material, size, unit, opening, price, supplier, gtin, state, reorderManual]
const ITEMS = [
  [
    1,
    'فئة أ',
    'AAA-01',
    'صنف تجريبي ألف',
    'Test item A1',
    'غير محددة',
    '—',
    'قطعة',
    50,
    12.5,
    'مورد تجريبي 1',
    6001234567890,
    'نشط',
    null,
  ],
  [
    2,
    'فئة أ',
    'AAA-02',
    'صنف تجريبي باء',
    'Test item A2',
    'معدن',
    '4 مم',
    'قطعة',
    20,
    8,
    'مورد تجريبي 1',
    12345678,
    'نشط',
    null,
  ],
  [
    3,
    'فئة ب',
    'BBB-01',
    'صنف تجريبي جيم',
    'Test item B1',
    'بلاستيك',
    '2 سم',
    'علبة',
    30,
    30.25,
    'مورد تجريبي 2',
    6001234567891,
    'نشط',
    8,
  ],
  [
    4,
    'فئة ب',
    'BBB-02',
    'صنف تجريبي دال',
    'Test item B2',
    'غير محددة',
    '—',
    'علبة',
    10,
    5,
    'مورد تجريبي 2',
    null,
    'نشط',
    null,
  ],
  [
    5,
    'فئة ب',
    'BBB-03',
    'صنف تجريبي هاء',
    'Test item B3',
    'معدن',
    '—',
    'قطعة',
    8,
    99.99,
    'مورد تجريبي 2',
    12345,
    'نشط',
    null,
  ],
  [
    6,
    'فئة ج',
    'CCC-01',
    'صنف تجريبي واو',
    'Test item C1',
    'تيتانيوم',
    '3.5 مم',
    'قطعة',
    40,
    150,
    'مورد تجريبي 3',
    6001234567892,
    'نشط',
    null,
  ],
  [
    7,
    'فئة ج',
    'CCC-02',
    'صنف تجريبي زاي',
    'Test item C2',
    'تيتانيوم',
    '2 مم',
    'قطعة',
    6,
    75,
    'مورد تجريبي 3',
    null,
    'موقوف',
    null,
  ],
  [
    8,
    'فئة ج',
    'CCC-03',
    'صنف تجريبي حاء',
    'Test item C3',
    'غير محددة',
    '—',
    'قطعة',
    0,
    20,
    'مورد تجريبي 3',
    null,
    'نشط',
    null,
  ],
]

// [date, type, code, qty, note, doc, supplier, reference, batch, expiry]
// expiry: an ISO date (written as an Excel serial), a text string, or null.
const MOVEMENTS = [
  ['2026-08-01', 'إضافة', 'AAA-01', 50, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'AAA-02', 20, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'BBB-01', 30, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'BBB-02', 10, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'BBB-03', 8, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'CCC-01', 40, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-01', 'إضافة', 'CCC-02', 6, 'رصيد افتتاحي', null, null, null, null, null],
  ['2026-08-10', 'صرف', 'AAA-01', 10, null, 1001, null, 'دفعة 1', null, null],
  ['2026-08-15', 'صرف', 'AAA-01', 12, null, null, null, 'دفعة 2', null, null],
  [
    '2026-08-20',
    'إضافة',
    'CCC-03',
    15,
    null,
    'INV-77',
    'مورد تجريبي 3',
    null,
    'LOT-9',
    '2028-03-31',
  ],
  ['2026-08-22', 'صرف', 'BBB-01', 25, null, null, null, 'دفعة 3', null, null],
  ['2026-08-25', 'صرف', 'BBB-02', 10, null, null, null, 'دفعة 3', null, null],
  ['2026-09-02', 'صرف', 'BBB-03', 12, null, null, null, 'دفعة 4', null, null],
  ['2026-09-05', 'صرف', 'CCC-01', 30, null, null, null, 'دفعة 5', null, null],
  ['2026-09-10', 'صرف', 'CCC-02', 3, null, null, null, 'دفعة 5', null, null],
  ['2026-09-12', 'صرف', 'AAA-02', 2, 'تسوية عجز الجرد', null, null, null, null, null],
  ['2026-09-15', 'مرتجع', 'AAA-01', 2, null, null, null, null, 12345, '2027-06'],
  ['2026-09-20', 'تسوية', 'CCC-03', -1, 'تسوية', null, null, null, null, null],
  [TYPO_DATE, 'إضافة', 'AAA-02', 5, 'توريد', null, null, null, null, null],
  ['2026-09-21', 'صرف', 'CCC-03', 4, null, null, null, 'دفعة 6', null, null],
]

const ISO = /^\d{4}-\d{2}-\d{2}$/
const serialOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25_569
}
const dayOf = (iso) => serialOf(iso) - 25_569

function effect(type, qty) {
  return type === 'صرف' ? -qty : qty
}

function statusOf(balance, reorder) {
  if (balance < 0) return STATUS.OVERDRAWN
  if (balance === 0) return STATUS.OUT
  if (balance <= reorder) return STATUS.REORDER
  return STATUS.AVAILABLE
}

/** Same rules as src/domain/status.ts, written independently on purpose. */
function expectedBalances(movements) {
  const dates = movements.map((m) => dayOf(m.date))
  const months = Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 30))
  const rows = ITEMS.map((item) => {
    const mine = movements.filter((m) => m.code === item[2])
    const balance = mine.reduce((s, m) => s + effect(m.type, m.qty), 0)
    const issued = mine.filter((m) => m.type === 'صرف').reduce((s, m) => s + m.qty, 0)
    const manual = item[13]
    const reorder =
      manual && manual > 0
        ? manual
        : issued > 0
          ? Math.max(1, Math.ceil((issued / months) * 1.5 - 1e-9))
          : 5
    return { code: item[2], balance, status: statusOf(balance, reorder) }
  })
  return { rows, months }
}

function headerRows(headers) {
  return [[], [], [], headers]
}

function dateCell(iso) {
  return { t: 'n', v: serialOf(iso), z: 'yyyy-mm-dd' }
}

function itemsSheet() {
  const rows = ITEMS.map((i) => [
    i[0],
    i[1],
    i[2],
    i[3],
    i[4],
    i[5],
    i[6],
    i[7],
    i[8],
    i[8],
    i[9],
    '',
    i[10],
    i[11],
    '',
    i[12],
    '',
    i[13],
  ])
  return XLSX.utils.aoa_to_sheet([...headerRows(ITEM_HEADERS), ...rows])
}

function movementsSheet(movements, balancesByRow) {
  const rows = movements.map((m, idx) => {
    const item = ITEMS.find((i) => i[2] === m.code)
    const expiry = m.expiry && ISO.test(m.expiry) ? dateCell(m.expiry) : m.expiry
    return [
      idx + 1,
      ITEMS.indexOf(item) + 1,
      dateCell(m.date),
      m.type,
      m.code,
      item[3],
      item[5],
      item[7],
      m.qty,
      effect(m.type, m.qty),
      m.supplier,
      m.doc,
      m.note,
      balancesByRow[idx],
      'سليم',
      m.reference,
      m.batch,
      expiry,
    ]
  })
  return XLSX.utils.aoa_to_sheet([...headerRows(MOVEMENT_HEADERS), ...rows])
}

function balancesSheet(expected) {
  const head = [
    'م',
    'الفئة',
    'الكود',
    'الصنف',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'الرصيد الحالي',
    '',
    'الحالة',
  ]
  const rows = expected.rows.map((r, idx) => {
    const item = ITEMS[idx]
    return [idx + 1, item[1], r.code, item[3], '', '', '', '', '', '', '', r.balance, '', r.status]
  })
  const total = expected.rows.reduce((s, r) => s + r.balance, 0)
  const totalRow = ['', '', '', 'الإجمالي', '', '', '', '', '', '', '', total, '', '']
  return XLSX.utils.aoa_to_sheet([
    ['الأرصدة اللحظية (بيانات تجريبية)'],
    [],
    [],
    head,
    ...rows,
    totalRow,
  ])
}

function runningBalances(movements) {
  const totals = new Map()
  return movements.map((m) => {
    const next = (totals.get(m.code) ?? 0) + effect(m.type, m.qty)
    totals.set(m.code, next)
    return next
  })
}

/** Builds the fake workbook. `correctedDates` replaces the 2026-01-08 typo before computing. */
export function buildFixtureBook({ correctedDates = false } = {}) {
  const movements = MOVEMENTS.map(
    ([date, type, code, qty, note, doc, supplier, reference, batch, expiry]) => ({
      date: correctedDates && date === TYPO_DATE ? CORRECTED_DATE : date,
      type,
      code,
      qty,
      note,
      doc,
      supplier,
      reference,
      batch,
      expiry,
    }),
  )
  const expected = expectedBalances(movements)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, itemsSheet(), ITEMS_SHEET)
  XLSX.utils.book_append_sheet(
    wb,
    movementsSheet(movements, runningBalances(movements)),
    MOVEMENTS_SHEET,
  )
  XLSX.utils.book_append_sheet(wb, balancesSheet(expected), BALANCES_SHEET)
  return wb
}

function main() {
  const out = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'tests',
    'fixtures',
    'mini-workbook.xlsx',
  )
  mkdirSync(dirname(out), { recursive: true })
  const raw = expectedBalances(
    MOVEMENTS.map(([date, type, code, qty]) => ({ date, type, code, qty })),
  )
  writeFileSync(out, XLSX.write(buildFixtureBook(), { type: 'buffer', bookType: 'xlsx' }))
  process.stdout.write(
    `[OK] wrote ${out} (${ITEMS.length} items, ${MOVEMENTS.length} movements, months=${raw.months})\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
