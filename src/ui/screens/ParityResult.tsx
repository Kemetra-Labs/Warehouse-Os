import type { ParityReport } from '../../excel/parity'
import { Bdi } from '../components/Bdi'
import { kindLabel, valueLabel } from './importView'
import styles from './ImportParity.module.css'

export interface ParityResultProps {
  readonly report: ParityReport
  /** Where the app side came from, shown under the counter. */
  readonly source: string
}

/** The big "N / total مطابق" counter, then every difference with both values and the reason. */
export function ParityResult({ report, source }: ParityResultProps) {
  const allMatch = report.balanceMatched === report.total
  return (
    <section className={styles.result} aria-label="نتيجة المطابقة">
      <div className={`${styles.counter} ${allMatch ? styles.ok : styles.bad}`}>
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false" className={styles.glyph}>
          <path d={allMatch ? 'M4.5 9.5l3 2.8L13.5 6' : 'M5.5 5.5l7 7M12.5 5.5l-7 7'} />
        </svg>
        <b className={styles.big} aria-live="polite">
          <Bdi>
            {report.balanceMatched} / {report.total}
          </Bdi>
        </b>
        <span className={styles.caption}>مطابق في الرصيد</span>
      </div>
      <p className={styles.sub}>
        الحالات المطابقة: <Bdi>{report.statusMatched}</Bdi> من <Bdi>{report.total}</Bdi> · {source}
      </p>
      {report.diffs.length > 0 ? (
        <ul className={styles.diffs} aria-label="الفروقات">
          {report.diffs.map((d) => (
            <li key={`${d.code}-${d.kind}`} className={styles.diff}>
              <div className={styles.diffHead}>
                <Bdi>{d.code}</Bdi>
                <span className={styles.kind}>{kindLabel(d.kind)}</span>
              </div>
              <div className={styles.values}>
                <span>
                  التطبيق: <Bdi>{valueLabel(d.app)}</Bdi>
                </span>
                <span>
                  الإكسيل: <Bdi>{valueLabel(d.workbook)}</Bdi>
                </span>
              </div>
              <p className={styles.reason}>{d.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
