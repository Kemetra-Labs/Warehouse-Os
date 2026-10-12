export const DENIED_MESSAGE = 'الحساب ده مش مسموحله'
export const GENERIC_ERROR_MESSAGE = 'حصلت مشكلة في تحميل البيانات. جرّب تاني.'

export interface DataError {
  readonly kind: 'denied' | 'other'
  readonly message: string
}

export interface SnapshotMeta {
  /** Documents with local writes the server has not acknowledged yet. */
  readonly pendingCount: number
  readonly fromCache: boolean
}

export interface Listener<T> {
  onData(rows: readonly T[], meta: SnapshotMeta): void
  onError(error: DataError): void
}

export type Unsubscribe = () => void

export function toDataError(err: unknown): DataError {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : null
  if (code === 'permission-denied') return { kind: 'denied', message: DENIED_MESSAGE }
  return { kind: 'other', message: GENERIC_ERROR_MESSAGE }
}
