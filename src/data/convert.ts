import { settingsSchema, type Settings } from '../domain/types'
import type { z } from 'zod'

export interface RawDoc {
  readonly id: string
  readonly data: unknown
}

export interface ParsedDoc<T> {
  readonly id: string
  readonly value: T
}

export interface DocError {
  readonly id: string
  readonly message: string
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

/** Firestore rejects `undefined`; writes use `null` instead. Returns a new structure. */
export function stripUndefined<T>(value: T): T {
  if (value === undefined) return null as T
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v as unknown)) as T
  if (isPlain(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = stripUndefined(v)
    return out as T
  }
  return value
}

/** Milliseconds from a Firestore Timestamp, a Date or a `{seconds, nanoseconds}` shape. */
export function toMillis(ts: unknown): number {
  if (typeof ts !== 'object' || ts === null) return 0
  const o = ts as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown }
  if (typeof o.toMillis === 'function') return Number((o.toMillis as () => number)())
  if (ts instanceof Date) return ts.getTime()
  if (typeof o.seconds === 'number') {
    return o.seconds * 1000 + Math.floor(Number(o.nanoseconds ?? 0) / 1_000_000)
  }
  return 0
}

/** Parses each document with the zod schema; invalid documents become errors, never throw. */
export function parseDocs<T>(
  schema: z.ZodType<T>,
  docs: readonly RawDoc[],
): { ok: ParsedDoc<T>[]; errors: DocError[] } {
  const ok: ParsedDoc<T>[] = []
  const errors: DocError[] = []
  for (const doc of docs) {
    const res = schema.safeParse(doc.data)
    if (res.success) ok.push({ id: doc.id, value: res.data })
    else errors.push({ id: doc.id, message: res.error.message })
  }
  return { ok, errors }
}

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({})

export function parseSettings(data: unknown): Settings {
  if (data === undefined || data === null) return DEFAULT_SETTINGS
  const res = settingsSchema.safeParse(data)
  return res.success ? res.data : DEFAULT_SETTINGS
}
