import { Fragment, type ReactNode } from 'react'
import styles from './HeaderSummary.module.css'

export interface SummaryItem {
  readonly label: string
  /** What to show; ignored (a dash shows instead) while `empty` is true. */
  readonly value: ReactNode
  readonly empty?: boolean
  /** A field the paper note always has: shown in amber with a dash while it is empty. */
  readonly required?: boolean
}

export interface HeaderSummaryProps {
  readonly items: readonly SummaryItem[]
  /** The edit button's name. */
  readonly editLabel: string
  readonly onEdit: () => void
}

/**
 * The document's header fields as one muted line ("إذن 12 · فاتورة 7 · 13/10"), and one compact
 * button to edit them. It replaces a wall of chips that pushed the scanner down the screen.
 */
export function HeaderSummary({ items, editLabel, onEdit }: HeaderSummaryProps) {
  return (
    <div className={styles.summary}>
      <p className={styles.line}>
        {items.map((item, i) => {
          const empty = item.empty === true
          return (
            <Fragment key={item.label}>
              {i > 0 ? ' · ' : null}
              <span className={empty && item.required === true ? styles.missing : undefined}>
                {item.label} <b>{empty ? '—' : item.value}</b>
              </span>
            </Fragment>
          )
        })}
      </p>
      <button type="button" className={styles.edit} onClick={onEdit}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2.5 13.5l.7-3L10.8 3a1.5 1.5 0 012.1 2.1L5.5 12.8l-3 .7zM9.5 4.3l2.2 2.2" />
        </svg>
        {editLabel}
      </button>
    </div>
  )
}
