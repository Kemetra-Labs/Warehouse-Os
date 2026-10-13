import type { ManualInput, ManualKind, ManualProblem } from '../../domain/adjust'
import { suggestSettlement } from '../../domain/adjust'
import { parseExpiryInput, parseQtyInput } from '../../domain/fieldInput'
import type { BatchBalance } from '../../domain/ledger'

/** The batch dropdown value that means "a batch that is not in the list". */
export const NEW_BATCH = '__new__'

export type Direction = 'up' | 'down'

/** What the adjust form holds while it is edited. Quantities stay text until they are saved. */
export interface AdjustFormState {
  readonly kind: ManualKind
  readonly direction: Direction
  readonly qtyText: string
  /** `batchKey` of a listed batch, or `NEW_BATCH`. */
  readonly batch: string
  readonly newBatchNo: string
  readonly newExpiry: string
  readonly reason: string
  /** `YYYY-MM-DD`. */
  readonly businessDate: string
}

export const SETTLEMENT_REASON = 'تسوية رصيد سالب'

/** The dropdown value of a batch: the batch number and expiry, as the ledger groups them. */
export const batchKey = (b: Pick<BatchBalance, 'batchNo' | 'expiry'>): string =>
  `${b.batchNo ?? ''}\u0000${b.expiry ?? ''}`

/**
 * The form as it opens. An item below zero opens as the adjustment that brings it to 0, on the
 * batch that is below zero; any other item opens as an empty return.
 */
export function initialForm(
  balance: number,
  batches: readonly BatchBalance[],
  today: string,
): AdjustFormState {
  const base: AdjustFormState = {
    kind: 'return',
    direction: 'up',
    qtyText: '',
    batch: batches[0] ? batchKey(batches[0]) : NEW_BATCH,
    newBatchNo: '',
    newExpiry: '',
    reason: '',
    businessDate: today,
  }
  const settlement = suggestSettlement(batches, balance)
  if (settlement === null) return base
  return {
    ...base,
    kind: 'adjust',
    qtyText: String(settlement.qty),
    batch: batchKey(settlement),
    reason: SETTLEMENT_REASON,
  }
}

export interface FormTarget {
  readonly itemCode: string
  readonly priceMinor: number
}

export type FormResult =
  | { readonly ok: true; readonly input: ManualInput }
  | { readonly ok: false; readonly problems: readonly ManualProblem[] }

const problem = (code: ManualProblem['code'], message: string): ManualProblem => ({ code, message })

/** The batch and expiry the form points at, or the problem with what was typed. */
function batchOf(
  form: AdjustFormState,
  batches: readonly BatchBalance[],
): { batchNo: string | null; expiry: string | null } | ManualProblem {
  if (form.batch !== NEW_BATCH) {
    const found = batches.find((b) => batchKey(b) === form.batch)
    return { batchNo: found?.batchNo ?? null, expiry: found?.expiry ?? null }
  }
  const expiry = parseExpiryInput(form.newExpiry)
  if (expiry.kind === 'bad') return problem('date', 'تاريخ الصلاحية مش صحيح. اكتبه 03/2031.')
  return {
    batchNo: form.newBatchNo.trim() === '' ? null : form.newBatchNo.trim(),
    expiry: expiry.kind === 'ok' ? expiry.value : null,
  }
}

/** The movement the form describes, or what is wrong with it. The domain validates the rest. */
export function toManualInput(
  form: AdjustFormState,
  target: FormTarget,
  batches: readonly BatchBalance[],
): FormResult {
  const qty = parseQtyInput(form.qtyText)
  const where = batchOf(form, batches)
  const problems: ManualProblem[] = []
  if (qty === null) problems.push(problem('qty', 'اكتب الكمية أرقام بس.'))
  if ('code' in where) problems.push(where)
  if (problems.length > 0 || qty === null || 'code' in where) return { ok: false, problems }
  const signed = form.kind === 'adjust' && form.direction === 'down' ? -qty : qty
  return {
    ok: true,
    input: {
      kind: form.kind,
      itemCode: target.itemCode,
      qty: signed,
      batchNo: where.batchNo,
      expiry: where.expiry,
      priceMinor: target.priceMinor,
      reason: form.reason,
      businessDate: form.businessDate,
    },
  }
}
