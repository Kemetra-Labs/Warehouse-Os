/**
 * R10: two devices can number a batch the same while both are offline. It is detected after
 * sync and shown as a warning; the numbers are never changed, because one may already be printed.
 */

export interface NumberedBatch {
  readonly id: string
  readonly number: number
}

export interface DuplicateNumber {
  readonly number: number
  /** The ids of every batch that carries this number, in the order given. */
  readonly ids: readonly string[]
}

/** The numbers carried by more than one batch (any status), lowest number first. */
export function duplicateBatchNumbers(batches: readonly NumberedBatch[]): DuplicateNumber[] {
  const byNumber = new Map<number, string[]>()
  for (const b of batches) byNumber.set(b.number, [...(byNumber.get(b.number) ?? []), b.id])
  return [...byNumber.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([number, ids]) => ({ number, ids }))
    .sort((a, b) => a.number - b.number)
}

/** True when another batch (not `id`) has the same number. */
export function hasDuplicateNumber(
  batches: readonly NumberedBatch[],
  id: string,
  number: number,
): boolean {
  return batches.some((b) => b.id !== id && b.number === number)
}
