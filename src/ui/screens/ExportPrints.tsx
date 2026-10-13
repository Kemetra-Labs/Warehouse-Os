import { useMemo, useState } from 'react'
import { toMillis } from '../../data/convert'
import { useData } from '../../data/DataProvider'
import { formatDay } from '../../domain/fieldInput'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { PrintButton } from '../components/PrintButton'
import { downloadIssuePrint, downloadReceiptPrint } from './exportActions'
import styles from './Exports.module.css'

const VISIBLE = 8

interface PrintEntry {
  readonly key: string
  readonly title: string
  readonly detail: string
  readonly at: number
  readonly run: () => Promise<void>
}

/** FR-060: the posted (and cancelled) receipts and issue batches, newest first, each printable. */
export function ExportPrints() {
  const { receipts, issueBatches, items, movements } = useData()
  const [all, setAll] = useState(false)

  const entries = useMemo<readonly PrintEntry[]>(() => {
    const status = (s: string): string => (s === 'cancelled' ? ' · ملغي' : '')
    const fromReceipts = receipts.flatMap((receipt): PrintEntry[] =>
      receipt.status === 'draft'
        ? []
        : [
            {
              key: `r-${receipt.id}`,
              title: `استلام · إذن ${receipt.deliveryNo || '—'}`,
              detail: `${receipt.supplier || 'من غير شركة'} · ${formatDay(receipt.businessDate)}${status(receipt.status)}`,
              at: toMillis(receipt.postedAt),
              run: () => downloadReceiptPrint({ receipt, items }),
            },
          ],
    )
    const fromBatches = issueBatches.flatMap((batch): PrintEntry[] =>
      batch.status === 'draft'
        ? []
        : [
            {
              key: `b-${batch.id}`,
              title: `صرف · دفعة ${batch.number}`,
              detail: `${batch.rep || 'من غير مندوب'} · ${formatDay(batch.businessDate)}${status(batch.status)}`,
              at: toMillis(batch.postedAt),
              run: () => downloadIssuePrint({ batch, items, movements }),
            },
          ],
    )
    return [...fromReceipts, ...fromBatches].sort((a, b) => b.at - a.at)
  }, [receipts, issueBatches, items, movements])

  const shown = all ? entries : entries.slice(0, VISIBLE)

  return (
    <section className={styles.card} aria-labelledby="print-title">
      <h2 id="print-title" className={styles.heading}>
        طباعة إذن استلام أو دفعة صرف
      </h2>
      <p className={styles.note}>
        بينزل ملف إكسيل جاهز للطباعة على A4 (من اليمين للشمال، وعرض الصفحة كله على ورقة واحدة).
        افتحه واطبعه.
      </p>
      {entries.length === 0 ? (
        <p className={styles.note}>لسه مفيش إذن استلام أو دفعة صرف معتمدة.</p>
      ) : (
        <ul className={styles.list} aria-label="المستندات المعتمدة">
          {shown.map((entry) => (
            <li key={entry.key} className={styles.row} data-testid="print-row">
              <div>
                <b>
                  <Bdi>{entry.title}</Bdi>
                </b>
                <small>{entry.detail}</small>
              </div>
              <PrintButton run={entry.run} label="نزّل للطباعة" />
            </li>
          ))}
        </ul>
      )}
      {!all && entries.length > VISIBLE ? (
        <Button onClick={() => setAll(true)}>عرض الكل ({entries.length})</Button>
      ) : null}
    </section>
  )
}
