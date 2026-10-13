import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ItemRow as LedgerRow } from '../../data/deriveLedger'
import { useLedger } from '../../data/useLedger'
import {
  categoriesOf,
  filterCounts,
  filterItems,
  type ItemListFilter,
  type ListQuery,
} from '../../domain/items'
import { ItemRow } from '../components/ItemRow'
import { SearchBox } from '../components/SearchBox'
import styles from './Items.module.css'

const FILTERS: readonly { readonly id: ItemListFilter; readonly label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'reorder', label: 'تحتاج طلب' },
  { id: 'out', label: 'نافد' },
  { id: 'pending', label: 'تسويات معلّقة' },
  { id: 'inactive', label: 'موقوفة' },
]

const FILTER_IDS = new Set<string>(FILTERS.map((f) => f.id))

/** The two filters that are states: a solid tile of their colour when there are some, hollow at zero. */
const FILTER_TONES: Readonly<Partial<Record<ItemListFilter, 'short' | 'attn'>>> = {
  out: 'short',
  reorder: 'attn',
}

export interface ItemsViewProps {
  readonly rows: readonly LedgerRow[]
  readonly query: ListQuery
  readonly onQueryChange: (query: ListQuery) => void
  readonly onOpen: (itemCode: string) => void
}

/** The items list: search, the status filters, a category, then one row per item (US4). */
export function ItemsView({ rows, query, onQueryChange, onOpen }: ItemsViewProps) {
  const shown = useMemo(() => filterItems(rows, query), [rows, query])
  const counts = useMemo(() => filterCounts(rows), [rows])
  const categories = useMemo(() => categoriesOf(rows.map((r) => r.item)), [rows])

  return (
    <section className={styles.screen} aria-labelledby="items-title">
      <header className={styles.head}>
        <h1 id="items-title" className={styles.title}>
          الأصناف
        </h1>
        <p className={styles.count} aria-live="polite">
          {rows.length === 0 ? null : `${shown.length} صنف`}
        </p>
      </header>

      <SearchBox
        initialValue={query.text}
        onTextChange={(text) => onQueryChange({ ...query, text })}
        onResolve={() => undefined}
      />

      <div className={styles.chips} role="group" aria-label="فلتر الأصناف">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={styles.chip}
            data-tone={counts[f.id] > 0 ? FILTER_TONES[f.id] : undefined}
            data-zero={counts[f.id] === 0 && FILTER_TONES[f.id] !== undefined ? 'true' : undefined}
            aria-pressed={query.filter === f.id}
            onClick={() => onQueryChange({ ...query, filter: f.id })}
          >
            {f.label} <b>{counts[f.id]}</b>
          </button>
        ))}
      </div>

      <label className={styles.category}>
        <span>الفئة</span>
        <select
          value={query.category ?? ''}
          onChange={(e) => onQueryChange({ ...query, category: e.target.value || null })}
        >
          <option value="">كل الفئات</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {rows.length === 0 ? (
        <p className={styles.note}>
          المخزن لسه فاضي. <Link to="/import">استورد ملف الإكسيل</Link> أو أضف صنف.
        </p>
      ) : null}

      <ul className={styles.list} aria-label="الأصناف">
        {shown.map((r) => (
          <li key={r.item.code}>
            <ItemRow row={r} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {rows.length > 0 && shown.length === 0 ? (
        <p className={styles.note}>مفيش أصناف بالشروط دي.</p>
      ) : null}

      <p className={styles.foot}>
        <Link to="/settings">إعدادات المخزن</Link>
      </p>

      <div className={styles.actions}>
        <Link to="/items/new" className={styles.add}>
          إضافة صنف
        </Link>
      </div>
    </section>
  )
}

function queryFrom(params: URLSearchParams): ListQuery {
  const filter = params.get('filter') ?? 'all'
  return {
    filter: FILTER_IDS.has(filter) ? (filter as ItemListFilter) : 'all',
    category: params.get('cat'),
    text: params.get('q') ?? '',
  }
}

function paramsFrom(query: ListQuery): Record<string, string> {
  return {
    ...(query.filter === 'all' ? {} : { filter: query.filter }),
    ...(query.category === null ? {} : { cat: query.category }),
    ...(query.text === '' ? {} : { q: query.text }),
  }
}

/**
 * The screen. The search, filter and category live in the address, so coming back from an
 * item's card lands on the same list.
 */
export function Items() {
  const { rows } = useLedger()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => queryFrom(params), [params])
  return (
    <ItemsView
      rows={rows}
      query={query}
      onQueryChange={(next) => setParams(paramsFrom(next), { replace: true })}
      onOpen={(code) => void navigate(`/items/${code}`)}
    />
  )
}
