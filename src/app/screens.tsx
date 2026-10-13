import { Link } from 'react-router'
import styles from './screens.module.css'

function Placeholder({ title }: { readonly title: string }) {
  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>الشاشة دي لسه تحت العمل.</p>
    </section>
  )
}

export const MovementsScreen = () => <Placeholder title="الحركات" />
export const ReportsScreen = () => (
  <>
    <Placeholder title="التقارير" />
    <p className={styles.note}>
      <Link to="/import">استيراد ملف الإكسيل ومطابقة الأرصدة وأكواد الهيئة</Link>
    </p>
    <p className={styles.note}>
      <Link to="/settings">إعدادات المخزن</Link>
    </p>
  </>
)
