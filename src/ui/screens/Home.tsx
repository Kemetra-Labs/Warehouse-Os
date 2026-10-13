import { Link } from 'react-router'
import { useLedger } from '../../data/useLedger'
import { BackupReminder } from '../components/BackupReminder'
import styles from './Home.module.css'
import { DuplicateNumbers } from './DuplicateNumbers'
import { NeedsAttention } from './NeedsAttention'
import { OpenBatches, OpenDrafts } from './OpenDrafts'

interface CellProps {
  readonly value: number
  readonly label: string
  readonly lit?: boolean
}

function Cell({ value, label, lit = false }: CellProps) {
  return (
    <div className={lit ? styles.lit : undefined}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/** Home: the open batch first, then receive and issue, then the three stock tallies. */
export function Home() {
  const { tally, rows } = useLedger()
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>الرئيسية</h1>
      <DuplicateNumbers />
      <BackupReminder />
      <OpenBatches />
      <nav className={styles.actions} aria-label="العمليات">
        <Link to="/receive" className={`${styles.action} ${styles.receive}`}>
          استلام طلبية جديدة
        </Link>
        <Link to="/issue" className={`${styles.action} ${styles.issue}`}>
          صرف لمندوب
        </Link>
      </nav>
      {rows.length === 0 ? (
        <p className={styles.note}>
          المخزن لسه فاضي. <Link to="/import">استورد ملف الإكسيل</Link>
        </p>
      ) : null}
      <section className={styles.tally} aria-label="ملخص المخزن">
        <Cell value={tally.needsReorder} label="تحتاج طلب" />
        <Cell value={tally.out} label="نافد" />
        <Cell
          value={tally.pendingSettlements}
          label="تسويات معلّقة"
          lit={tally.pendingSettlements > 0}
        />
      </section>
      <NeedsAttention />
      <OpenDrafts />
    </div>
  )
}
