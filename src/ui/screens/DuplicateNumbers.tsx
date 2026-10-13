import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import { duplicateBatchNumbers } from '../../domain/issueNumbers'
import styles from './OpenDrafts.module.css'

/** R10: two batches with the same number (made on two devices offline), with a link to each. */
export function DuplicateNumbers() {
  const { issueBatches } = useData()
  const duplicates = duplicateBatchNumbers(issueBatches)
  if (duplicates.length === 0) return null

  return (
    <section
      className={styles.warning}
      aria-labelledby="duplicate-numbers"
      data-testid="duplicate-numbers"
    >
      <h2 id="duplicate-numbers" className={styles.title}>
        دفعات بنفس الرقم
      </h2>
      <p className={styles.hint}>
        الدفعات دي اتعملت من جهازين من غير نت. الأرقام مش هتتغيّر عشان ممكن تكون اتطبعت.
      </p>
      <ul className={styles.list}>
        {duplicates.map((d) => (
          <li key={d.number}>
            <span>رقم {d.number}: </span>
            {d.ids.map((id, i) => (
              <Link key={id} to={`/issue/${id}`} className={styles.inline}>
                الدفعة {i + 1}
              </Link>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
