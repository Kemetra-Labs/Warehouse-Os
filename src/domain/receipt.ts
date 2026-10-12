import { cairoToday, expiryEndDay } from './dates'
import { lineTotalMinor } from './money'
import {
  MOVEMENT_TYPES,
  type Item,
  type NewMovement,
  type Receipt,
  type ReceiptLine,
} from './types'

/** The editable part of a receipt: header and lines. Status and timestamps live on the document. */
export interface ReceiptDraft {
  readonly supplier: string
  readonly deliveryNo: string
  readonly invoiceNo: string
  readonly invoiceDate: string | null
  readonly supplyRequestNo: string | null
  readonly supplyOrderNo: string | null
  readonly businessDate: string
  readonly lines: readonly ReceiptLine[]
}

export type IssueCode =
  | 'no-lines'
  | 'unresolved'
  | 'invoiced-qty'
  | 'counted-qty'
  | 'diff-reason'
  | 'bad-expiry'
  | 'expired-reason'
  | 'bad-date'
  | 'future-date'
  | 'duplicate-delivery'

export interface ReceiptIssue {
  readonly code: IssueCode
  /** Arabic text for the user. */
  readonly message: string
  /** 1-based line number (`ReceiptLine.n`) for line issues. */
  readonly line?: number
  /** For `duplicate-delivery`: the receipt that already holds this delivery number (FR-030b). */
  readonly existingId?: string
}

export interface ExistingReceipt {
  readonly id: string
  readonly deliveryNo: string
  readonly status: Receipt['status']
}

export interface ValidationContext {
  /** Today in Cairo, `YYYY-MM-DD` (see `cairoToday`). */
  readonly today: string
  /** Every receipt the app knows, for the duplicate delivery-note check. */
  readonly existing: readonly ExistingReceipt[]
  /** The id of the receipt being posted, so it never counts as its own duplicate. */
  readonly selfId: string
}

/** The item facts a post needs. `Item` satisfies it. */
export type PostItem = Pick<Item, 'code' | 'priceMinor'> & { readonly gtins: readonly string[] }

export interface PostContext {
  readonly id: string
  readonly items: readonly PostItem[]
  readonly uid: string
  readonly deviceId: string
}

export interface PlannedMovement {
  readonly id: string
  /** `postedAt` is stamped by the server in the adapter. */
  readonly data: NewMovement
}

export interface ItemUpdate {
  readonly code: string
  /** The new price, or null when the price is unchanged (the patch then leaves it alone). */
  readonly priceMinor: number | null
  /** GTINs to append with `arrayUnion`. */
  readonly addGtins: readonly string[]
}

export interface PriceUpdate {
  readonly itemCode: string
  readonly fromMinor: number
  readonly toMinor: number
}

export type PostWarning =
  | {
      readonly kind: 'gtin-held'
      readonly line: number
      readonly gtin: string
      readonly heldBy: readonly string[]
      readonly message: string
    }
  | {
      readonly kind: 'gtin-unsupported'
      readonly line: number
      readonly gtin: string
      readonly message: string
    }

