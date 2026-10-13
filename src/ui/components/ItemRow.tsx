import { useEffect, useState } from 'react'
import type { ItemRow as LedgerRow } from '../../data/deriveLedger'
import { STATUS_LABELS } from '../../domain/types'
import { Bdi } from './Bdi'
import { Num } from './Num'
import styles from './ItemRow.module.css'

export interface ItemRowProps {
  readonly row: LedgerRow
  /** Opening the item clears its "changed since seen" highlight (FR-072). */
  readonly onOpen?: (itemCode: string) => void
}

type Mark = 'out' | 'reorder' | 'ok'

/** The state as a shape: a solid red square (out or below zero), a solid amber one (reorder), a hollow ring (fine). */
function markOf(row: LedgerRow): Mark {
  if (row.balance <= 0 || row.pendingSettlement) return 'out'
  return row.status === STATUS_LABELS.REORDER ? 'reorder' : 'ok'
}

/** Out is a red square with a cross cut into it, so it never reads as the amber square by hue alone. */
function ItemMark({ mark }: { readonly mark: Mark }) {
  return (
    <span className={`${styles.mark} ${styles[mark]}`} aria-hidden="true">
      {mark === 'out' ? (
        <svg viewBox="0 0 14 14" focusable="false">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
        </svg>
      ) : null}
    </span>
  )
}

const CHANGED_LABEL = 'اتغيّر من جهاز تاني من آخر مرة فتحته'
/** The highlight fades out over --dur-row-out (120 ms) once the item is opened; this outlasts it. */
const LEAVE_MS = 200

/** True for a moment after the "changed since seen" mark goes away, so it can fade out. */
function useLeaving(changed: boolean): boolean {
  const [was, setWas] = useState(changed)
  const [leaving, setLeaving] = useState(false)
  // Adjust state during render: the mark just went away, so start the fade-out.
  if (was !== changed) {
    setWas(changed)
    setLeaving(was && !changed)
  }
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), LEAVE_MS)
    return () => clearTimeout(t)
  }, [leaving])
  return leaving
}

/**
 * One item in a list: balance first, then name and status. A balance below zero reads
 * "تسوية معلّقة". A change that arrived from another device is a faint tint plus a
 * marker-blue dot until the item is opened; the colour never carries the meaning alone.
 */
export function ItemRow({ row, onOpen }: ItemRowProps) {
  const { item, balance, status, pendingSettlement, changedSinceSeen } = row
  const leaving = useLeaving(changedSinceSeen)
  const className = [
    styles.row,
    changedSinceSeen ? styles.changed : '',
    leaving ? styles.leaving : '',
    pendingSettlement ? styles.negative : '',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {changedSinceSeen ? (
        <span className={styles.dot} role="img" aria-label={CHANGED_LABEL} />
      ) : leaving ? (
        <span className={styles.dot} aria-hidden="true" />
      ) : null}
      <ItemMark mark={markOf(row)} />
      <span className={styles.main}>
        <span className={styles.name}>{item.nameAr}</span>
        <span className={styles.meta}>
          ص <Bdi>{item.page}</Bdi> · <Bdi>{item.code}</Bdi> · {status}
        </span>
        {pendingSettlement ? <span className={styles.flag}>تسوية معلّقة</span> : null}
      </span>
      <span className={styles.balance} aria-label={`الرصيد ${balance}`}>
        <Bdi>
          <Num value={balance} />
        </Bdi>
      </span>
    </>
  )
  const data = {
    'data-changed': changedSinceSeen ? 'true' : 'false',
    'data-negative': pendingSettlement ? 'true' : 'false',
  }
  if (!onOpen)
    return (
      <div className={className} {...data}>
        {content}
      </div>
    )
  return (
    <button type="button" className={className} {...data} onClick={() => onOpen(item.code)}>
      {content}
    </button>
  )
}
