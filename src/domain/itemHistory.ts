import { effect } from './ledger'
import type { Movement } from './types'

export type HistoryMovement = Movement & { readonly id: string }

export interface HistoryEntry {
  readonly id: string
  readonly movement: HistoryMovement
  /** Signed effect on the balance (`effect` from the ledger). */
  readonly effect: number
  readonly balanceAfter: number
  /** The id of the reversal that cancels this movement, or null. */
  readonly reversedBy: string | null
  /** The id of the movement this one reverses, or null. */
  readonly reverses: string | null
}

/**
 * One item's movements, oldest first: business date, then posting time, then id. The balance
 * after each includes every movement before it. A reversal is a movement of its own, so the
 * original and its reversal both stay in the list and both count in the balance.
 */
export function buildHistory(
  movements: readonly HistoryMovement[],
  itemCode: string,
  millisOf: (postedAt: unknown) => number,
): HistoryEntry[] {
  const own = movements.filter((m) => m.itemCode === itemCode)
  const reversedBy = new Map<string, string>()
  for (const m of own) if (m.reverses !== null) reversedBy.set(m.reverses, m.id)

  const sorted = [...own].sort(
    (a, b) =>
      a.businessDate.localeCompare(b.businessDate) ||
      millisOf(a.postedAt) - millisOf(b.postedAt) ||
      a.id.localeCompare(b.id),
  )
  let balance = 0
  return sorted.map((movement) => {
    const change = effect(movement)
    balance += change
    return {
      id: movement.id,
      movement,
      effect: change,
      balanceAfter: balance,
      reversedBy: reversedBy.get(movement.id) ?? null,
      reverses: movement.reverses,
    }
  })
}

export interface DocumentInfo {
  /** Where the movement came from, in words. */
  readonly label: string
  /** The in-app screen of the document, when there is one. */
  readonly link: string | null
}

const join = (parts: readonly (string | null)[]): string =>
  parts.filter((p): p is string => p !== null && p.trim() !== '').join(' · ')

/** The document a movement belongs to: a receipt, an issue batch, the workbook, or a manual entry. */
export function describeDocument(m: Movement): DocumentInfo {
  const { source, docNumber, reference, reason } = m
  if (source.kind === 'receipt') {
    return {
      label: join([
        docNumber === null ? 'إذن استلام' : `إذن ${docNumber}`,
        reference === null ? null : `فاتورة ${reference}`,
      ]),
      link: source.id === null ? null : `/receive/${source.id}`,
    }
  }
  if (source.kind === 'issue') {
    return {
      // A reversal carries neither a batch reference nor permits: it still names its batch.
      label: join([reference ?? 'دفعة صرف', docNumber === null ? null : `أذون ${docNumber}`]),
      link: source.id === null ? null : `/issue/${source.id}`,
    }
  }
  if (source.kind === 'import') {
    return { label: join(['من ملف الإكسيل', docNumber, reference]), link: null }
  }
  return { label: join([reason, docNumber, reference]), link: null }
}
