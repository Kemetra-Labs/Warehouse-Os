import { classify, normalizeDigits, normalizeGtin, resolve } from './search'
import { ITEM_CODE_PATTERN, STATUS_LABELS, type Item } from './types'

/** The stored form of an item before the server stamps `updatedAt`. */
export type StoredItem = Omit<Item, 'updatedAt'>

export const GTIN_PATTERN = /^(\d{8}|\d{13})$/
export const AUTHORITY_CODE_PATTERN = /^\d{8,9}$/
export const DEFAULT_UNIT = 'قطعة'
const FALLBACK_PREFIX = 'ITM'

/** What the add/edit form holds. Numbers are null while the field is empty or not a number. */
export interface ItemDraft {
  readonly code: string
  readonly page: number | null
  readonly category: string
  readonly nameAr: string
  readonly nameEn: string
  readonly material: string
  readonly size: string
  readonly unit: string
  readonly supplier: string
  readonly gtins: readonly string[]
  /** Empty means none. */
  readonly authorityCode: string
  readonly priceMinor: number | null
  readonly reorderManual: number | null
  readonly active: boolean
}

export type ItemField =
  | 'code'
  | 'page'
  | 'category'
  | 'nameAr'
  | 'gtins'
  | 'authorityCode'
  | 'priceMinor'
  | 'reorderManual'

export interface ItemIssues {
  /** Block saving. One Arabic message per field. */
  readonly errors: Readonly<Partial<Record<ItemField, string>>>
  /** Worth a look, but saving is allowed. */
  readonly warnings: readonly string[]
}

type CodePart = { readonly prefix: string; readonly n: number }

