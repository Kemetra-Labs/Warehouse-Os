import { cairoToday } from './dates'
import { linesNeedingReason, type StockView } from './issueStock'
import { lineTotalMinor } from './money'
import type { PlannedMovement } from './receipt'
import { MOVEMENT_TYPES, type IssueBatch, type IssuedLine, type Item } from './types'

export type RequestedLine = IssueBatch['requested'][number]

/** The editable part of an issue batch. Status and timestamps live on the document. */
export interface IssueDraft {
  readonly number: number
  readonly rep: string
  /** Patient permit numbers, digits only (FR-040). */
  readonly permits: readonly string[]
  readonly businessDate: string
  readonly requested: readonly RequestedLine[]
  readonly issued: readonly IssuedLine[]
}

export type BatchProblemCode =
  | 'no-lines'
  | 'no-rep'
  | 'bad-permit'
  | 'bad-line'
  | 'uncovered'
  | 'over-issued'
  | 'negative-reason'
  | 'bad-date'
  | 'future-date'

export interface BatchProblem {
  readonly code: BatchProblemCode
  /** Arabic text for the user. */
  readonly message: string
  readonly itemCode?: string
}

export interface ValidationContext {
  /** Today in Cairo, `YYYY-MM-DD` (see `cairoToday`). */
  readonly today: string
  readonly stock: StockView
}

/** The item facts a post needs. `Item` satisfies it. */
export type PostItem = Pick<Item, 'code' | 'priceMinor'>

export interface PostContext {
  readonly id: string
  readonly items: readonly PostItem[]
  readonly uid: string
  readonly deviceId: string
}

export interface IssuePostBatch {
  readonly movements: readonly PlannedMovement[]
  /** Fields written on the batch document; the adapter adds `postedAt: serverTimestamp()`. */
  readonly patch: {
    readonly status: 'posted'
    readonly requested: readonly RequestedLine[]
    readonly requestedValueMinor: number
    readonly issuedValueMinor: number
  }
}

