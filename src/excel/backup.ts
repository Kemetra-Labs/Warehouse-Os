import ExcelJS from 'exceljs'
import { toMillis } from '../data/convert'
import type { MovementDoc } from '../data/deriveLedger'
import type { IssueBatch, Item, Receipt } from '../domain/types'
import { workbookBytes, type XlsxFile } from './bytes'
import { PAGE_SETUP, withArial } from './sheetSetup'

export type BackupCell = string | number | boolean | null
type Column<T> = {
  /** The schema field this column keeps (a column may flatten a nested field). */
  readonly field: string
  readonly header: string
  readonly width: number
  readonly value: (row: T) => BackupCell
}

export const ITEMS_SHEET = 'الأصناف'
export const MOVEMENTS_SHEET = 'الحركات'
export const DOCUMENTS_SHEET = 'المستندات'

/** A server timestamp as ISO text (UTC), or empty. */
function iso(ts: unknown): string {
  const ms = toMillis(ts)
  return ms > 0 ? new Date(ms).toISOString() : ''
}

const col = <T>(
  field: string,
  header: string,
  width: number,
  value: (row: T) => BackupCell,
): Column<T> => ({ field, header, width, value })

/** Every item field. Money is kept in piastres (exact) and again in pounds (readable). */
export const ITEM_COLUMNS: readonly Column<Item>[] = [
  col('code', 'الكود', 12, (i) => i.code),
  col('page', 'الصفحة', 8, (i) => i.page),
  col('category', 'الفئة', 16, (i) => i.category),
  col('nameAr', 'الصنف', 30, (i) => i.nameAr),
  col('nameEn', 'الاسم الإنجليزي', 26, (i) => i.nameEn),
  col('material', 'الخامة', 14, (i) => i.material),
  col('size', 'المقاس', 12, (i) => i.size),
  col('unit', 'الوحدة', 10, (i) => i.unit),
  col('supplier', 'الشركة الموردة', 20, (i) => i.supplier),
  col('gtins', 'الباركود (GTIN)', 24, (i) => i.gtins.join(', ')),
  col('authorityCode', 'كود الهيئة', 14, (i) => i.authorityCode),
  col('priceMinor', 'السعر بالقرش', 12, (i) => i.priceMinor),
  col('priceMinor', 'السعر (ج)', 12, (i) => i.priceMinor / 100),
  col('reorderManual', 'حد الطلب اليدوي', 12, (i) => i.reorderManual),
  col('active', 'نشط', 8, (i) => i.active),
  col('updatedAt', 'آخر تعديل', 24, (i) => iso(i.updatedAt)),
]

/** Every movement field, with its id, source and reversal link. */
export const MOVEMENT_COLUMNS: readonly Column<MovementDoc>[] = [
  col('id', 'المعرّف', 28, (m) => m.id),
  col('type', 'نوع الحركة', 10, (m) => m.type),
  col('itemCode', 'الكود', 12, (m) => m.itemCode),
  col('qty', 'الكمية', 8, (m) => m.qty),
  col('businessDate', 'التاريخ', 12, (m) => m.businessDate),
  col('postedAt', 'وقت الاعتماد', 24, (m) => iso(m.postedAt)),
  col('priceMinor', 'السعر بالقرش', 12, (m) => m.priceMinor),
  col('batchNo', 'التشغيلة', 14, (m) => m.batchNo),
  col('expiry', 'الصلاحية', 12, (m) => m.expiry),
  col('docNumber', 'رقم الإذن', 16, (m) => m.docNumber),
  col('reference', 'المرجع', 14, (m) => m.reference),
  col('note', 'ملاحظات', 24, (m) => m.note),
  col('supplier', 'الشركة', 18, (m) => m.supplier),
  col('source', 'مصدر الحركة', 10, (m) => m.source.kind),
  col('source', 'مستند المصدر', 28, (m) => m.source.id),
  col('source', 'صف الاستيراد', 10, (m) => m.source.row ?? null),
  col('substituteFor', 'بدل عن (كود)', 12, (m) => m.substituteFor?.itemCode ?? null),
  col('substituteFor', 'بدل عن (كمية)', 10, (m) => m.substituteFor?.qty ?? null),
  col('reverses', 'بتعكس الحركة', 28, (m) => m.reverses),
  col('reason', 'السبب', 24, (m) => m.reason),
  col('deviceId', 'الجهاز', 24, (m) => m.deviceId),
  col('createdBy', 'اتسجّلت بواسطة', 28, (m) => m.createdBy),
]

export type BackupReceipt = Receipt & { readonly id: string }
export type BackupBatch = IssueBatch & { readonly id: string }

