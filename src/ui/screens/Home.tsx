import { Link } from 'react-router'
import { useLedger } from '../../data/useLedger'
import { BackupReminder } from '../components/BackupReminder'
import styles from './Home.module.css'
import { DuplicateNumbers } from './DuplicateNumbers'
import { NeedsAttention } from './NeedsAttention'
import { OpenBatches, OpenDrafts } from './OpenDrafts'

type Tone = 'short' | 'attn' | 'count'

interface TileProps {
  readonly value: number
  readonly label: string
  readonly tone: Tone
  /** The glyph on a filled tile. A tile at zero goes hollow with a plain ring instead. */
  readonly glyph: string
}

/**
 * A state tile: filled with its colour when something needs you, hollow at zero. The form (solid
 * or hollow) and the glyph carry the state as well as the hue.
 */
function Tile({ value, label, tone, glyph }: TileProps) {
  const filled = value > 0
  return (
    <div className={`${styles.tile} ${filled ? styles[tone] : styles.hollow}`}>
      <b>{value}</b>
      <span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          {filled ? <path d={glyph} /> : <circle cx="8" cy="8" r="5.5" />}
        </svg>
        {label}
      </span>
    </div>
  )
}

const ICON_RECEIVE = 'M12 4v12M6 10l6 6 6-6M4 20h16'
const ICON_ISSUE = 'M12 20V8M6 14l6-6 6 6M4 4h16'

/** Home: the board (three state tiles), the open document, what needs attention, then the two actions. */
export function Home() {
  const { tally, rows } = useLedger()
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>الرئيسية</h1>
      <section className={styles.tiles} aria-label="ملخص المخزن">
        <Tile value={tally.out} label="نافد" tone="short" glyph="M4 4l8 8M12 4l-8 8" />
        <Tile value={tally.needsReorder} label="تحتاج طلب" tone="attn" glyph="M8 3v6M8 12.5v.5" />
        <Tile
          value={tally.pendingSettlements}
          label="تسويات معلّقة"
          tone="count"
          glyph="M4 6h8M4 10h8"
        />
      </section>
      <DuplicateNumbers />
      <BackupReminder />
      <OpenBatches />
      <OpenDrafts />
      {rows.length === 0 ? (
        <p className={styles.note}>
          المخزن لسه فاضي. <Link to="/import">استورد ملف الإكسيل</Link>
        </p>
      ) : null}
      <NeedsAttention />
      <nav className={styles.actions} aria-label="العمليات">
        <Link to="/receive" className={`${styles.action} ${styles.receive}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={ICON_RECEIVE} />
          </svg>
          استلام طلبية جديدة
        </Link>
        <Link to="/issue" className={styles.action}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={ICON_ISSUE} />
          </svg>
          صرف لمندوب
        </Link>
      </nav>
    </div>
  )
}
