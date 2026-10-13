import type { ItemRow as LedgerRow } from '../../data/deriveLedger'
import { Bdi } from './Bdi'
import styles from './ItemRow.module.css'

export interface ItemRowProps {
  readonly row: LedgerRow
  /** Opening the item clears its "changed since seen" highlight (FR-072). */
  readonly onOpen?: (itemCode: string) => void
}

const CHANGED_LABEL = 'اتغيّر من جهاز تاني من آخر مرة فتحته'

/**
 * One item in a list: balance first, then name and status. A balance below zero reads
 * "تسوية معلّقة". A change that arrived from another device is a faint tint plus a
 * marker-blue dot until the item is opened; the colour never carries the meaning alone.
 */
export function ItemRow({ row, onOpen }: ItemRowProps) {
  const { item, balance, status, pendingSettlement, changedSinceSeen } = row
  const className = [
    styles.row,
    changedSinceSeen ? styles.changed : '',
    pendingSettlement ? styles.negative : '',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {changedSinceSeen ? (
        <span className={styles.dot} role="img" aria-label={CHANGED_LABEL} />
      ) : null}
      <span className={styles.main}>
        <span className={styles.name}>{item.nameAr}</span>
        <span className={styles.meta}>
          ص <Bdi>{item.page}</Bdi> · <Bdi>{item.code}</Bdi> · {status}
        </span>
        {pendingSettlement ? <span className={styles.flag}>تسوية معلّقة</span> : null}
      </span>
      <span className={styles.balance} aria-label={`الرصيد ${balance}`}>
        <Bdi>{balance}</Bdi>
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
