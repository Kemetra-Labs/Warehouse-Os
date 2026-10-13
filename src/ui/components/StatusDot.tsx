import { useState } from 'react'
import styles from './StatusDot.module.css'

export type DotState = 'match' | 'miss' | 'warn'

const LABELS: Readonly<Record<DotState, string>> = {
  match: 'مطابق',
  miss: 'ناقص أو زائد',
  warn: 'يحتاج انتباه',
}

const GLYPHS: Readonly<Record<DotState, string>> = {
  match: 'M4.5 9.5l3 2.8L13.5 6', // tick
  miss: 'M5.5 5.5l7 7M12.5 5.5l-7 7', // cross
  warn: 'M9 4.5v5.5M9 13v.5', // exclamation
}

export interface StatusDotProps {
  readonly state: DotState
  /** Overrides the default Arabic aria-label. */
  readonly label?: string
}

/**
 * True once the dot has turned into a match while it was on screen, and for as long as it stays
 * one. A dot that is a match from the start (a screen opened on a finished count) shows the whole
 * tick at once; a re-render never restarts the drawing, only a change of state does.
 */
function useDrawsTick(state: DotState): boolean {
  const [seen, setSeen] = useState(state)
  const [draws, setDraws] = useState(false)
  if (seen !== state) {
    setSeen(state)
    setDraws(state === 'match')
  }
  return draws
}

/** Colour plus glyph, never colour alone. */
export function StatusDot({ state, label }: StatusDotProps) {
  const draws = useDrawsTick(state)
  return (
    <span
      className={`${styles.dot} ${styles[state]}`}
      role="img"
      aria-label={label ?? LABELS[state]}
    >
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d={GLYPHS[state]} className={state === 'match' && draws ? styles.draw : undefined} />
      </svg>
    </span>
  )
}
