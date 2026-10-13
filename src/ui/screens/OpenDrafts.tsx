import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import styles from './OpenDrafts.module.css'

/** Home: start a receipt, and pick up the drafts that were left open (US2 scenario 6). */
export function OpenDrafts() {
  const { receipts } = useData()
  const drafts = receipts.filter((r) => r.status === 'draft')

  return (
    <section className={styles.panel} aria-labelledby="receive-entry">
      <h2 id="receive-entry" className={styles.title}>
        استلام
      </h2>
      <Link to="/receive" className={styles.start}>
        استلام طلبية جديدة
      </Link>
      {drafts.length > 0 ? (
        <ul className={styles.list} aria-label="مسودات الاستلام">
          {drafts.map((r) => (
            <li key={r.id}>
              <Link to={`/receive/${r.id}`} className={styles.draft}>
                <span>{r.supplier || 'من غير شركة'}</span>
                <small>
                  إذن {r.deliveryNo || '—'} · {r.lines.length} سطور · مسودة
                </small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
