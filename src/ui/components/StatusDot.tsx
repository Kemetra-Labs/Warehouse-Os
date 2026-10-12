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

/** Colour plus glyph, never colour alone. */
export function StatusDot({ state, label }: StatusDotProps) {
  return (
    <span
      className={`${styles.dot} ${styles[state]}`}
      role="img"
      aria-label={label ?? LABELS[state]}
    >
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d={GLYPHS[state]} className={state === 'match' ? styles.tick : undefined} />
      </svg>
    </span>
  )
}
