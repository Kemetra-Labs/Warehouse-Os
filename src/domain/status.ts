import { STATUS_LABELS } from './types'

export interface StatusSettings {
  readonly coverageMonths: number
  readonly defaultReorder: number
}

const DAY_MS = 86_400_000
const MONTH_DAYS = 30

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS
}

/** `max(1, round((maxDate - minDate) / 30 days))` over all movement business dates. */
export function monthsOfConsumption(dates: readonly string[]): number {
  if (dates.length === 0) return 1
  const days = dates.map(dayNumber)
  const span = Math.max(...days) - Math.min(...days)
  return Math.max(1, Math.round(span / MONTH_DAYS))
}

export function reorderPoint(
  item: { readonly reorderManual: number | null; readonly issued: number },
  settings: StatusSettings,
  months: number,
): number {
  if (item.reorderManual !== null && item.reorderManual > 0) return item.reorderManual
  if (item.issued > 0) {
    // The small epsilon keeps values like 3.0000000000000004 from rounding up.
    const raw = (item.issued / months) * settings.coverageMonths
    return Math.max(1, Math.ceil(raw - 1e-9))
  }
  return settings.defaultReorder
}

export function itemStatus(balance: number, reorder: number): string {
  if (balance < 0) return STATUS_LABELS.OVERDRAWN
  if (balance === 0) return STATUS_LABELS.OUT
  if (balance <= reorder) return STATUS_LABELS.REORDER
  return STATUS_LABELS.AVAILABLE
}

export function pendingSettlement(balance: number): boolean {
  return balance < 0
}
