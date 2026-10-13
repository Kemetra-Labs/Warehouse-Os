import { issuedTotals } from './ledger'
import { normalizeDigits } from './search'
import { monthsOfConsumption, reorderPoint, type StatusSettings } from './status'
import type { Item, Movement } from './types'

/** The two settings the screen edits (FR-012). */
export interface SettingsDraft {
  readonly coverageMonths: number | null
  readonly defaultReorder: number | null
}

export interface SettingsErrors {
  readonly coverageMonths?: string
  readonly defaultReorder?: string
}

export function validateSettings(draft: SettingsDraft): SettingsErrors {
  const months = draft.coverageMonths
  const reorder = draft.defaultReorder
  return {
    ...(months !== null && Number.isFinite(months) && months > 0
      ? {}
      : { coverageMonths: 'مدة التغطية لازم تكون أكتر من صفر' }),
    ...(reorder !== null && Number.isInteger(reorder) && reorder >= 1
      ? {}
      : { defaultReorder: 'الحد الافتراضي لازم يكون رقم صحيح 1 أو أكتر' }),
  }
}

/** Months as typed: a dot, an Arabic decimal mark or a comma; Arabic digits are fine. */
export function parseCoverageInput(text: string): number | null {
  const s = normalizeDigits(text).trim().replace(/[٫,]/g, '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const value = Number(s)
  return value > 0 ? value : null
}

/** A whole number as typed, or null. */
export function parseReorderInput(text: string): number | null {
  const s = normalizeDigits(text).trim()
  return /^\d+$/.test(s) ? Number(s) : null
}

/** The values to store. Throws for an invalid draft: validate first. */
export function settingsPatch(draft: SettingsDraft): {
  readonly coverageMonths: number
  readonly defaultReorder: number
} {
  const { coverageMonths, defaultReorder } = draft
  if (
    Object.keys(validateSettings(draft)).length > 0 ||
    coverageMonths === null ||
    defaultReorder === null
  ) {
    throw new Error('settingsPatch needs valid settings')
  }
  return { coverageMonths, defaultReorder }
}

/**
 * How many items get a different reorder point under `after` than under `before`. Reorder
 * points are never stored: they are derived from these settings, so a change applies at once.
 */
export function reorderImpact(
  items: readonly Pick<Item, 'code' | 'reorderManual'>[],
  movements: readonly Pick<
    Movement,
    'type' | 'qty' | 'itemCode' | 'batchNo' | 'expiry' | 'businessDate'
  >[],
  before: StatusSettings,
  after: StatusSettings,
): number {
  const issued = issuedTotals(movements)
  const months = monthsOfConsumption(movements.map((m) => m.businessDate))
  return items.filter((item) => {
    const input = { reorderManual: item.reorderManual, issued: issued.get(item.code) ?? 0 }
    return reorderPoint(input, before, months) !== reorderPoint(input, after, months)
  }).length
}
