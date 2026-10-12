import { z } from 'zod'

/** Movement types, exactly as written in the workbook. */
export const MOVEMENT_TYPES = {
  ADD: 'إضافة',
  ISSUE: 'صرف',
  RETURN: 'مرتجع',
  ADJUST: 'تسوية',
} as const

export const MOVEMENT_TYPE_LIST = ['إضافة', 'صرف', 'مرتجع', 'تسوية'] as const

/** Stock status labels, exactly as shown to the user (em dash in the first one). */
export const STATUS_LABELS = {
  OVERDRAWN: 'تجاوز — رصيد سالب',
  OUT: 'نافد',
  REORDER: 'يحتاج طلب',
  AVAILABLE: 'متاح',
} as const

export const UNSPECIFIED_BATCH_LABEL = 'تشغيلة غير محددة'

export const ITEM_CODE_PATTERN = /^[A-Z]{3}-\d{2,3}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EXPIRY_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/

/** A server timestamp: a Firestore Timestamp, a Date, or the write-time sentinel. Opaque here. */
const timestamp = z.custom<object>((v) => typeof v === 'object' && v !== null)

const minor = z.number().int()
const nullableString = z.string().nullable().default(null)

export const itemSchema = z.object({
  code: z.string().regex(ITEM_CODE_PATTERN),
  page: z.number().int().min(1),
  category: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().default(''),
  material: z.string().default(''),
  size: z.string().default(''),
  unit: z.string().default('قطعة'),
  supplier: z.string().default(''),
  gtins: z.array(z.string().regex(/^(\d{8}|\d{13})$/)).default([]),
  priceMinor: minor.min(0),
  reorderManual: z.number().int().nullable().default(null),
  active: z.boolean().default(true),
  updatedAt: timestamp,
})
export type Item = z.infer<typeof itemSchema>

export const movementSourceSchema = z.object({
  kind: z.enum(['import', 'receipt', 'issue', 'manual']),
  id: z.string().nullable(),
  row: z.number().int().optional(),
})
export type MovementSource = z.infer<typeof movementSourceSchema>

export const movementSchema = z
  .object({
    type: z.enum(MOVEMENT_TYPE_LIST),
    itemCode: z.string().min(1),
    qty: z.number().int(),
    businessDate: z.string().regex(DATE_PATTERN),
    postedAt: timestamp,
    priceMinor: minor.min(0),
    batchNo: nullableString,
    expiry: z.string().regex(EXPIRY_PATTERN).nullable().default(null),
    docNumber: nullableString,
    reference: nullableString,
    note: nullableString,
    supplier: nullableString,
    source: movementSourceSchema,
    substituteFor: z
      .object({ itemCode: z.string().min(1), qty: z.number().int() })
      .nullable()
      .default(null),
    reverses: nullableString,
    reason: nullableString,
    deviceId: z.string().min(1),
    createdBy: z.string().min(1),
  })
  .refine((m) => m.qty !== 0 && (m.type === MOVEMENT_TYPES.ADJUST || m.qty > 0), {
    message: 'qty must be > 0 (signed non-zero for تسوية)',
    path: ['qty'],
  })
export type Movement = z.infer<typeof movementSchema>

/** A movement before the server stamps `postedAt`. */
export type NewMovement = Omit<Movement, 'postedAt'>

const docStatus = z.enum(['draft', 'posted', 'cancelled'])

export const receiptLineSchema = z.object({
  n: z.number().int().min(1),
  itemCode: z.string().nullable(),
  scannedGtin: z.string().nullable(),
  batchNo: z.string().nullable(),
  expiry: z.string().nullable(),
  invoicedQty: z.number().int().min(0),
  countedQty: z.number().int().min(0),
  priceMinor: minor.min(0),
  prevPriceMinor: minor.min(0),
  diffReason: z.string().nullable(),
})
export type ReceiptLine = z.infer<typeof receiptLineSchema>

export const receiptSchema = z.object({
  status: docStatus,
  supplier: z.string(),
  deliveryNo: z.string(),
  invoiceNo: z.string(),
  businessDate: z.string().regex(DATE_PATTERN),
  lines: z.array(receiptLineSchema),
  postedAt: timestamp.nullable().default(null),
  cancelledAt: timestamp.nullable().default(null),
  cancelReason: z.string().nullable().default(null),
  priceUpdates: z
    .array(z.object({ itemCode: z.string(), fromMinor: minor, toMinor: minor }))
    .default([]),
})
export type Receipt = z.infer<typeof receiptSchema>

export const issuedLineSchema = z.object({
  n: z.number().int().min(1),
  itemCode: z.string().min(1),
  qty: z.number().int().min(1),
  batchNo: z.string().nullable(),
  expiry: z.string().nullable(),
  forItemCode: z.string().nullable(),
  negativeReason: z.string().nullable(),
})
export type IssuedLine = z.infer<typeof issuedLineSchema>

export const issueBatchSchema = z.object({
  number: z.number().int().min(1),
  status: docStatus,
  rep: z.string(),
  businessDate: z.string().regex(DATE_PATTERN),
  permits: z.array(z.string()),
  requested: z.array(
    z.object({
      itemCode: z.string().min(1),
      qty: z.number().int().min(1),
      priceMinor: minor.min(0),
    }),
  ),
  requestedValueMinor: minor.default(0),
  issuedValueMinor: minor.default(0),
  issued: z.array(issuedLineSchema),
  postedAt: timestamp.nullable().default(null),
  cancelledAt: timestamp.nullable().default(null),
  cancelReason: z.string().nullable().default(null),
})
export type IssueBatch = z.infer<typeof issueBatchSchema>

export const settingsSchema = z.object({
  coverageMonths: z.number().positive().default(1.5),
  defaultReorder: z.number().int().min(0).default(5),
  lastBackupAt: timestamp.nullable().default(null),
  lastLedgerExportAt: timestamp.nullable().default(null),
  lastLedgerExportedIds: z.array(z.string()).default([]),
  workbookImport: z
    .object({
      importedAt: timestamp,
      movementCount: z.number().int().min(0),
      fileName: z.string(),
    })
    .nullable()
    .default(null),
})
export type Settings = z.infer<typeof settingsSchema>
