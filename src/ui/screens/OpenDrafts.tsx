import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import styles from './OpenDrafts.module.css'

/** "كمّل" and a chevron that points the way RTL reads on (towards the left). */
function Resume() {
  return (
    <span className={styles.go}>
      كمّل
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M10 3L5 8l5 5" />
      </svg>
    </span>
  )
}

/** The issue batches that were left open, at the top of home (US3: the open batch in front of you). */
export function OpenBatches() {
  const { issueBatches } = useData()
  const drafts = issueBatches.filter((b) => b.status === 'draft')
  if (drafts.length === 0) return null

  return (
    <section className={styles.open} aria-labelledby="open-batches">
      <h2 id="open-batches" className={styles.title}>
        دفعة مفتوحة
      </h2>
      <ul className={styles.list} aria-label="مسودات الصرف">
        {drafts.map((b) => (
          <li key={b.id}>
            <Link to={`/issue/${b.id}`} className={styles.draft}>
              <span className={styles.draftTitle}>
                دفعة صرف {b.number} · {b.rep || 'من غير مندوب'}
              </span>
              <small>{b.requested.length} صنف · مسودة</small>
              <Resume />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The receipts that were left open (US2 scenario 6). */
export function OpenDrafts() {
  const { receipts } = useData()
  const drafts = receipts.filter((r) => r.status === 'draft')
  if (drafts.length === 0) return null

  return (
    <section className={styles.panel} aria-labelledby="open-receipts">
      <h2 id="open-receipts" className={styles.title}>
        استلام مفتوح
      </h2>
      <ul className={styles.list} aria-label="مسودات الاستلام">
        {drafts.map((r) => (
          <li key={r.id}>
            <Link to={`/receive/${r.id}`} className={styles.draft}>
              <span className={styles.draftTitle}>{r.supplier || 'من غير شركة'}</span>
              <small>
                إذن {r.deliveryNo || '—'} · {r.lines.length} سطور · مسودة
              </small>
              <Resume />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
