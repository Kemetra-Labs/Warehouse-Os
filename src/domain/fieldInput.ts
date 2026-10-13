import { toMinor } from './money'
import { normalizeDigits } from './search'

export type ExpiryInput =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'bad' }

const pad = (n: number): string => String(n).padStart(2, '0')

function validDay(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function monthYear(month: number, year: number): ExpiryInput {
  return month >= 1 && month <= 12
    ? { kind: 'ok', value: `${year}-${pad(month)}` }
    : { kind: 'bad' }
}

function fullDay(year: number, month: number, day: number): ExpiryInput {
  return validDay(year, month, day)
    ? { kind: 'ok', value: `${year}-${pad(month)}-${pad(day)}` }
    : { kind: 'bad' }
}

/**
 * What the storekeeper types for an expiry, as the stored value: `MM/YYYY` or `YYYY-MM` become
 * `YYYY-MM` (the whole month), a full date becomes `YYYY-MM-DD`. Arabic-Indic digits are fine.
 */
export function parseExpiryInput(text: string): ExpiryInput {
  const s = normalizeDigits(text).trim()
  if (s === '') return { kind: 'empty' }
  const sep = '[/.-]'
  const my = new RegExp(`^(\\d{1,2})${sep}(\\d{4})$`).exec(s)
  if (my) return monthYear(Number(my[1]), Number(my[2]))
  const ym = new RegExp(`^(\\d{4})${sep}(\\d{1,2})$`).exec(s)
  if (ym) return monthYear(Number(ym[2]), Number(ym[1]))
  const dmy = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})$`).exec(s)
  if (dmy) return fullDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  const ymd = new RegExp(`^(\\d{4})${sep}(\\d{1,2})${sep}(\\d{1,2})$`).exec(s)
  if (ymd) return fullDay(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))
  return { kind: 'bad' }
}

/** A stored expiry for display and editing: `03/2031` or `15/03/2031`. Unknown text is kept. */
export function formatExpiry(stored: string | null): string {
  if (stored === null) return ''
  const month = /^(\d{4})-(\d{2})$/.exec(stored)
  if (month) return `${month[2]}/${month[1]}`
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored)
  if (day) return `${day[3]}/${day[2]}/${day[1]}`
  return stored
}

/** A whole quantity. Blank is 0; anything else that is not a non-negative integer is null. */
export function parseQtyInput(text: string): number | null {
  const s = normalizeDigits(text).trim()
  if (s === '') return 0
  return /^\d+$/.test(s) ? Number(s) : null
}

/** A price in pounds (up to two decimals) as piastres. Null when it is not a price. */
export function parsePriceInput(text: string): number | null {
  const s = normalizeDigits(text)
    .replace(/٫/g, '.')
    .replace(/[,٬\s]/g, '')
  return /^\d+(\.\d{1,2})?$/.test(s) ? toMinor(Number(s)) : null
}

/** Piastres as the plain number the price field shows while editing (no separators). */
export function formatPriceInput(minor: number): string {
  return String(minor / 100)
}

/** A `YYYY-MM-DD` day for display: `12/10/2026`. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
