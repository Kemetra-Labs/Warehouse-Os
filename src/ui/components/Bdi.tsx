import type { ReactNode } from 'react'
import styles from './Bdi.module.css'

/** LTR isolate for codes, GTINs, batch numbers and sizes inside RTL text. */
export function Bdi({ children }: { readonly children: ReactNode }) {
  return (
    <bdi dir="ltr" className={styles.bdi}>
      {children}
    </bdi>
  )
}
