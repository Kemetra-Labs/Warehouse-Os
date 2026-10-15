export interface Gs1Parsed {
  readonly gtin: string
  readonly expiry: string | null
  readonly batchNo: string | null
}

export type SearchClass =
  | {
      readonly kind: 'gtin'
      readonly gtin: string
      readonly expiry: string | null
      readonly batchNo: string | null
    }
  | { readonly kind: 'ambiguous'; readonly value: string }
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'name'; readonly query: string }

const GS = '\x1d'
/** Application identifiers with a fixed data length (digits). */
const FIXED_AI: Readonly<Record<string, number>> = {
  '01': 14,
  '02': 14,
  '11': 6,
  '13': 6,
  '15': 6,
  '17': 6,
}
/** Application identifiers with variable length, ended by a GS or the end of the string. */
const VARIABLE_AI: readonly string[] = ['10', '21', '22', '30', '37']

export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0)
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660)
  })
}

/** GTIN-14 with a leading 0 -> GTIN-13; 12-digit UPC-A -> GTIN-13 (leading 0 added). */
export function normalizeGtin(digits: string): string {
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1)
  if (digits.length === 12) return `0${digits}`
  return digits
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * YYMMDD -> YYYY-MM-DD. Day 00 means the whole month (GS1 rule), stored as `YYYY-MM` like a typed
 * `MM/YYYY`, so a scanned and a typed expiry of the same batch are the same batch.
 */
function expiryFromYymmdd(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return null
  const year = 2000 + Number(v.slice(0, 2))
  const month = Number(v.slice(2, 4))
  const day = Number(v.slice(4, 6))
  if (month < 1 || month > 12) return null
  const mm = String(month).padStart(2, '0')
  if (day === 0) return `${year}-${mm}`
  if (day > lastDayOfMonth(year, month)) return null
  return `${year}-${mm}-${String(day).padStart(2, '0')}`
}

function collectParenthesised(s: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) {
    out.set(m[1] ?? '', (m[2] ?? '').split(GS).join(''))
  }
  return out
}

function collectRaw(s: string): Map<string, string> {
  const out = new Map<string, string>()
  let pos = 0
  while (pos < s.length) {
    if (s[pos] === GS) {
      pos += 1
      continue
    }
    const ai = s.slice(pos, pos + 2)
    const fixed = FIXED_AI[ai]
    if (fixed !== undefined) {
      const value = s.slice(pos + 2, pos + 2 + fixed)
      if (value.length < fixed) break
      out.set(ai, value)
      pos += 2 + fixed
    } else if (VARIABLE_AI.includes(ai)) {
      const end = s.indexOf(GS, pos + 2)
      const stop = end === -1 ? s.length : end
      out.set(ai, s.slice(pos + 2, stop))
      pos = stop
    } else {
      break
    }
  }
  return out
}

/** Parses a GS1 element string (raw with GS separators, or the parenthesised form). */
export function parseGs1(input: string): Gs1Parsed | null {
  const s = input.trim().replace(/^\][A-Za-z]\d/, '')
  let elements: Map<string, string>
  if (s.startsWith('(')) elements = collectParenthesised(s)
  else if (/^01\d{14}/.test(s)) elements = collectRaw(s)
  else return null
  const raw = elements.get('01')
  if (raw === undefined || !/^\d{14}$/.test(raw)) return null
  const exp = elements.get('17')
  const batch = elements.get('10')
  return {
    gtin: normalizeGtin(raw),
    expiry: exp === undefined ? null : expiryFromYymmdd(exp),
    batchNo: batch === undefined || batch === '' ? null : batch,
  }
}

export function classify(input: string): SearchClass {
  const s = normalizeDigits(input.trim())
  const gs1 = parseGs1(s)
  if (gs1) return { kind: 'gtin', ...gs1 }
  // 8-9 digits: an EAN-8 or an authority code (FR-020); the caller looks up both.
  if (/^\d{8,9}$/.test(s)) return { kind: 'ambiguous', value: s }
  if (/^(\d{12}|\d{13}|\d{14})$/.test(s)) {
    return { kind: 'gtin', gtin: normalizeGtin(s), expiry: null, batchNo: null }
  }
  if (/^\d{1,4}$/.test(s)) return { kind: 'page', page: Number(s) }
  if (/^[A-Za-z]{3}-\d{2,3}$/.test(s)) return { kind: 'code', code: s.toUpperCase() }
  return { kind: 'name', query: s }
}

/** Folds alef forms, ya, ta marbuta; strips tatweel and diacritics; lower-cases. */
export function normalizeArabic(input: string): string {
  return input
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
}

/** Name search over nameAr + nameEn. Every word must match; all matches are returned. */
export function searchItems<
  T extends { readonly nameAr: string; readonly nameEn?: string | undefined },
>(items: readonly T[], query: string): T[] {
  const words = normalizeArabic(normalizeDigits(query)).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return items.filter((item) => {
    const hay = normalizeArabic(normalizeDigits(`${item.nameAr} ${item.nameEn ?? ''}`))
    return words.every((w) => hay.includes(w))
  })
}

export interface Identifiable {
  readonly code: string
  readonly gtins: readonly string[]
  readonly authorityCode?: string | null | undefined
}

/** Every item whose GTIN list or authority code equals `value` (8-9 digit lookup, FR-020). */
export function findByNumber<T extends Identifiable>(items: readonly T[], value: string): T[] {
  return items.filter((i) => i.gtins.includes(value) || i.authorityCode === value)
}

/** Every item holding exactly this GTIN. */
export function findByGtin<T extends Identifiable>(items: readonly T[], gtin: string): T[] {
  return items.filter((i) => i.gtins.includes(gtin))
}

/** Resolves a classified input against the item list; every match is returned. */
export function resolve<
  T extends Identifiable & {
    readonly nameAr: string
    readonly nameEn?: string | undefined
    readonly page?: number | undefined
  },
>(items: readonly T[], cls: SearchClass): T[] {
  switch (cls.kind) {
    case 'gtin':
      return findByGtin(items, cls.gtin)
    case 'ambiguous':
      return findByNumber(items, cls.value)
    case 'code':
      return items.filter((i) => i.code === cls.code)
    case 'name':
      return searchItems(items, cls.query)
    case 'page':
      return items.filter((i) => i.page === cls.page)
  }
}

/** The longest list of suggestions shown under the search box. */
export const SUGGESTION_LIMIT = 6

/**
 * Items to suggest while the user types, with the same matching as Enter (`classify` +
 * `resolve`). A text that reads as a name also matches a part of an item code ("nal-0"), so
 * a half-typed code still finds its items; exact matches come first. Empty input gives none.
 */
export function suggestItems<
  T extends Identifiable & {
    readonly nameAr: string
    readonly nameEn?: string | undefined
    readonly page?: number | undefined
  },
>(items: readonly T[], text: string, limit: number = SUGGESTION_LIMIT): T[] {
  const query = normalizeDigits(text.trim())
  if (query === '' || limit <= 0) return []
  const cls = classify(query)
  const matched = resolve(items, cls)
  const needle = query.toLowerCase()
  const byPartialCode =
    cls.kind === 'name' ? items.filter((i) => i.code.toLowerCase().includes(needle)) : []
  const extra = byPartialCode.filter((i) => !matched.includes(i))
  return [...matched, ...extra].slice(0, limit)
}