export interface BatchTotals {
  readonly requestedMinor: number
  readonly issuedMinor: number
  readonly differenceMinor: number
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DIGITS = /^\d+$/

export function newIssueDraft(number: number, businessDate: string = cairoToday()): IssueDraft {
  return { number, rep: '', permits: [], businessDate, requested: [], issued: [] }
}

/** The document written while the batch is a draft (rules: create only as a draft). */
export function toDraftDoc(draft: IssueDraft): Omit<IssueBatch, 'postedAt' | 'cancelledAt'> & {
  readonly postedAt: null
  readonly cancelledAt: null
} {
  return {
    number: draft.number,
    status: 'draft',
    rep: draft.rep,
    businessDate: draft.businessDate,
    permits: [...draft.permits],
    requested: draft.requested.map((r) => ({ ...r })),
    requestedValueMinor: 0,
    issuedValueMinor: 0,
    issued: draft.issued.map((l) => ({ ...l })),
    postedAt: null,
    cancelledAt: null,
    cancelReason: null,
  }
}

/**
 * R10: the next local number is the highest one seen plus one. Cancelled batches count as well:
 * their number may already be printed, so it is never handed out again.
 */
export function nextBatchNumber(batches: readonly { readonly number: number }[]): number {
  return batches.reduce((max, b) => Math.max(max, b.number), 0) + 1
}

export interface CoverageRow {
  readonly itemCode: string
  readonly requestedQty: number
  /** Issued from the requested item itself. */
  readonly directQty: number
  /** Issued from substitutes (`forItemCode` = this item). */
  readonly substituteQty: number
  /** What is still missing; 0 when covered. */
  readonly shortQty: number
}

/** Per requested item: how much is covered by itself and by substitutes, and what is missing. */
export function coverage(draft: IssueDraft): CoverageRow[] {
  return draft.requested.map((r) => {
    const sum = (pick: (l: IssuedLine) => boolean): number =>
      draft.issued.filter(pick).reduce((total, l) => total + l.qty, 0)
    const directQty = sum((l) => l.itemCode === r.itemCode && l.forItemCode === null)
    const substituteQty = sum((l) => l.forItemCode === r.itemCode)
    return {
      itemCode: r.itemCode,
      requestedQty: r.qty,
      directQty,
      substituteQty,
      shortQty: Math.max(0, r.qty - directQty - substituteQty),
    }
  })
}

function validDay(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const hasText = (value: string | null): boolean => value !== null && value.trim() !== ''

function headerProblems(draft: IssueDraft, today: string): BatchProblem[] {
  const out: BatchProblem[] = []
  if (!hasText(draft.rep)) out.push({ code: 'no-rep', message: 'اكتب اسم المندوب' })
  if (draft.permits.some((p) => !DIGITS.test(p))) {
    out.push({ code: 'bad-permit', message: 'أرقام الأذون لازم تكون أرقام بس' })
  }
  if (!validDay(draft.businessDate)) {
    out.push({ code: 'bad-date', message: 'تاريخ الصرف مش صحيح' })
  } else if (draft.businessDate > today) {
    out.push({ code: 'future-date', message: 'تاريخ الصرف مينفعش يكون في المستقبل' })
  }
  return out
}

function coverageProblems(draft: IssueDraft): BatchProblem[] {
  const requested = new Set(draft.requested.map((r) => r.itemCode))
  const stray = draft.issued.filter((l) => l.qty < 1 || !requested.has(l.forItemCode ?? l.itemCode))
  const out: BatchProblem[] = stray.map((l) => ({
    code: 'bad-line',
    message: `السطر ${l.n}: مش تابع لصنف مطلوب`,
    itemCode: l.itemCode,
  }))
  for (const row of coverage(draft)) {
    const issued = row.directQty + row.substituteQty
    if (row.shortQty > 0) {
      out.push({
        code: 'uncovered',
        message: `الصنف ${row.itemCode}: ناقص ${row.shortQty}. اختار بديل أو اصرف بالسالب أو قلّل الكمية`,
        itemCode: row.itemCode,
      })
    } else if (issued > row.requestedQty) {
      out.push({
        code: 'over-issued',
        message: `الصنف ${row.itemCode}: اتصرف أكتر من المطلوب`,
        itemCode: row.itemCode,
      })
    }
  }
  return out
}

function reasonProblems(draft: IssueDraft, stock: StockView): BatchProblem[] {
  const needing = linesNeedingReason(draft.issued, stock)
  const missing = draft.issued.filter((l) => needing.has(l.n) && !hasText(l.negativeReason))
  return [...new Set(missing.map((l) => l.itemCode))].map((itemCode) => ({
    code: 'negative-reason',
    message: `الصنف ${itemCode}: الصرف أكتر من الرصيد. اكتب السبب`,
    itemCode,
  }))
}

/** Everything that blocks posting, in Arabic. An empty list means the batch can be posted. */
export function validateForPost(draft: IssueDraft, ctx: ValidationContext): BatchProblem[] {
  if (draft.requested.length === 0) {
    return [{ code: 'no-lines', message: 'الدفعة فاضية. ضيف صنف واحد على الأقل' }]
  }
  return [
    ...headerProblems(draft, ctx.today),
    ...coverageProblems(draft),
    ...reasonProblems(draft, ctx.stock),
  ]
}

type PriceOf = (itemCode: string) => number

/** The summary of a draft: requested and issued value at the prices `priceOf` gives. */
export function draftTotals(draft: IssueDraft, priceOf: PriceOf): BatchTotals {
  const value = (lines: readonly { itemCode: string; qty: number }[]): number =>
    lines.reduce((sum, l) => sum + lineTotalMinor(l.qty, priceOf(l.itemCode)), 0)
  const requestedMinor = value(draft.requested)
  const issuedMinor = value(draft.issued)
  return { requestedMinor, issuedMinor, differenceMinor: issuedMinor - requestedMinor }
}

/** A posted batch: the stored values only. Live item prices are never read (constitution II). */
export function postedTotals(
  doc: Pick<IssueBatch, 'requestedValueMinor' | 'issuedValueMinor'>,
): BatchTotals {
  return {
    requestedMinor: doc.requestedValueMinor,
    issuedMinor: doc.issuedValueMinor,
    differenceMinor: doc.issuedValueMinor - doc.requestedValueMinor,
  }
}

function priceLookup(items: readonly PostItem[]): (line: { itemCode: string }) => number {
  const byCode = new Map(items.map((i) => [i.code, i.priceMinor]))
  return (line) => {
    const price = byCode.get(line.itemCode)
    if (price === undefined) throw new Error(`Issue line has no known item (${line.itemCode})`)
    return price
  }
}

function movementFor(draft: IssueDraft, line: IssuedLine, price: number, ctx: PostContext) {
  const permits = draft.permits.join(' - ')
  return {
    id: `${ctx.id}-L${line.n}`,
    data: {
      type: MOVEMENT_TYPES.ISSUE,
      itemCode: line.itemCode,
      qty: line.qty,
      businessDate: draft.businessDate,
      priceMinor: price,
      batchNo: line.batchNo,
      expiry: line.expiry === '' ? null : line.expiry,
      docNumber: permits === '' ? null : permits,
      reference: `دفعة ${draft.number}`,
      note: line.forItemCode === null ? null : `بدل ${line.forItemCode}`,
      supplier: null,
      source: { kind: 'issue' as const, id: ctx.id },
      substituteFor:
        line.forItemCode === null ? null : { itemCode: line.forItemCode, qty: line.qty },
      reverses: null,
      reason: hasText(line.negativeReason) ? (line.negativeReason ?? '').trim() : null,
      deviceId: ctx.deviceId,
      createdBy: ctx.uid,
    },
  }
}

/** One صرف movement per issued line, with the price at posting. Throws on an unknown item. */
export function toMovements(draft: IssueDraft, ctx: PostContext): PlannedMovement[] {
  const priceOf = priceLookup(ctx.items)
  return draft.issued.map((line) => movementFor(draft, line, priceOf(line), ctx))
}

/**
 * Pure plan of one atomic post (data-model "Post rule"): the movements, then the status with the
 * prices and values snapshotted now. `validateForPost` must pass first.
 */
export function toPostBatch(draft: IssueDraft, ctx: PostContext): IssuePostBatch {
  const priceOf = priceLookup(ctx.items)
  const requested = draft.requested.map((r) => ({ ...r, priceMinor: priceOf(r) }))
  const totals = draftTotals({ ...draft, requested }, (code) => priceOf({ itemCode: code }))
  return {
    movements: toMovements(draft, ctx),
    patch: {
      status: 'posted',
      requested,
      requestedValueMinor: totals.requestedMinor,
      issuedValueMinor: totals.issuedMinor,
    },
  }
}
