import { syncLabel, type SyncState } from '../../data/sync'
import styles from './SyncPill.module.css'

export interface SyncPillProps {
  readonly state: SyncState
  /** Tap handler for the failed state (opens the unsent documents screen). */
  readonly onRetry?: () => void
}

/** Each state has its own glyph, so the colour is never the only signal. */
const GLYPHS: Readonly<Record<SyncState['kind'], { dashed: boolean; mark: string }>> = {
  synced: { dashed: false, mark: 'M5 8.2l2 2 4-4.4' },
  pending: { dashed: true, mark: '' },
  failed: { dashed: false, mark: 'M8 4.5v4.2M8 11.3v.4' },
}

function Glyph({ kind }: { readonly kind: SyncState['kind'] }) {
  const { dashed, mark } = GLYPHS[kind]
  return (
    <svg viewBox="0 0 16 16" className={styles.glyph} aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" strokeDasharray={dashed ? '3 2.5' : undefined} />
      {mark ? <path d={mark} /> : null}
    </svg>
  )
}

/**
 * Station-bar pill: a solid ring with a tick when synced, a dashed ring while writes wait, a ring
 * with a mark (tappable) when something failed to send. Green, amber and red inks on the ground.
 */
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
        <Glyph kind="failed" />
        <span key={label} className={styles.label}>
          {label}
        </span>
      </button>
    )
  }
  return (
    <span className={className} role="status">
      <Glyph kind={state.kind} />
      <span key={label} className={styles.label}>
        {label}
      </span>
    </span>
  )
}