function codeParts(code: string): CodePart | null {
  const m = /^([A-Z]{3})-(\d{2,3})$/.exec(code)
  return m ? { prefix: m[1] ?? '', n: Number(m[2]) } : null
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function prefixesOf(items: readonly Item[]): string[] {
  return items.flatMap((i) => codeParts(i.code)?.prefix ?? [])
}

/** The next code on the category's usual prefix (`SCR-07` after `SCR-06`); never a used one. */
export function suggestItemCode(items: readonly Item[], category: string): string {
  const inCategory = items.filter((i) => i.category === category)
  const prefix =
    mostCommon(prefixesOf(inCategory)) ?? mostCommon(prefixesOf(items)) ?? FALLBACK_PREFIX
  const highest = items.reduce((max, i) => {
    const parts = codeParts(i.code)
    return parts?.prefix === prefix ? Math.max(max, parts.n) : max
  }, 0)
  const used = new Set(items.map((i) => i.code))
  for (let n = highest + 1; ; n += 1) {
    const candidate = `${prefix}-${String(n).padStart(2, '0')}`
    if (!used.has(candidate)) return candidate
  }
}

export function suggestPage(items: readonly Item[]): number {
  return items.reduce((max, i) => Math.max(max, i.page), 0) + 1
}

/** A new item's form: the suggested code and page, everything else empty. */
export function emptyDraft(items: readonly Item[], category = ''): ItemDraft {
  return {
    code: suggestItemCode(items, category),
    page: suggestPage(items),
    category,
    nameAr: '',
    nameEn: '',
    material: '',
    size: '',
    unit: DEFAULT_UNIT,
    supplier: '',
    gtins: [],
    authorityCode: '',
    priceMinor: 0,
    reorderManual: null,
    active: true,
  }
}

export function draftFromItem(item: Item): ItemDraft {
  return {
    code: item.code,
    page: item.page,
    category: item.category,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    material: item.material,
    size: item.size,
    unit: item.unit,
    supplier: item.supplier,
    gtins: item.gtins,
    authorityCode: item.authorityCode ?? '',
    priceMinor: item.priceMinor,
    reorderManual: item.reorderManual,
    active: item.active,
  }
}

const isWhole = (n: number | null, min: number): n is number =>
  n !== null && Number.isInteger(n) && n >= min

function codeError(draft: ItemDraft, items: readonly Item[], original: Item | null): string | null {
  if (original) return null // The code is the item's id: it is locked when editing.
  const code = draft.code.trim().toUpperCase()
  if (!ITEM_CODE_PATTERN.test(code))
    return 'الكود لازم يكون 3 حروف إنجليزي وشرطة ورقمين أو تلاتة، زي SCR-07'
  return items.some((i) => i.code === code) ? 'الكود ده مستخدم قبل كده' : null
}

function pageError(draft: ItemDraft, items: readonly Item[], original: Item | null): string | null {
  if (!isWhole(draft.page, 1)) return 'رقم الصفحة لازم يكون رقم من 1 فوق'
  // Existing data may already share a page: an unchanged page is never blocked.
  if (original && original.page === draft.page) return null
  const clash = items.find((i) => i.page === draft.page && i.code !== original?.code)
  return clash ? `رقم الصفحة ده عند صنف تاني (${clash.code})` : null
}

function authorityError(
  draft: ItemDraft,
  items: readonly Item[],
  original: Item | null,
): string | null {
  const value = draft.authorityCode.trim()
  if (value === '') return null
  if (!AUTHORITY_CODE_PATTERN.test(value)) return 'كود الهيئة لازم يكون 8 أو 9 أرقام'
  if (original && original.authorityCode === value) return null
  const holder = items.find((i) => i.authorityCode === value && i.code !== original?.code)
  return holder ? `كود الهيئة ده عند صنف تاني (${holder.code})` : null
}

function gtinError(gtins: readonly string[]): string | null {
  const list = gtins.map((g) => g.trim()).filter((g) => g !== '')
  const bad = list.find((g) => !GTIN_PATTERN.test(g))
  if (bad !== undefined) return `الباركود ${bad} لازم يكون 8 أو 13 رقم`
  const repeated = list.find((g, i) => list.indexOf(g) !== i)
  return repeated === undefined ? null : `الباركود ${repeated} مكرر في نفس الصنف`
}

/** The GS1 mod-10 check: the last digit of an EAN-8 or EAN-13 must match the others. */
export function hasValidCheckDigit(gtin: string): boolean {
  const digits = [...gtin].map(Number)
  const check = digits.pop()
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return check === (10 - (sum % 10)) % 10
}

function gtinWarnings(draft: ItemDraft, items: readonly Item[], original: Item | null): string[] {
  const known = new Set(original?.gtins ?? [])
  const out: string[] = []
  for (const gtin of draft.gtins.map((g) => g.trim())) {
    if (gtin === '' || known.has(gtin)) continue
    // A box's barcode always passes the check, so a typed one that fails has a typo in it and
    // would never match a scan. A warning, not an error: the store's own labels may be odd.
    if (GTIN_PATTERN.test(gtin) && !hasValidCheckDigit(gtin)) {
      out.push(`الباركود ${gtin} رقمه الأخير مش مظبوط، غالبًا فيه رقم غلط. راجعه على العلبة`)
    }
    const holder = items.find((i) => i.code !== original?.code && i.gtins.includes(gtin))
    if (holder) out.push(`الباركود ${gtin} متسجل قبل كده على الصنف ${holder.code}`)
  }
  return out
}

/**
 * Checks the form against every other item. `original` is the item being edited, or null for a
 * new one. A value the item already had is never blocked, so old data cannot lock an edit.
 */
export function validateItemDraft(
  draft: ItemDraft,
  items: readonly Item[],
  original: Item | null,
): ItemIssues {
  const found: [ItemField, string | null][] = [
    ['code', codeError(draft, items, original)],
    ['page', pageError(draft, items, original)],
    ['category', draft.category.trim() === '' ? 'اكتب الفئة' : null],
    ['nameAr', draft.nameAr.trim() === '' ? 'اكتب اسم الصنف بالعربي' : null],
    ['authorityCode', authorityError(draft, items, original)],
    ['gtins', gtinError(draft.gtins)],
    ['priceMinor', isWhole(draft.priceMinor, 0) ? null : 'السعر لازم يكون صفر أو أكتر'],
    [
      'reorderManual',
      draft.reorderManual === null || isWhole(draft.reorderManual, 0)
        ? null
        : 'حد الطلب لازم يكون رقم صحيح أو سيبه فاضي',
    ],
  ]
  const errors: Partial<Record<ItemField, string>> = {}
  for (const [field, message] of found) if (message !== null) errors[field] = message
  return { errors, warnings: gtinWarnings(draft, items, original) }
}

/** The document to store. Throws on a draft that has no page or price: validate first. */
export function buildItem(draft: ItemDraft): StoredItem {
  if (!isWhole(draft.page, 1) || !isWhole(draft.priceMinor, 0)) {
    throw new Error('buildItem needs a valid page and price')
  }
  const authority = draft.authorityCode.trim()
  return {
    code: draft.code.trim().toUpperCase(),
    page: draft.page,
    category: draft.category.trim(),
    nameAr: draft.nameAr.trim(),
    nameEn: draft.nameEn.trim(),
    material: draft.material.trim(),
    size: draft.size.trim(),
    unit: draft.unit.trim() === '' ? DEFAULT_UNIT : draft.unit.trim(),
    supplier: draft.supplier.trim(),
    gtins: draft.gtins.map((g) => g.trim()).filter((g) => g !== ''),
    authorityCode: authority === '' ? null : authority,
    priceMinor: draft.priceMinor,
    reorderManual: draft.reorderManual,
    active: draft.active,
  }
}

/** An edit changes the item document only, and never its code (the code is the id). */
export function applyItemEdit(original: Item, draft: ItemDraft): StoredItem {
  return { ...buildItem(draft), code: original.code }
}

const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((v, i) => v === b[i])
    : a === b

/**
 * The fields an edit actually changed, and nothing else. Saving only these keeps what the form
 * never touched, such as a newer price or a GTIN that a receipt on another device wrote while
 * the form was open. The code is the id and never part of the patch.
 */
export function itemEditPatch(original: Item, draft: ItemDraft): Partial<StoredItem> {
  const next = applyItemEdit(original, draft)
  const changed = (Object.keys(next) as (keyof StoredItem)[]).filter(
    (key) => key !== 'code' && !sameValue(next[key], original[key]),
  )
  return Object.fromEntries(changed.map((key) => [key, next[key]])) as Partial<StoredItem>
}

/** A typed or scanned GTIN as stored: Western digits, 12 or 14 digits folded to 13. */
export function cleanGtinInput(text: string): string {
  return normalizeGtin(normalizeDigits(text).replace(/\s+/g, ''))
}

export function categoriesOf(items: readonly Pick<Item, 'category'>[]): string[] {
  return [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, 'ar'))
}

