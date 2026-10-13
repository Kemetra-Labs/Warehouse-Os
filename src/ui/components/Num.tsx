import { useState, type ReactNode } from 'react'
import styles from './Num.module.css'

export interface NumProps {
  /** The number (or text) on show. A change, not the first render, plays the motion. */
  readonly value: number | string
  /** A count that disagrees shakes once when it changes; every other change cross-fades. */
  readonly miss?: boolean
  readonly children?: ReactNode
}

/**
 * A displayed quantity. When the value changes it cross-fades (120 ms), or, for a mismatch,
 * shakes 4 px twice (240 ms). Never used around an input: the keyed span would remount it.
 */
export function Num({ value, miss = false, children }: NumProps) {
  const [seen, setSeen] = useState({ value, changes: 0 })
  // Adjust state during render: count each change so the keyed span below remounts and replays.
  if (seen.value !== value) setSeen({ value, changes: seen.changes + 1 })
  const motion = seen.changes === 0 ? '' : miss ? styles.shake : styles.fade
  return (
    <span key={seen.changes} className={`${styles.num} ${motion}`}>
      {children ?? value}
    </span>
  )
}
