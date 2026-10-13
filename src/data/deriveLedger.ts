import { batchBalances, issuedTotals, itemBalances, type BatchBalance } from '../domain/ledger'
import { itemStatus, monthsOfConsumption, pendingSettlement, reorderPoint } from '../domain/status'
import { STATUS_LABELS, type Item, type Movement, type Settings } from '../domain/types'
import { toMillis } from './convert'
import type { SeenState } from './seenStore'

export type MovementDoc = Movement & { readonly id: string }

export interface LedgerInput {
  readonly items: readonly Item[]
  readonly movements: readonly MovementDoc[]
  readonly settings: Settings
  readonly seen: SeenState
  /**
   * This device's id. When given, movements it posted itself never count as "changed since
   * seen": the highlight is for what arrived from another device (FR-072).
   */
  readonly ownDeviceId?: string
}

export interface ItemRow {
  readonly item: Item
  readonly balance: number
  readonly issued: number
  readonly reorder: number
  readonly status: string
  readonly pendingSettlement: boolean
  readonly lastPostedAt: number | null
  readonly changedSinceSeen: boolean
}

export interface LedgerTally {
  readonly needsReorder: number
  readonly out: number
  readonly pendingSettlements: number
}

export interface LedgerView {
  readonly rows: readonly ItemRow[]
  readonly byCode: ReadonlyMap<string, ItemRow>
  readonly months: number
  readonly tally: LedgerTally
  readonly pendingSettlements: readonly string[]
  readonly changedCodes: readonly string[]
  batchBalancesFor(itemCode: string): BatchBalance[]
}

function latestPostedAt(
  movements: readonly MovementDoc[],
  skipDeviceId?: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of movements) {
    if (skipDeviceId !== undefined && m.deviceId === skipDeviceId) continue
    const ms = toMillis(m.postedAt)
    if (ms > (out.get(m.itemCode) ?? 0)) out.set(m.itemCode, ms)
  }
  return out
}

function tallyOf(rows: readonly ItemRow[]): LedgerTally {
  let needsReorder = 0
  let out = 0
  let settlements = 0
  for (const r of rows) {
    if (!r.item.active) continue
    if (r.status === STATUS_LABELS.REORDER) needsReorder += 1
    if (r.status === STATUS_LABELS.OUT) out += 1
    if (r.pendingSettlement) settlements += 1
  }
  return { needsReorder, out, pendingSettlements: settlements }
}

/** Pure combiner: items + movements + settings (+ device seen state) -> derived view. */
export function deriveLedger(input: LedgerInput): LedgerView {
  const { items, movements, settings, seen, ownDeviceId } = input
  const balances = itemBalances(movements)
  const issued = issuedTotals(movements)
  const latest = latestPostedAt(movements)
  const latestForeign = ownDeviceId === undefined ? latest : latestPostedAt(movements, ownDeviceId)
  const months = monthsOfConsumption(movements.map((m) => m.businessDate))

  const rows = items.map((item): ItemRow => {
    const balance = balances.get(item.code) ?? 0
    const issuedQty = issued.get(item.code) ?? 0
    const reorder = reorderPoint(
      { reorderManual: item.reorderManual, issued: issuedQty },
      settings,
      months,
    )
    const last = latest.get(item.code) ?? null
    const foreign = latestForeign.get(item.code) ?? null
    const seenAt = seen.byItem[item.code] ?? seen.baseline
    return {
      item,
      balance,
      issued: issuedQty,
      reorder,
      status: itemStatus(balance, reorder),
      pendingSettlement: pendingSettlement(balance),
      lastPostedAt: last,
      changedSinceSeen: foreign !== null && foreign > seenAt,
    }
  })

  const byCode = new Map(rows.map((r) => [r.item.code, r]))
  return {
    rows,
    byCode,
    months,
    tally: tallyOf(rows),
    pendingSettlements: rows.filter((r) => r.pendingSettlement).map((r) => r.item.code),
    changedCodes: rows.filter((r) => r.changedSinceSeen).map((r) => r.item.code),
    batchBalancesFor: (code) => batchBalances(movements, code),
  }
}
