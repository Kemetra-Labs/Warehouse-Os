import type { ImportedItem, ImportedMovement } from '../excel/types'

/** Firestore allows 500 operations per batch; the contract keeps a margin. */
export const MAX_BATCH_OPS = 450

export type StampField = 'updatedAt' | 'postedAt'

/**
 * One document write. `data` carries no server timestamp: the Firestore adapter adds
 * `serverTimestamp()` under `stamp`, which keeps the planner pure and testable.
 */
export interface PlannedOp {
  readonly collection: 'items' | 'movements'
  readonly id: string
  readonly data: Readonly<Record<string, unknown>>
  readonly stamp: StampField
}

export interface WriterContext {
  readonly uid: string
  readonly deviceId: string
  readonly fileName: string
}

export interface ImportPlan {
  /** Item batches first, then movement batches; each holds at most `MAX_BATCH_OPS` ops. */
  readonly batches: readonly (readonly PlannedOp[])[]
  readonly itemsToWrite: number
  readonly movementsToWrite: number
  readonly itemsSkipped: number
  readonly movementsSkipped: number
}

export interface PlanInput {
  readonly items: readonly ImportedItem[]
  readonly movements: readonly ImportedMovement[]
  readonly existingItemCodes: ReadonlySet<string>
  readonly existingMovementIds: ReadonlySet<string>
  readonly ctx: WriterContext
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** The stored movement: no `id`/`row` keys (the rules allow a fixed key set), price = the item's. */
function movementData(
  m: ImportedMovement,
  priceMinor: number,
  ctx: WriterContext,
): Record<string, unknown> {
  return {
    type: m.type,
    itemCode: m.itemCode,
    qty: m.qty,
    businessDate: m.businessDate,
    priceMinor,
    batchNo: m.batchNo,
    expiry: m.expiry,
    docNumber: m.docNumber,
    reference: m.reference,
    note: m.note,
    supplier: m.supplier,
    source: { kind: 'import', id: null, row: m.row },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: ctx.deviceId,
    createdBy: ctx.uid,
  }
}

/** Pure planner. Items and movements that already exist are skipped (resume, FR-004). */
export function planImport(input: PlanInput): ImportPlan {
  const { items, movements, existingItemCodes, existingMovementIds, ctx } = input
  const price = new Map(items.map((i) => [i.code, i.priceMinor]))
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
    .map((m): PlannedOp => {
      const priceMinor = price.get(m.itemCode)
      if (priceMinor === undefined) throw new Error(`Unknown item ${m.itemCode} in ${m.id}`)
      return {
        collection: 'movements',
        id: m.id,
        data: movementData(m, priceMinor, ctx),
        stamp: 'postedAt',
      }
    })
  return {
    batches: [...chunk(itemOps, MAX_BATCH_OPS), ...chunk(movementOps, MAX_BATCH_OPS)],
    itemsToWrite: itemOps.length,
    movementsToWrite: movementOps.length,
    itemsSkipped: items.length - itemOps.length,
    movementsSkipped: movements.length - movementOps.length,
  }
}

export interface ImportMark {
  readonly importedAtMs: number
}

/** The side effects of an import; the Firestore adapter implements it, tests fake it. */
export interface ImportStore {
  /** `settings/app.workbookImport` as the server holds it, or null. */
  readImportMark(): Promise<ImportMark | null>
  existingItemCodes(): Promise<ReadonlySet<string>>
  /** IDs of the existing `imp-r*` movements. */
  existingMovementIds(): Promise<ReadonlySet<string>>
  commit(ops: readonly PlannedOp[]): Promise<void>
  markImported(mark: { readonly movementCount: number; readonly fileName: string }): Promise<void>
}

export interface ImportProgress {
  readonly doneOps: number
  readonly totalOps: number
}

export interface ImportSummary extends Omit<ImportPlan, 'batches'> {
  readonly batchCount: number
}

export class AlreadyImportedError extends Error {
  readonly importedAtMs: number

  constructor(importedAtMs: number) {
    super('الملف اتستورد قبل كده')
    this.name = 'AlreadyImportedError'
    this.importedAtMs = importedAtMs
  }
}

export class ImportWriteError extends Error {
  constructor(cause: unknown) {
    super(
      'الاستيراد وقف في النص. اتأكد من النت واضغط استيراد تاني، وهيكمل من حيث وقف من غير تكرار.',
      { cause },
    )
    this.name = 'ImportWriteError'
  }
}

export interface RunImportArgs {
  readonly store: ImportStore
  readonly items: readonly ImportedItem[]
  readonly movements: readonly ImportedMovement[]
  readonly ctx: WriterContext
  readonly onProgress?: (p: ImportProgress) => void
}

/**
 * Refuses when already imported, skips what exists, writes batch by batch, and writes the
 * `workbookImport` mark only after the last batch succeeded (so a failure can be resumed).
 */
export async function runImport(args: RunImportArgs): Promise<ImportSummary> {
  const { store, items, movements, ctx, onProgress } = args
  try {
    const mark = await store.readImportMark()
    if (mark) throw new AlreadyImportedError(mark.importedAtMs)
    const [existingItemCodes, existingMovementIds] = await Promise.all([
      store.existingItemCodes(),
      store.existingMovementIds(),
    ])
    const { batches, ...counts } = planImport({
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
    await store.markImported({ movementCount: movements.length, fileName: ctx.fileName })
    return { ...counts, batchCount: batches.length }
  } catch (err) {
    if (err instanceof AlreadyImportedError) throw err
    throw new ImportWriteError(err)
  }
}
