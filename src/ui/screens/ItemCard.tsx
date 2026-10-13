import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { toMillis } from '../../data/convert'
import type { ItemRow } from '../../data/deriveLedger'
import { useData } from '../../data/DataProvider'
import { useLedger } from '../../data/useLedger'
import { cairoToday, expiryEndDay } from '../../domain/dates'
import { formatExpiry } from '../../domain/fieldInput'
import { buildHistory, type HistoryEntry } from '../../domain/itemHistory'
import type { BatchBalance } from '../../domain/ledger'
import { formatMoney } from '../../domain/money'
import { STATUS_LABELS } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { ItemHistory } from './ItemHistory'
import styles from './ItemCard.module.css'

const NONE = '—'

function Datum({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={styles.datum}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const orNone = (text: string): ReactNode => (text.trim() === '' ? NONE : text)

function reorderNote(row: ItemRow): string {
  if (row.item.reorderManual !== null && row.item.reorderManual > 0) return 'يدوي'
  return row.issued > 0 ? 'محسوب من الصرف' : 'الحد الافتراضي'
}

type Tone = 'short' | 'attn' | 'ok'

/** The balance tile's state: out or below zero is red, reorder is amber, anything else is calm. */
function toneOf(row: ItemRow): Tone {
  if (row.balance <= 0 || row.pendingSettlement) return 'short'
  return row.status === STATUS_LABELS.REORDER ? 'attn' : 'ok'
}

const GLYPHS: Readonly<Record<Tone, string>> = {
  short: 'M4 4l8 8M12 4l-8 8',
  attn: 'M8 3v6M8 12.5v.5',
  ok: 'M3.5 8.5l3 3 6-7',
}

function MasterData({ row }: { readonly row: ItemRow }) {
  const { item } = row
  return (
    <dl className={styles.data} aria-label="بيانات الصنف">
      <Datum label="الفئة">{item.category}</Datum>
      <Datum label="الخامة">{orNone(item.material)}</Datum>
      <Datum label="المقاس">{item.size.trim() === '' ? NONE : <Bdi>{item.size}</Bdi>}</Datum>
      <Datum label="الوحدة">{item.unit}</Datum>
      <Datum label="الشركة الموردة">{orNone(item.supplier)}</Datum>
      <Datum label="السعر الحالي">
        <span data-testid="item-price">
          <Bdi>{formatMoney(item.priceMinor)}</Bdi>
        </span>
      </Datum>
      <Datum label="كود الهيئة">
        {item.authorityCode === null ? NONE : <Bdi>{item.authorityCode}</Bdi>}
      </Datum>
      <Datum label="الباركود">
        {item.gtins.length === 0
          ? NONE
          : item.gtins.map((g) => (
              <span key={g} className={styles.gtin}>
                <Bdi>{g}</Bdi>
              </span>
            ))}
      </Datum>
    </dl>
  )
}

interface BatchesProps {
  readonly batches: readonly BatchBalance[]
  readonly today: string
}

function Batches({ batches, today }: BatchesProps) {
  const held = batches.filter((b) => b.balance !== 0)
  if (held.length === 0) return <p className={styles.empty}>مفيش تشغيلات برصيد.</p>
  return (
    <ul className={styles.batches} aria-label="التشغيلات">
      {held.map((b) => {
        const end = b.expiry === null ? null : expiryEndDay(b.expiry)
        const expired = end !== null && end < today
        return (
          <li key={`${b.batchNo ?? ''}|${b.expiry ?? ''}`} className={styles.batch}>
            <span className={styles.batchName}>
              {b.batchNo === null ? b.label : <Bdi>{b.batchNo}</Bdi>}
            </span>
            <span className={expired ? styles.expired : styles.expiry}>
              {b.expiry === null ? 'من غير صلاحية' : `الصلاحية ${formatExpiry(b.expiry)}`}
              {expired ? ' · منتهية' : ''}
            </span>
            <b className={styles.batchBalance}>
              <Bdi>{b.balance}</Bdi>
            </b>
          </li>
        )
      })}
    </ul>
  )
}

export interface ItemCardViewProps {
  readonly row: ItemRow
  readonly batches: readonly BatchBalance[]
  readonly history: readonly HistoryEntry[]
  /** Today in Cairo, `YYYY-MM-DD`: batches past it read "منتهية". */
  readonly today: string
}

/** The item card: data, balance and status, batches with expiry, and the full movement history. */
export function ItemCardView({ row, batches, history, today }: ItemCardViewProps) {
  const { item } = row
  const tone = toneOf(row)
  return (
    <article className={styles.card} aria-labelledby="item-name">
      <nav className={styles.top} aria-label="تنقل">
        <Link to="/items">الأصناف</Link>
      </nav>

      <header className={styles.head}>
        <h1 id="item-name" className={styles.name}>
          {item.nameAr}
        </h1>
        {item.nameEn === '' ? null : (
          <p className={styles.english} dir="ltr">
            {item.nameEn}
          </p>
        )}
        <p className={styles.sub}>
          ص <Bdi>{item.page}</Bdi> · <Bdi>{item.code}</Bdi>
          {item.active ? '' : ' · موقوف'}
        </p>
      </header>

      <section className={`${styles.balance} ${styles[tone]}`} aria-label="الرصيد والحالة">
        <div>
          <span className={styles.label}>الرصيد</span>
          <b className={styles.number} data-testid="item-balance">
            <Bdi>{row.balance}</Bdi>
          </b>
        </div>
        <div className={styles.state}>
          <b>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d={GLYPHS[tone]} />
            </svg>
            {row.status}
          </b>
          {row.pendingSettlement ? <span>تسوية معلّقة</span> : null}
          {row.pendingSettlement ? (
            <Link to={`/items/${item.code}/adjust`} className={styles.settle}>
              سوّي الرصيد
            </Link>
          ) : null}
          <span>
            حد الطلب <Bdi>{row.reorder}</Bdi> ({reorderNote(row)})
          </span>
        </div>
      </section>

      <MasterData row={row} />

      <section aria-labelledby="batches-title" className={styles.section}>
        <h2 id="batches-title" className={styles.h2}>
          التشغيلات
        </h2>
        <Batches batches={batches} today={today} />
      </section>

      <section aria-labelledby="history-title" className={styles.section}>
        <h2 id="history-title" className={styles.h2}>
          الحركات
        </h2>
        <ItemHistory entries={history} />
      </section>

      <div className={styles.actions}>
        <Link to={`/items/${item.code}/adjust`} className={`${styles.action} ${styles.primary}`}>
          مرتجع / تسوية
        </Link>
        <Link to={`/items/${item.code}/edit`} className={styles.action}>
          تعديل
        </Link>
      </div>
    </article>
  )
}

/**
 * The route `/items/:code`. Opening the card counts as seeing the item, so a "changed since
 * seen" highlight clears here (FR-072), and again if another device posts while it stays open.
 */
export function ItemCard() {
  const { code = '' } = useParams()
  const ledger = useLedger()
  const { movements } = useData()
  const row = ledger.byCode.get(code)
  const found = row !== undefined
  const lastPostedAt = row?.lastPostedAt ?? null
  const { markItemSeen, batchBalancesFor } = ledger

  useEffect(() => {
    if (found) markItemSeen(code)
  }, [code, found, lastPostedAt, markItemSeen])

  const history = useMemo(() => buildHistory(movements, code, toMillis), [movements, code])
  const batches = useMemo(() => batchBalancesFor(code), [batchBalancesFor, code])

  if (!row) {
    return (
      <section className={styles.card}>
        <h1 className={styles.name}>الصنف ده مش موجود</h1>
        <p className={styles.empty}>
          مفيش صنف بالكود <Bdi>{code}</Bdi>. <Link to="/items">ارجع لقائمة الأصناف</Link>
        </p>
      </section>
    )
  }
  return <ItemCardView row={row} batches={batches} history={history} today={cairoToday()} />
}
