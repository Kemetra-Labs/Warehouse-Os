import type { ReactNode } from 'react'
import styles from './StatusScreen.module.css'

export interface StatusScreenProps {
  readonly title: string
  readonly message: ReactNode
  readonly children?: ReactNode
  /** role="alert" for error screens so assistive tech announces them. */
  readonly alert?: boolean
}

/** Full-screen message used by config error, sign-in, access denied and load errors. */
export function StatusScreen({ title, message, children, alert = false }: StatusScreenProps) {
  return (
    <main className={styles.screen}>
      <section className={styles.card} role={alert ? 'alert' : undefined}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {children}
      </section>
    </main>
  )
}
