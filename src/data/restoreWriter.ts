import type { BackupMovement } from '../excel/readBackup'
import type { ImportedItem } from '../excel/types'
import { chunk, MAX_BATCH_OPS, type ImportProgress, type PlannedOp } from './importWriter'

export interface RestoreContext {
  /** The signed-in owner: the rules require every new movement's `createdBy` to be this uid. */
  readonly uid: string
}

export interface RestorePlan {
  /** Item batches first, then movement batches; each holds at most `MAX_BATCH_OPS` ops. */
  readonly batches: readonly (readonly PlannedOp[])[]
  readonly itemsToWrite: number
  readonly movementsToWrite: number
  readonly itemsSkipped: number
  readonly movementsSkipped: number
}

export interface RestoreInput {
  readonly items: readonly ImportedItem[]
  readonly movements: readonly BackupMovement[]
  readonly existingItemCodes: ReadonlySet<string>
  readonly existingMovementIds: ReadonlySet<string>
  readonly ctx: RestoreContext
}

/** The stored movement: no `id` key (the rules allow a fixed key set), authored by the restorer. */
function movementData(m: BackupMovement, ctx: RestoreContext): Record<string, unknown> {
  const data: Record<string, unknown> = { ...m, createdBy: ctx.uid }
  delete data.id
  return data
}

/**
 * Pure planner. What the database already holds is skipped, never rewritten: items may have been
 * edited since the backup, and movements are create-only, so a repeat would fail its whole batch.
 * `postedAt` is the restore time (the rules only accept the write time); `businessDate` is kept.
 */
export function planRestore(input: RestoreInput): RestorePlan {
  const { items, movements, existingItemCodes, existingMovementIds, ctx } = input
  const itemOps = items
    .filter((i) => !existingItemCodes.has(i.code))
    .map((i): PlannedOp => ({
      collection: 'items',
      id: i.code,
      data: { ...i },
      stamp: 'updatedAt',
    }))
  const movementOps = movements
    .filter((m) => !existingMovementIds.has(m.id))
    .map((m): PlannedOp => ({
      collection: 'movements',
      id: m.id,
      data: movementData(m, ctx),
      stamp: 'postedAt',
    }))
  return {
    batches: [...chunk(itemOps, MAX_BATCH_OPS), ...chunk(movementOps, MAX_BATCH_OPS)],
    itemsToWrite: itemOps.length,
    movementsToWrite: movementOps.length,
    itemsSkipped: items.length - itemOps.length,
    movementsSkipped: movements.length - movementOps.length,
  }
}

/** The side effects of a restore; the Firestore adapter implements it, tests fake it. */
export interface RestoreStore {
  existingItemCodes(): Promise<ReadonlySet<string>>
  /** The ids of every movement the server holds (not just the imported ones). */
  existingMovementIds(): Promise<ReadonlySet<string>>
  commit(ops: readonly PlannedOp[]): Promise<void>
}

export type RestoreSummary = Omit<RestorePlan, 'batches'> & { readonly batchCount: number }

export class RestoreWriteError extends Error {
  constructor(cause: unknown) {
    super(
      'الاستعادة وقفت في النص. اتأكد من النت واضغط استعادة تاني، وهتكمل من حيث وقفت من غير تكرار.',
      { cause },
    )
    this.name = 'RestoreWriteError'
  }
}

export interface RunRestoreArgs {
  readonly store: RestoreStore
  readonly items: readonly ImportedItem[]
  readonly movements: readonly BackupMovement[]
  readonly ctx: RestoreContext
  readonly onProgress?: (p: ImportProgress) => void
}

/** What a restore would write, without writing: the confirmation screen shows it first. */
export async function previewRestore(
  args: Pick<RunRestoreArgs, 'store' | 'items' | 'movements' | 'ctx'>,
): Promise<RestoreSummary> {
  const { store, items, movements, ctx } = args
  try {
    const [existingItemCodes, existingMovementIds] = await Promise.all([
      store.existingItemCodes(),
      store.existingMovementIds(),
    ])
    const { batches, ...counts } = planRestore({
      items,
      movements,
      existingItemCodes,
      existingMovementIds,
      ctx,
    })
    return { ...counts, batchCount: batches.length }
  } catch (err) {
    throw new RestoreWriteError(err)
  }
}

/** Skips what exists, then writes batch by batch. A failed run is resumed by running it again. */
export async function runRestore(args: RunRestoreArgs): Promise<RestoreSummary> {
  const { store, items, movements, ctx, onProgress } = args
  try {
    const [existingItemCodes, existingMovementIds] = await Promise.all([
      store.existingItemCodes(),
      store.existingMovementIds(),
    ])
    const { batches, ...counts } = planRestore({
      items,
      movements,
      existingItemCodes,
      existingMovementIds,
      ctx,
    })
    const totalOps = counts.itemsToWrite + counts.movementsToWrite
    let doneOps = 0
    onProgress?.({ doneOps, totalOps })
    for (const batch of batches) {
      await store.commit(batch)
      doneOps += batch.length
      onProgress?.({ doneOps, totalOps })
    }
    return { ...counts, batchCount: batches.length }
  } catch (err) {
    throw new RestoreWriteError(err)
  }
}
