import { syncLabel, type SyncState } from '../../data/sync'
import styles from './SyncPill.module.css'

export interface SyncPillProps {
  readonly state: SyncState
  /** Tap handler for the failed state (opens the unsent documents screen). */
  readonly onRetry?: () => void
}

/** Header pill: dashed while pending, solid when synced, red dashed (tappable) when failed. */
export function SyncPill({ state, onRetry }: SyncPillProps) {
  const label = syncLabel(state)
  const className = `${styles.pill} ${styles[state.kind]}`

  if (state.kind === 'failed') {
    return (
      <button
        type="button"
        className={className}
        onClick={onRetry}
        aria-label={`${label}، اضغط لإعادة المحاولة`}
      >
        <svg viewBox="0 0 18 18" className={styles.glyph} aria-hidden="true" focusable="false">
          <path d="M9 4.5v5.5M9 13v.5" />
        </svg>
        <span key={label} className={styles.label}>
          {label}
        </span>
      </button>
    )
  }
  return (
    <span className={className} role="status">
      <span key={label} className={styles.label}>
        {label}
      </span>
    </span>
  )
}