// ---------- the item list ----------

export type ItemListFilter = 'all' | 'reorder' | 'out' | 'pending' | 'inactive'

export interface ListQuery {
  readonly filter: ItemListFilter
  /** Null means every category. */
  readonly category: string | null
  readonly text: string
}

export interface ListRow {
  readonly item: Item
  readonly status: string
  readonly pendingSettlement: boolean
}

function matchesFilter(row: ListRow, filter: ItemListFilter): boolean {
  if (filter === 'inactive') return !row.item.active
  if (!row.item.active) return false
  if (filter === 'reorder') return row.status === STATUS_LABELS.REORDER
  if (filter === 'out') return row.status === STATUS_LABELS.OUT
  if (filter === 'pending') return row.pendingSettlement
  return true
}

/** Codes that match what was typed: by page, code, GTIN, authority code, or part of a name. */
function textMatches(items: readonly Item[], text: string): ReadonlySet<string> {
  const query = text.trim()
  const hits = new Set(resolve(items, classify(query)).map((i) => i.code))
  const upper = normalizeDigits(query).toUpperCase()
  // A bare number is a page, GTIN or authority code; part of a code needs a letter or a dash.
  if (/[A-Z-]/.test(upper)) for (const i of items) if (i.code.includes(upper)) hits.add(i.code)
  return hits
}

/** The rows to show: active ones by page, narrowed by filter, category and text. */
export function filterItems<T extends ListRow>(rows: readonly T[], query: ListQuery): T[] {
  const byText =
    query.text.trim() === ''
      ? null
      : textMatches(
          rows.map((r) => r.item),
          query.text,
        )
  return rows
    .filter(
      (r) =>
        matchesFilter(r, query.filter) &&
        (query.category === null || r.item.category === query.category) &&
        (byText === null || byText.has(r.item.code)),
    )
    .sort((a, b) => a.item.page - b.item.page || a.item.code.localeCompare(b.item.code))
}

export type FilterCounts = Readonly<Record<ItemListFilter, number>>

export function filterCounts(rows: readonly ListRow[]): FilterCounts {
  const count = (filter: ItemListFilter): number =>
    rows.filter((r) => matchesFilter(r, filter)).length
  return {
    all: count('all'),
    reorder: count('reorder'),
    out: count('out'),
    pending: count('pending'),
    inactive: count('inactive'),
  }
}
