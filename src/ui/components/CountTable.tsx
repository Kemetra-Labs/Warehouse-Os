import type { ReactNode } from 'react'
import styles from './CountTable.module.css'
import { StatusDot, type DotState } from './StatusDot'

export interface CountRow {
  readonly key: string
  readonly name: ReactNode
  /** Secondary line (page, balance, "بديل عن ..."). */
  readonly sub?: ReactNode
  /** Requested quantity; null for a substitute line with no request. */
  readonly requested: number | null
  readonly delivered: number
  /** Overrides the computed state (a substitute line is a match by definition). */
  readonly state?: DotState
}

export interface CountTableProps {
  readonly rows: readonly CountRow[]
  readonly caption: string
}

export function rowState(row: CountRow): DotState {
  if (row.state) return row.state
  if (row.requested === null) return 'match'
  return row.requested === row.delivered ? 'match' : 'miss'
}

/** Requested vs delivered side by side; a mismatch turns red with a glyph. */
export function CountTable({ rows, caption }: CountTableProps) {
  return (
    <table className={styles.table}>
      <caption className={styles.caption}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">صنف</th>
          <th scope="col" className={styles.num}>
            مطلوب
          </th>
          <th scope="col" className={styles.num}>
            اتسلّم
          </th>
          <th scope="col" className={styles.num}>
            <span className={styles.caption}>الحالة</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const state = rowState(row)
          return (
            <tr key={row.key}>
              <td>
                {row.name}
                {row.sub ? <span className={styles.sub}>{row.sub}</span> : null}
              </td>
              <td className={`${styles.num} ${styles.count}`}>{row.requested ?? '—'}</td>
              <td
                className={`${styles.num} ${styles.count} ${state === 'miss' ? styles.miss : ''}`}
              >
                {row.delivered}
              </td>
              <td className={styles.num}>
                <StatusDot state={state} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
