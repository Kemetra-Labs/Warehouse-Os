import { Link } from 'react-router'
import { formatDay } from '../../domain/fieldInput'
import { describeDocument, type HistoryEntry } from '../../domain/itemHistory'
import { formatMoney } from '../../domain/money'
import { MOVEMENT_TYPES } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import styles from './ItemHistory.module.css'

const anchorOf = (id: string): string => `mv-${id}`

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n))

function Document({ entry }: { readonly entry: HistoryEntry }) {
  const doc = describeDocument(entry.movement)
  if (doc.label === '') return null
  return doc.link === null ? <span>{doc.label}</span> : <Link to={doc.link}>{doc.label}</Link>
}

function ReversalNote({ entry }: { readonly entry: HistoryEntry }) {
  if (entry.reversedBy !== null) {
    return (
      <span className={styles.badge}>
        اتلغت · <a href={`#${anchorOf(entry.reversedBy)}`}>الحركة العكسية</a>
      </span>
    )
  }
  if (entry.reverses !== null) {
    return (
      <span className={styles.badge}>
        عكس حركة · <a href={`#${anchorOf(entry.reverses)}`}>الحركة الأصلية</a>
      </span>
    )
  }
  return null
}

function Entry({ entry }: { readonly entry: HistoryEntry }) {
  const m = entry.movement
  const struck = entry.reversedBy !== null
  const adjust = m.type === MOVEMENT_TYPES.ADJUST
  const line = struck ? styles.line : ''
  return (
    <li
      id={anchorOf(entry.id)}
      className={`${styles.entry} ${struck ? styles.struck : ''}`}
      data-testid="history-row"
      data-struck={struck ? 'true' : 'false'}
      data-type={m.type}
    >
      <div className={styles.top}>
        <span className={`${styles.date} ${line}`}>{formatDay(m.businessDate)}</span>
        <span className={`${styles.type} ${line}`}>{m.type}</span>
        <span className={`${styles.qty} ${line}`} aria-label={`الكمية ${signed(entry.effect)}`}>
          <Bdi>{signed(entry.effect)}</Bdi>
        </span>
        <span className={styles.after} aria-label={`الرصيد بعدها ${entry.balanceAfter}`}>
          <Bdi>{entry.balanceAfter}</Bdi>
        </span>
      </div>
      <div className={`${styles.meta} ${line}`}>
        <span data-testid="history-price">
          السعر وقتها <Bdi>{formatMoney(m.priceMinor)}</Bdi>
        </span>
        <Document entry={entry} />
        {m.batchNo ? (
          <span>
            تشغيلة <Bdi>{m.batchNo}</Bdi>
          </span>
        ) : null}
        {m.substituteFor ? (
          <span>
            بديل عن <Bdi>{m.substituteFor.itemCode}</Bdi>
          </span>
        ) : null}
      </div>
      <ReversalNote entry={entry} />
      {m.reason && (adjust || m.type === MOVEMENT_TYPES.ISSUE) ? (
        <p className={styles.reason}>السبب: {m.reason}</p>
      ) : null}
    </li>
  )
}

export interface ItemHistoryProps {
  /** Oldest first, as `buildHistory` returns them. The newest is shown on top. */
  readonly entries: readonly HistoryEntry[]
}

/**
 * Every movement of the item, newest first, each with the balance after it and the price it was
 * posted at. A cancelled movement is struck through, marked, and linked to its reversal; the
 * reversal links back. Posted movements never change, so nothing here is editable.
 */
export function ItemHistory({ entries }: ItemHistoryProps) {
  if (entries.length === 0) {
    return <p className={styles.empty}>مفيش حركات للصنف ده لسه.</p>
  }
  return (
    <ol className={styles.list} aria-label="حركات الصنف">
      {[...entries].reverse().map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}
