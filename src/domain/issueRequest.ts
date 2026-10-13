import type { IssueDraft } from './issue'
import { addRequested } from './issueEdit'
import type { StockView } from './issueStock'
import type { Item } from './types'

/**
 * The line being filled in on the issue screen: an item and how many the permit asks for (NaN
 * while the field holds text that is not a whole number). It is not on the batch yet. Which batch the pieces come from is not decided here: joining issues
 * them earliest-expiry first, and the row offers another batch, a substitute or a reason after.
 */
export interface OpenRequest {
  readonly item: Item
  readonly qty: number
}

const NO_QTY = 'اكتب الكمية المطلوبة'
const STOPPED = 'الصنف ده موقوف. مينفعش يتصرف.'

/** A new open line: one piece, as the stepper starts. */
export function startRequest(item: Item): OpenRequest {
  return { item, qty: 1 }
}

/**
 * Why an open line cannot join the batch yet, in Arabic; null when it can. A quantity beyond the
 * stock is not a reason: the joined row shows what is short and offers the way out. This is the
 * one rule behind every automatic join.
 */
export function requestProblem(open: OpenRequest): string | null {
  if (!open.item.active) return STOPPED
  if (!Number.isInteger(open.qty) || open.qty <= 0) return NO_QTY
  return null
}

/** The draft with the open line on it (added to its item if already there), or null while not ready. */
export function joinRequest(
  draft: IssueDraft,
  open: OpenRequest,
  stock: StockView,
): IssueDraft | null {
  return requestProblem(open) === null ? addRequested(draft, open.item, open.qty, stock) : null
}

/** What one pick does: the batch and the open line after it. */
export type PickStep =
  | {
      readonly kind: 'step'
      readonly draft: IssueDraft
      readonly open: OpenRequest
      readonly joined: boolean
    }
  /** The open line cannot join yet, so nothing changes; `problem` is what it still needs. */
  | { readonly kind: 'busy'; readonly problem: string }
  /** The picked item cannot be issued at all. The open line is left as it is. */
  | { readonly kind: 'refused'; readonly problem: string }

/**
 * One search pick or tap, as a pure step. The same item again counts one more on the open line.
 * Any other item first finishes the open line: a ready one joins the batch on its own, an
 * unready one stays open and the new item is refused (`busy`).
 */
export function stepPick(
  draft: IssueDraft,
  open: OpenRequest | null,
  item: Item,
  stock: StockView,
): PickStep {
  if (!item.active) return { kind: 'refused', problem: STOPPED }
  if (open && open.item.code === item.code) {
    // Counting one more on a quantity that is not a number would hide that it is not one.
    if (Number.isNaN(open.qty)) return { kind: 'busy', problem: NO_QTY }
    return { kind: 'step', draft, open: { ...open, qty: open.qty + 1 }, joined: false }
  }
  if (open === null) return { kind: 'step', draft, open: startRequest(item), joined: false }
  const joined = joinRequest(draft, open, stock)
  if (joined === null) return { kind: 'busy', problem: requestProblem(open) ?? NO_QTY }
  return { kind: 'step', draft: joined, open: startRequest(item), joined: true }
}

export type ApproveStep =
  | { readonly kind: 'ok'; readonly draft: IssueDraft }
  | { readonly kind: 'blocked'; readonly problem: string }

/** Going on to approve takes a ready open line along; an unready one blocks it and says why. */
export function stepApprove(
  draft: IssueDraft,
  open: OpenRequest | null,
  stock: StockView,
): ApproveStep {
  if (open === null) return { kind: 'ok', draft }
  const joined = joinRequest(draft, open, stock)
  return joined === null
    ? { kind: 'blocked', problem: requestProblem(open) ?? NO_QTY }
    : { kind: 'ok', draft: joined }
}
