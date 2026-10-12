import { DEFAULT_SETTINGS } from '../data/convert'
import { issuedTotals, itemBalances } from '../domain/ledger'
import {
  itemStatus,
  monthsOfConsumption,
  reorderPoint,
  type StatusSettings,
} from '../domain/status'
import type { Item, Movement } from '../domain/types'
import type { CachedBalance } from './types'

export const DATE_NOTE = 'سبب محتمل: تاريخ الحركات الست'

export type DiffKind = 'balance' | 'status' | 'missing-in-app' | 'missing-in-workbook'

export interface ParityDiff {
  readonly code: string
  readonly kind: DiffKind
  /** Value computed by the app (balance, or status label); null when the item is absent. */
  readonly app: string | number | null
  /** Cached value in "الأرصدة اللحظية" (L or N); null when the item is absent. */
  readonly workbook: string | number | null
  readonly reason: string
}

export interface ParityReport {
  /** Items compared (one per code known to the app or the workbook). */
  readonly total: number
  /** Items whose balance equals column L: the SC-001 figure ("N / 97"). */
  readonly balanceMatched: number
  readonly statusMatched: number
  readonly diffs: readonly ParityDiff[]
}

export interface ParityInput {
  readonly items: readonly Pick<Item, 'code' | 'reorderManual'>[]
  readonly movements: readonly Pick<
    Movement,
    'type' | 'qty' | 'itemCode' | 'businessDate' | 'batchNo' | 'expiry'
  >[]
  readonly cached: readonly CachedBalance[]
  /** How many workbook dates were remapped from 2026-01-08 (explains status-only differences). */
  readonly remappedCount: number
  readonly settings?: StatusSettings
}

const BALANCE_REASON = 'الرصيد مختلف عن عمود "الرصيد الحالي" في الأرصدة اللحظية'
const STATUS_REASON = 'الحالة مختلفة عن عمود الحالة في الأرصدة اللحظية'
const MISSING_APP_REASON = 'الصنف موجود في الأرصدة اللحظية وغير موجود في التطبيق'
const MISSING_BOOK_REASON = 'الصنف موجود في التطبيق وغير موجود في الأرصدة اللحظية'

interface Computed {
  readonly balance: number
  readonly status: string
}

function computeAll(input: ParityInput): Map<string, Computed> {
  const settings = input.settings ?? DEFAULT_SETTINGS
  const balances = itemBalances(input.movements)
  const issued = issuedTotals(input.movements)
  const months = monthsOfConsumption(input.movements.map((m) => m.businessDate))
  const out = new Map<string, Computed>()
  for (const item of input.items) {
    const balance = balances.get(item.code) ?? 0
    const reorder = reorderPoint(
      { reorderManual: item.reorderManual, issued: issued.get(item.code) ?? 0 },
      settings,
      months,
    )
    out.set(item.code, { balance, status: itemStatus(balance, reorder) })
  }
  return out
}

/** The note only fits a status-only difference: with a wrong balance the balance is the cause. */
function statusReason(remappedCount: number, balanceMatches: boolean): string {
  return remappedCount > 0 && balanceMatches ? `${STATUS_REASON}. ${DATE_NOTE}` : STATUS_REASON
}

/**
 * FR-003: balances against cached column L (must all match) and statuses against column N.
 * A status-only difference carries the "تاريخ الحركات الست" note while the workbook still
 * holds the 2026-01-08 dates, because those inflate its months-of-consumption.
 */
export function computeParity(input: ParityInput): ParityReport {
  const computed = computeAll(input)
  const cachedByCode = new Map(input.cached.map((c) => [c.code, c]))
  const diffs: ParityDiff[] = []
  let balanceMatched = 0
  let statusMatched = 0

  for (const [code, app] of computed) {
    const book = cachedByCode.get(code)
    if (!book) {
      diffs.push({
        code,
        kind: 'missing-in-workbook',
        app: app.balance,
        workbook: null,
        reason: MISSING_BOOK_REASON,
      })
      continue
    }
    if (book.balance === app.balance) balanceMatched += 1
    else
      diffs.push({
        code,
        kind: 'balance',
        app: app.balance,
        workbook: book.balance,
        reason: BALANCE_REASON,
      })
    if (book.status === app.status) statusMatched += 1
    else {
      const reason = statusReason(input.remappedCount, book.balance === app.balance)
      diffs.push({ code, kind: 'status', app: app.status, workbook: book.status, reason })
    }
  }
  for (const book of input.cached) {
    if (computed.has(book.code)) continue
    diffs.push({
      code: book.code,
      kind: 'missing-in-app',
      app: null,
      workbook: book.balance,
      reason: MISSING_APP_REASON,
    })
  }
  return {
    total: new Set([...computed.keys(), ...cachedByCode.keys()]).size,
    balanceMatched,
    statusMatched,
    diffs,
  }
}