/** One flattened row of "المستندات": a document with one of its lines. */
interface DocRow {
  readonly kind: 'استلام' | 'صرف'
  readonly id: string
  readonly status: string
  readonly number: string
  readonly date: string
  readonly postedAt: string
  readonly cancelledAt: string
  readonly cancelReason: string | null
  readonly party: string
  readonly invoiceNo: string | null
  readonly invoiceDate: string | null
  readonly supplyRequestNo: string | null
  readonly supplyOrderNo: string | null
  readonly permits: string
  readonly priceUpdates: string
  readonly requestedValueMinor: number | null
  readonly issuedValueMinor: number | null
  readonly lineKind: 'سطر استلام' | 'مطلوب' | 'مصروف' | ''
  readonly n: number | null
  readonly itemCode: string | null
  readonly scannedGtin: string | null
  readonly authorityCode: string | null
  readonly batchNo: string | null
  readonly mfgDate: string | null
  readonly expiry: string | null
  readonly qtyA: number | null
  readonly qtyB: number | null
  readonly priceMinor: number | null
  readonly prevPriceMinor: number | null
  readonly diffReason: string | null
  readonly expiredReason: string | null
  readonly forItemCode: string | null
  readonly negativeReason: string | null
}

const STATUS: Readonly<Record<string, string>> = {
  draft: 'مسودة',
  posted: 'معتمد',
  cancelled: 'ملغي',
}

const BLANK_LINE = {
  lineKind: '',
  n: null,
  itemCode: null,
  scannedGtin: null,
  authorityCode: null,
  batchNo: null,
  mfgDate: null,
  expiry: null,
  qtyA: null,
  qtyB: null,
  priceMinor: null,
  prevPriceMinor: null,
  diffReason: null,
  expiredReason: null,
  forItemCode: null,
  negativeReason: null,
} as const satisfies Partial<DocRow>

function receiptHead(r: BackupReceipt) {
  return {
    kind: 'استلام' as const,
    id: r.id,
    status: STATUS[r.status] ?? r.status,
    number: r.deliveryNo,
    date: r.businessDate,
    postedAt: iso(r.postedAt),
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    party: r.supplier,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    supplyRequestNo: r.supplyRequestNo,
    supplyOrderNo: r.supplyOrderNo,
    permits: '',
    priceUpdates: JSON.stringify(r.priceUpdates),
    requestedValueMinor: null,
    issuedValueMinor: null,
  }
}

function batchHead(b: BackupBatch) {
  return {
    kind: 'صرف' as const,
    id: b.id,
    status: STATUS[b.status] ?? b.status,
    number: String(b.number),
    date: b.businessDate,
    postedAt: iso(b.postedAt),
    cancelledAt: iso(b.cancelledAt),
    cancelReason: b.cancelReason,
    party: b.rep,
    invoiceNo: null,
    invoiceDate: null,
    supplyRequestNo: null,
    supplyOrderNo: null,
    permits: b.permits.join(', '),
    priceUpdates: '',
    requestedValueMinor: b.requestedValueMinor,
    issuedValueMinor: b.issuedValueMinor,
  }
}

function receiptRows(r: BackupReceipt): DocRow[] {
  const head = receiptHead(r)
  if (r.lines.length === 0) return [{ ...head, ...BLANK_LINE }]
  return r.lines.map((l) => ({
    ...head,
    ...BLANK_LINE,
    lineKind: 'سطر استلام',
    n: l.n,
    itemCode: l.itemCode,
    scannedGtin: l.scannedGtin,
    authorityCode: l.authorityCode,
    batchNo: l.batchNo,
    mfgDate: l.mfgDate,
    expiry: l.expiry,
    qtyA: l.invoicedQty,
    qtyB: l.countedQty,
    priceMinor: l.priceMinor,
    prevPriceMinor: l.prevPriceMinor,
    diffReason: l.diffReason,
    expiredReason: l.expiredReason,
  }))
}

function batchRows(b: BackupBatch): DocRow[] {
  const head = batchHead(b)
  const requested: DocRow[] = b.requested.map((r) => ({
    ...head,
    ...BLANK_LINE,
    lineKind: 'مطلوب',
    itemCode: r.itemCode,
    qtyA: r.qty,
    priceMinor: r.priceMinor,
  }))
  const issued: DocRow[] = b.issued.map((l) => ({
    ...head,
    ...BLANK_LINE,
    lineKind: 'مصروف',
    n: l.n,
    itemCode: l.itemCode,
    batchNo: l.batchNo,
    expiry: l.expiry,
    qtyB: l.qty,
    forItemCode: l.forItemCode,
    negativeReason: l.negativeReason,
  }))
  const rows = [...requested, ...issued]
  return rows.length === 0 ? [{ ...head, ...BLANK_LINE }] : rows
}

