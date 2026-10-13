import ExcelJS from 'exceljs'
import type { UnsentLine, UnsentView } from '../data/unsent'
import { fromMinor } from '../domain/money'

const KIND_LABELS: Readonly<Record<UnsentView['kind'], string>> = {
  receipt: 'استلام',
  issue: 'صرف',
  cancel: 'إلغاء',
  adjust: 'مرتجع / تسوية',
  unknown: 'غير معروف',
}

const STATUS_LABELS: Readonly<Record<UnsentView['status'], string>> = {
  failed: 'فشل الإرسال',
  pending: 'مستنية النت',
}

const COLUMNS = [
  { header: 'المستند', key: 'doc', width: 26 },
  { header: 'النوع', key: 'kind', width: 10 },
  { header: 'الحالة', key: 'status', width: 14 },
  { header: 'تاريخ الشغل', key: 'date', width: 14 },
  { header: 'كود الصنف', key: 'code', width: 14 },
  { header: 'الصنف', key: 'name', width: 30 },
  { header: 'نوع الحركة', key: 'type', width: 12 },
  { header: 'الكمية', key: 'qty', width: 10 },
  { header: 'السعر', key: 'price', width: 12 },
  { header: 'التشغيلة', key: 'batch', width: 14 },
  { header: 'الصلاحية', key: 'expiry', width: 12 },
  { header: 'سبب الفشل', key: 'error', width: 40 },
] as const

function rowFor(view: UnsentView, line: UnsentLine | null) {
  return {
    doc: `${view.title} · ${view.subtitle}`,
    kind: KIND_LABELS[view.kind],
    status: STATUS_LABELS[view.status],
    date: view.businessDate,
    code: line?.itemCode ?? '',
    name: line?.name ?? '',
    type: line?.type ?? '',
    qty: line?.qty ?? null,
    price: line ? fromMinor(line.priceMinor) : null,
    batch: line?.batchNo ?? '',
    expiry: line?.expiry ?? '',
    error: view.error ?? '',
  }
}

/** One sheet, one row per movement the unsent documents would have written (right to left). */
export function buildUnsentWorkbook(views: readonly UnsentView[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('مستندات لم تُرسل', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = COLUMNS.map((c) => ({ ...c }))
  sheet.getRow(1).font = { bold: true }
  for (const view of views) {
    // A document with no readable lines still gets one row, so it is never missing from the file.
    const lines: readonly (UnsentLine | null)[] = view.lines.length > 0 ? view.lines : [null]
    for (const line of lines) sheet.addRow(rowFor(view, line))
  }
  sheet.getColumn('price').numFmt = '#,##0.00'
  return workbook
}

/** The `.xlsx` file as bytes. */
export async function unsentWorkbookBytes(views: readonly UnsentView[]): Promise<Uint8Array> {
  const buffer = await buildUnsentWorkbook(views).xlsx.writeBuffer()
  return new Uint8Array(buffer)
}
