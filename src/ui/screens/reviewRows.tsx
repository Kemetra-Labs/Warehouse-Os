import { formatExpiry } from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import { priceChanged } from '../../domain/receipt'
import { isExpired, lineDiff } from '../../domain/receiptEdit'
import type { Item, ReceiptLine } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import type { CountRow } from '../components/CountTable'
import styles from './ReceiptReview.module.css'

export type ReasonField = 'diffReason' | 'expiredReason'

export interface ReviewActions {
  readonly onResolve: (n: number) => void
  readonly onReason: (n: number, field: ReasonField) => void
}

interface RowInput {
  readonly line: ReceiptLine
  readonly item: Item | undefined
  readonly businessDate: string
  /** A posted or cancelled receipt shows reasons but offers no way to change them. */
  readonly readOnly: boolean
  readonly actions: ReviewActions
}

function Notes({ line, item, businessDate, readOnly, actions }: RowInput) {
  const diff = lineDiff(line)
  const needsDiff = line.invoicedQty > 0 && diff !== 0
  const expired = isExpired(line, businessDate) && line.countedQty > 0
  const noteOf = (field: ReasonField): string => (line[field] ?? '').trim()

  return (
    <>
      <span className={styles.sub}>
        {line.batchNo ? (
          <>
            تشغيلة <Bdi>{line.batchNo}</Bdi>
          </>
        ) : (
          'من غير تشغيلة'
        )}
        {line.expiry ? (
          <>
            {' · '}
            <Bdi>{formatExpiry(line.expiry)}</Bdi>
          </>
        ) : null}
      </span>
      {priceChanged(line) ? (
        <span className={styles.amber}>
          السعر اتغير ← {formatMoney(line.priceMinor)} (كان {formatMoney(line.prevPriceMinor)})
        </span>
      ) : null}
      {item === undefined && !readOnly ? (
        <Button variant="secondary" onClick={() => actions.onResolve(line.n)}>
          اختار الصنف
        </Button>
      ) : null}
      {needsDiff ? (
        <>
          <span className={styles.amber}>
            {diff < 0 ? `ناقص ${-diff}` : `زيادة ${diff}`}
            {noteOf('diffReason') ? ` · السبب: ${noteOf('diffReason')}` : ''}
          </span>
          {readOnly ? null : (
            <Button onClick={() => actions.onReason(line.n, 'diffReason')}>
              {noteOf('diffReason') ? 'تعديل سبب الفرق' : 'اكتب سبب الفرق'}
            </Button>
          )}
        </>
      ) : null}
      {expired ? (
        <>
          <span className={styles.amber}>
            الصلاحية منتهية
            {noteOf('expiredReason') ? ` · السبب: ${noteOf('expiredReason')}` : ''}
          </span>
          {readOnly ? null : (
            <Button onClick={() => actions.onReason(line.n, 'expiredReason')}>
              {noteOf('expiredReason') ? 'تعديل سبب الصلاحية' : 'اكتب سبب الصلاحية المنتهية'}
            </Button>
          )}
        </>
      ) : null}
    </>
  )
}

/** The double-count rows: invoiced against counted, with what still needs the user's attention. */
export function buildReviewRows(
  lines: readonly ReceiptLine[],
  items: readonly Item[],
  common: Omit<RowInput, 'line' | 'item'>,
): CountRow[] {
  const byCode = new Map(items.map((i) => [i.code, i]))
  return lines.map((line) => {
    const item = line.itemCode === null ? undefined : byCode.get(line.itemCode)
    return {
      key: String(line.n),
      name: item ? (
        item.nameAr
      ) : (
        <>
          باركود <Bdi>{line.scannedGtin ?? '؟'}</Bdi> مش معروف
        </>
      ),
      sub: <Notes line={line} item={item} {...common} />,
      requested: line.invoicedQty,
      delivered: line.countedQty,
      state: item ? undefined : 'warn',
    }
  })
}