const dcol = (header: string, width: number, value: (r: DocRow) => BackupCell) =>
  col<DocRow>(header, header, width, value)

/** Receipts and issue batches with their lines, flattened to one row per line. */
export const DOCUMENT_COLUMNS: readonly Column<DocRow>[] = [
  dcol('نوع المستند', 12, (r) => r.kind),
  dcol('معرّف المستند', 28, (r) => r.id),
  dcol('الحالة', 10, (r) => r.status),
  dcol('رقم الإذن / الدفعة', 16, (r) => r.number),
  dcol('التاريخ', 12, (r) => r.date),
  dcol('وقت الاعتماد', 24, (r) => r.postedAt),
  dcol('وقت الإلغاء', 24, (r) => r.cancelledAt),
  dcol('سبب الإلغاء', 24, (r) => r.cancelReason),
  dcol('الشركة / المندوب', 20, (r) => r.party),
  dcol('رقم الفاتورة', 14, (r) => r.invoiceNo),
  dcol('تاريخ الفاتورة', 12, (r) => r.invoiceDate),
  dcol('رقم طلب التوريد', 14, (r) => r.supplyRequestNo),
  dcol('رقم أمر التوريد', 14, (r) => r.supplyOrderNo),
  dcol('أرقام الأذون', 20, (r) => r.permits),
  dcol('تحديثات الأسعار', 24, (r) => r.priceUpdates),
  dcol('قيمة المطلوب بالقرش', 14, (r) => r.requestedValueMinor),
  dcol('قيمة المصروف بالقرش', 14, (r) => r.issuedValueMinor),
  dcol('نوع السطر', 12, (r) => r.lineKind),
  dcol('رقم السطر', 8, (r) => r.n),
  dcol('كود الصنف', 12, (r) => r.itemCode),
  dcol('الباركود المتمسح', 16, (r) => r.scannedGtin),
  dcol('كود الهيئة', 12, (r) => r.authorityCode),
  dcol('التشغيلة', 14, (r) => r.batchNo),
  dcol('تاريخ الإنتاج', 12, (r) => r.mfgDate),
  dcol('الصلاحية', 12, (r) => r.expiry),
  dcol('الكمية بالفاتورة / المطلوبة', 14, (r) => r.qtyA),
  dcol('الكمية المعدودة / المصروفة', 14, (r) => r.qtyB),
  dcol('السعر بالقرش', 12, (r) => r.priceMinor),
  dcol('السعر السابق بالقرش', 14, (r) => r.prevPriceMinor),
  dcol('سبب الفرق', 20, (r) => r.diffReason),
  dcol('سبب الصلاحية المنتهية', 20, (r) => r.expiredReason),
  dcol('بدل عن', 12, (r) => r.forItemCode),
  dcol('سبب الصرف بالسالب', 20, (r) => r.negativeReason),
]

export interface BackupData {
  readonly items: readonly Item[]
  readonly movements: readonly MovementDoc[]
  readonly receipts: readonly BackupReceipt[]
  readonly issueBatches: readonly BackupBatch[]
}

function addSheet<T>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly Column<T>[],
  rows: readonly T[],
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    pageSetup: PAGE_SETUP,
  })
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width }))
  for (const row of rows) sheet.addRow(columns.map((c) => c.value(row)))
  sheet.eachRow((row) => row.eachCell(withArial))
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { ...cell.font, bold: true }
  })
}

/** FR-062: three sheets, every field, plain values (no formulas). */
export function buildBackupWorkbook(data: BackupData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const documents = [...data.receipts.flatMap(receiptRows), ...data.issueBatches.flatMap(batchRows)]
  addSheet(workbook, ITEMS_SHEET, ITEM_COLUMNS, data.items)
  addSheet(workbook, MOVEMENTS_SHEET, MOVEMENT_COLUMNS, data.movements)
  addSheet(workbook, DOCUMENTS_SHEET, DOCUMENT_COLUMNS, documents)
  return workbook
}

/** `نسخة-احتياطية-2026-10-12.xlsx` */
export function backupFileName(day: string): string {
  return `نسخة-احتياطية-${day}.xlsx`
}

export async function backupFile(data: BackupData, day: string): Promise<XlsxFile> {
  return { fileName: backupFileName(day), bytes: await workbookBytes(buildBackupWorkbook(data)) }
}