export interface PostBatch {
  readonly movements: readonly PlannedMovement[]
  readonly itemUpdates: readonly ItemUpdate[]
  readonly priceUpdates: readonly PriceUpdate[]
  readonly warnings: readonly PostWarning[]
  /** Fields written on the receipt document; the adapter adds `postedAt: serverTimestamp()`. */
  readonly receiptPatch: {
    readonly status: 'posted'
    readonly priceUpdates: readonly PriceUpdate[]
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const STORED_GTIN = /^(\d{8}|\d{13})$/

export function newLine(n: number): ReceiptLine {
  return {
    n,
    itemCode: null,
    scannedGtin: null,
    authorityCode: null,
    batchNo: null,
    mfgDate: null,
    expiry: null,
    invoicedQty: 0,
    countedQty: 0,
    priceMinor: 0,
    prevPriceMinor: 0,
    diffReason: null,
    expiredReason: null,
  }
}

export function newDraft(businessDate: string = cairoToday()): ReceiptDraft {
  return {
    supplier: '',
    deliveryNo: '',
    invoiceNo: '',
    invoiceDate: null,
    supplyRequestNo: null,
    supplyOrderNo: null,
    businessDate,
    lines: [],
  }
}

/** The document written while the receipt is a draft (rules: create only as a draft). */
export function toDraftDoc(draft: ReceiptDraft): Omit<Receipt, 'postedAt' | 'cancelledAt'> & {
  readonly postedAt: null
  readonly cancelledAt: null
} {
  return {
    status: 'draft',
    supplier: draft.supplier,
    deliveryNo: draft.deliveryNo,
    invoiceNo: draft.invoiceNo,
    invoiceDate: draft.invoiceDate,
    supplyRequestNo: draft.supplyRequestNo,
    supplyOrderNo: draft.supplyOrderNo,
    businessDate: draft.businessDate,
    lines: draft.lines.map((l) => ({ ...l })),
    postedAt: null,
    cancelledAt: null,
    cancelReason: null,
    priceUpdates: [],
  }
}

/** FR-031: the price differs from the item's previous one, so the line is flagged. */
export function priceChanged(line: ReceiptLine): boolean {
  return line.itemCode !== null && line.priceMinor !== line.prevPriceMinor
}

/** A line's value: counted quantity (default) or invoiced quantity, times the unit price. */
export function lineValueMinor(
  line: ReceiptLine,
  basis: 'counted' | 'invoiced' = 'counted',
): number {
  return lineTotalMinor(basis === 'counted' ? line.countedQty : line.invoicedQty, line.priceMinor)
}

export function receiptTotalMinor(
  lines: readonly ReceiptLine[],
  basis: 'counted' | 'invoiced' = 'counted',
): number {
  return lines.reduce((sum, l) => sum + lineValueMinor(l, basis), 0)
}

function normalizeNo(value: string): string {
  return value.trim().toLowerCase()
}

/** FR-030b: the receipt that already holds this delivery number, whatever its status. */
export function findDuplicateDelivery(
  existing: readonly ExistingReceipt[],
  deliveryNo: string,
  excludeId?: string,
): ExistingReceipt | null {
  const key = normalizeNo(deliveryNo)
  if (key === '') return null
  // A cancelled receipt does not block re-entering the same delivery note (e.g. after a mistake).
  return (
    existing.find(
      (r) => r.id !== excludeId && r.status !== 'cancelled' && normalizeNo(r.deliveryNo) === key,
    ) ?? null
  )
}

function validDay(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== ''
}

function lineIssues(line: ReceiptLine, businessDate: string): ReceiptIssue[] {
  const out: ReceiptIssue[] = []
  const add = (code: IssueCode, message: string): void => {
    out.push({ code, message, line: line.n })
  }
  const at = `السطر ${line.n}`
  if (line.itemCode === null) add('unresolved', `${at}: اختار الصنف الأول`)
  if (line.invoicedQty <= 0) add('invoiced-qty', `${at}: الكمية في الفاتورة لازم تكون أكبر من صفر`)
  if (line.countedQty < 0) add('counted-qty', `${at}: الكمية المعدودة مينفعش تكون بالسالب`)
  if (line.countedQty >= 0 && line.invoicedQty > 0 && line.countedQty !== line.invoicedQty) {
    if (!hasText(line.diffReason)) add('diff-reason', `${at}: اكتب سبب الفرق بين الفاتورة والعدّ`)
  }
  if (line.expiry !== null && line.expiry !== '') {
    const end = expiryEndDay(line.expiry)
    if (end === null) add('bad-expiry', `${at}: تاريخ الصلاحية مش مفهوم`)
    else if (end < businessDate && line.countedQty > 0 && !hasText(line.expiredReason)) {
      add('expired-reason', `${at}: الصلاحية منتهية. اكتب السبب`)
    }
  }
  return out
}

function headerIssues(draft: ReceiptDraft, ctx: ValidationContext): ReceiptIssue[] {
  const out: ReceiptIssue[] = []
  if (!validDay(draft.businessDate)) {
    out.push({ code: 'bad-date', message: 'تاريخ الاستلام مش صحيح' })
  } else if (draft.businessDate > ctx.today) {
    out.push({ code: 'future-date', message: 'تاريخ الاستلام مينفعش يكون في المستقبل' })
  }
  const dup = findDuplicateDelivery(ctx.existing, draft.deliveryNo, ctx.selfId)
  if (dup) {
    out.push({
      code: 'duplicate-delivery',
      message: `رقم الإذن ${draft.deliveryNo.trim()} متسجّل قبل كده`,
      existingId: dup.id,
    })
  }
  return out
}

/** Everything that blocks posting, in Arabic. An empty list means the receipt can be posted. */
export function validateForPost(draft: ReceiptDraft, ctx: ValidationContext): ReceiptIssue[] {
  if (draft.lines.length === 0) {
    return [{ code: 'no-lines', message: 'الاستلام فاضي. ضيف سطر واحد على الأقل' }]
  }
  return [
    ...headerIssues(draft, ctx),
    ...draft.lines.flatMap((l) => lineIssues(l, draft.businessDate)),
  ]
}

function noteOf(line: ReceiptLine): string | null {
  const parts = [line.diffReason, line.expiredReason].filter(hasText).map((p) => (p ?? '').trim())
  return parts.length > 0 ? parts.join(' - ') : null
}

function movementFor(
  draft: ReceiptDraft,
  line: ReceiptLine,
  itemCode: string,
  ctx: PostContext,
): PlannedMovement {
  return {
    id: `${ctx.id}-L${line.n}`,
    data: {
      type: MOVEMENT_TYPES.ADD,
      itemCode,
      qty: line.countedQty,
      businessDate: draft.businessDate,
      priceMinor: line.priceMinor,
      batchNo: line.batchNo,
      expiry: line.expiry === '' ? null : line.expiry,
      docNumber: draft.deliveryNo.trim() === '' ? null : draft.deliveryNo.trim(),
      reference: draft.invoiceNo.trim() === '' ? null : draft.invoiceNo.trim(),
      note: noteOf(line),
      supplier: draft.supplier.trim() === '' ? null : draft.supplier.trim(),
      source: { kind: 'receipt', id: ctx.id },
      substituteFor: null,
      reverses: null,
      reason: null,
      deviceId: ctx.deviceId,
      createdBy: ctx.uid,
    },
  }
}

interface ResolvedLine {
  readonly line: ReceiptLine
  readonly item: PostItem
}

function resolveLines(draft: ReceiptDraft, ctx: PostContext): ResolvedLine[] {
  const byCode = new Map(ctx.items.map((i) => [i.code, i]))
  return draft.lines.map((line) => {
    const item = line.itemCode === null ? undefined : byCode.get(line.itemCode)
    if (!item)
      throw new Error(`Receipt line ${line.n} has no known item (${line.itemCode ?? 'null'})`)
    return { line, item }
  })
}

function planPrices(received: readonly ResolvedLine[]): PriceUpdate[] {
  const finalPrice = new Map<string, number>()
  const original = new Map<string, number>()
  for (const { line, item } of received) {
    original.set(item.code, item.priceMinor)
    finalPrice.set(item.code, line.priceMinor)
  }
  return [...finalPrice.entries()]
    .filter(([code, to]) => to !== original.get(code))
    .map(([itemCode, toMinor]) => ({ itemCode, fromMinor: original.get(itemCode) ?? 0, toMinor }))
}

function planGtins(
  resolved: readonly ResolvedLine[],
  items: readonly PostItem[],
): { links: Map<string, string[]>; warnings: PostWarning[] } {
  const links = new Map<string, string[]>()
  const warnings: PostWarning[] = []
  for (const { line, item } of resolved) {
    const gtin = line.scannedGtin
    if (gtin === null || gtin === '' || item.gtins.includes(gtin)) continue
    if (!STORED_GTIN.test(gtin)) {
      warnings.push({
        kind: 'gtin-unsupported',
        line: line.n,
        gtin,
        message: `السطر ${line.n}: الباركود ${gtin} مش هيتربط بالصنف (الطول مش مدعوم)`,
      })
      continue
    }
    const heldBy = items.filter((i) => i.code !== item.code && i.gtins.includes(gtin))
    if (heldBy.length > 0) {
      const codes = heldBy.map((i) => i.code)
      warnings.push({
        kind: 'gtin-held',
        line: line.n,
        gtin,
        heldBy: codes,
        message: `السطر ${line.n}: الباركود ${gtin} مربوط بصنف تاني (${codes.join('، ')})`,
      })
    }
    const mine = links.get(item.code) ?? []
    if (!mine.includes(gtin)) links.set(item.code, [...mine, gtin])
  }
  return { links, warnings }
}

function planItemUpdates(
  prices: readonly PriceUpdate[],
  links: ReadonlyMap<string, readonly string[]>,
): ItemUpdate[] {
  const priceBy = new Map(prices.map((p) => [p.itemCode, p.toMinor]))
  const codes = [...new Set([...priceBy.keys(), ...links.keys()])]
  return codes.map((code) => ({
    code,
    priceMinor: priceBy.get(code) ?? null,
    addGtins: links.get(code) ?? [],
  }))
}

/**
 * Pure plan of one atomic post (data-model "Post rule"). Throws when a line has no known item:
 * `validateForPost` must pass first. Lines with counted 0 write no movement and change no price.
 */
export function toPostBatch(draft: ReceiptDraft, ctx: PostContext): PostBatch {
  const resolved = resolveLines(draft, ctx)
  const received = resolved.filter((r) => r.line.countedQty > 0)
  const priceUpdates = planPrices(received)
  const { links, warnings } = planGtins(resolved, ctx.items)
  return {
    movements: received.map((r) => movementFor(draft, r.line, r.item.code, ctx)),
    itemUpdates: planItemUpdates(priceUpdates, links),
    priceUpdates,
    warnings,
    receiptPatch: { status: 'posted', priceUpdates },
  }
}

export interface PostPreview {
  readonly issues: readonly ReceiptIssue[]
  readonly warnings: readonly PostWarning[]
}

/**
 * What the confirm step shows before anything is queued (FR-033: warn first): the blocking
 * issues plus the GTIN warnings, for the lines that already resolve to an item.
 */
export function previewPost(
  draft: ReceiptDraft,
  ctx: ValidationContext & { readonly items: readonly PostItem[] },
): PostPreview {
  const byCode = new Map(ctx.items.map((i) => [i.code, i]))
  const resolved = draft.lines.flatMap((line): ResolvedLine[] => {
    const item = line.itemCode === null ? undefined : byCode.get(line.itemCode)
    return item ? [{ line, item }] : []
  })
  return { issues: validateForPost(draft, ctx), warnings: planGtins(resolved, ctx.items).warnings }
}
