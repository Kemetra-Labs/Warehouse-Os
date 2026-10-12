import { useLedger } from '../data/useLedger'
import styles from './screens.module.css'

function Placeholder({ title }: { readonly title: string }) {
  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>الشاشة دي لسه تحت العمل.</p>
    </section>
  )
}

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

export function HomeScreen() {
  const { tally } = useLedger()
  return (
    <>
      <Placeholder title="الرئيسية" />
      <section className={styles.tally} aria-label="ملخص المخزن">
        <Cell value={tally.needsReorder} label="تحتاج طلب" />
        <Cell value={tally.out} label="نافد" />
        <Cell
          value={tally.pendingSettlements}
          label="تسويات معلّقة"
          lit={tally.pendingSettlements > 0}
        />
      </section>
    </>
  )
}

export const ItemsScreen = () => <Placeholder title="الأصناف" />
export const MovementsScreen = () => <Placeholder title="الحركات" />
export const ReportsScreen = () => <Placeholder title="التقارير" />
export const UnsentScreen = () => <Placeholder title="مستندات لم تُرسل" />
