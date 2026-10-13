import type { ReactNode } from 'react'
import styles from './StatusScreen.module.css'

export interface StatusScreenProps {
  readonly title: string
  readonly message: ReactNode
  readonly children?: ReactNode
  /** role="alert" for error screens so assistive tech announces them. */
  readonly alert?: boolean
}

/** The store as a tile (a shelf of boxes), or a red tile with a cross when something is wrong. */
function Mark({ alert }: { readonly alert: boolean }) {
  return (
    <span className={`${styles.mark} ${alert ? styles.markAlert : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={alert ? 'M6 6l12 12M18 6L6 18' : 'M4 6h16M4 12h16M4 18h16M9 6v12M15 6v12'} />
      </svg>
    </span>
  )
}

/** Full-screen message used by config error, sign-in, access denied and load errors. */
export function StatusScreen({ title, message, children, alert = false }: StatusScreenProps) {
  return (
    <main className={styles.screen}>
      <section className={styles.card} role={alert ? 'alert' : undefined}>
        <Mark alert={alert} />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {children}
      </section>
    </main>
  )
}
