import { useMemo, useState } from 'react'
import type { CancelAttempt } from '../../data/cancelPost'
import type { PostResult } from '../../data/receiptPost'
import { formatDay } from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import {
  previewPost,
  priceChanged,
  receiptTotalMinor,
  type ExistingReceipt,
  type ReceiptDraft,
} from '../../domain/receipt'
import { lineDiff, patchLine, resolveLine } from '../../domain/receiptEdit'
import type { Item } from '../../domain/types'
import { Button } from '../components/Button'
import { CancelAction, CancelledNote, RECEIPT_NOUN } from '../components/CancelAction'
import { CountTable } from '../components/CountTable'
import { ItemPickerSheet } from '../components/ItemPickerSheet'
import { PrintButton } from '../components/PrintButton'
import { ReasonSheet } from '../components/ReasonSheet'
import { Seal, type SealVariant } from '../components/Seal'
import { postedHaptic } from '../haptics'
import styles from './ReceiptReview.module.css'
import { buildReviewRows, type ReasonField } from './reviewRows'

/** A receipt that is already posted (or cancelled): shown read-only under its seal. */
export interface SealInfo {
  readonly variant: SealVariant
  /** The day it was posted, or cancelled, `YYYY-MM-DD`. */
  readonly day: string
  /** Why it was cancelled. */
  readonly reason?: string | null
}

export interface ReceiptReviewProps {
  readonly draft: ReceiptDraft
  readonly items: readonly Item[]
  readonly existing: readonly ExistingReceipt[]
  readonly selfId: string
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today: string
  readonly sealed: SealInfo | null
  readonly onChange: (draft: ReceiptDraft) => void
  readonly onBack: () => void
  readonly onPost: () => Promise<PostResult>
  /** Cancels the posted receipt. Without it a posted receipt has no cancel action. */
  readonly onCancel?: (reason: string) => Promise<CancelAttempt>
  /** Downloads the A4 print file of the posted (or cancelled) receipt. */
  readonly onPrint?: () => Promise<void>
  /** Shown after posting: leave the receipt. */
  readonly onFinish?: () => void
}

type Phase = { readonly kind: 'review' } | { readonly kind: 'posting' } | { readonly kind: 'done' }

interface ReasonTarget {
  readonly n: number
  readonly field: ReasonField
}

const DIFF_PRESETS = ['ناقص من المورد', 'زيادة من المورد', 'تالف', 'لم يصل'] as const
const POST_FAILED = 'ما قدرناش نعتمد الإذن. جرّب تاني.'
const CANCEL_PRESETS = ['استلام بالغلط', 'الإذن اتكرر', 'الأصناف أو الكميات غلط'] as const
const CANCEL_SUMMARY =
  'هيتعمل عكس لكل صنف في الإذن والأرصدة هترجع. الحركات الأصلية هتفضل ظاهرة، والسعر بيرجع لو ما اتغيرش من استلام تاني.'

function counts(draft: ReceiptDraft) {
  return {
    pieces: draft.lines.reduce((sum, l) => sum + l.countedQty, 0),
    differing: draft.lines.filter((l) => l.invoicedQty > 0 && lineDiff(l) !== 0).length,
    unresolved: draft.lines.filter((l) => l.itemCode === null).length,
    prices: draft.lines.filter(priceChanged).length,
  }
}

function Summary({ draft }: { readonly draft: ReceiptDraft }) {
  const c = counts(draft)
  return (
    <p className={styles.summary} data-testid="summary">
      {c.pieces} قطعة · {draft.lines.length} سطور · {c.prices} سعر اتحدّث
      {c.differing > 0 ? ` · فرق في ${c.differing}` : ''}
      {c.unresolved > 0 ? ` · ${c.unresolved} صنف مش معروف` : ''}
      <br />
      القيمة {formatMoney(receiptTotalMinor(draft.lines))} ج
    </p>
  )
}

function reasonSummary(draft: ReceiptDraft, target: ReasonTarget | null): string | undefined {
  const line = target ? draft.lines.find((l) => l.n === target.n) : undefined
  if (!line || target?.field !== 'diffReason') return undefined
  const diff = lineDiff(line)
  return `الفاتورة ${line.invoicedQty} · اتعدّ ${line.countedQty} · الفرق ${Math.abs(diff)}`
}

/** The double-count review: fix what blocks posting, then اعتماد. A posted receipt is read-only. */
export function ReceiptReview(props: ReceiptReviewProps) {
  const { draft, items, existing, selfId, today, sealed, onChange } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'review' })
  const [errors, setErrors] = useState<readonly string[]>([])
  const [ack, setAck] = useState(false)
  const [reasonFor, setReasonFor] = useState<ReasonTarget | null>(null)
  const [resolveN, setResolveN] = useState<number | null>(null)
  // Set once this screen cancels the receipt: the editor keeps its own copy from a one-time load.
  const [cancelledNow, setCancelledNow] = useState<string | null>(null)

  const done = phase.kind === 'done'
  const readOnly = sealed !== null || done
  const sealInfo: SealInfo | null =
    cancelledNow !== null
      ? { variant: 'cancelled', day: today, reason: cancelledNow }
      : (sealed ?? (done ? { variant: 'posted', day: today } : null))
  const canCancel = props.onCancel !== undefined && sealInfo?.variant === 'posted'

  const { issues, warnings } = useMemo(
    () => previewPost(draft, { today, existing, selfId, items }),
    [draft, today, existing, selfId, items],
  )

  const rows = buildReviewRows(draft.lines, items, {
    businessDate: draft.businessDate,
    readOnly,
    actions: {
      onResolve: setResolveN,
      onReason: (n, field) => setReasonFor({ n, field }),
    },
  })

  const post = async (): Promise<void> => {
    setPhase({ kind: 'posting' })
    setErrors([])
    try {
      const result = await props.onPost()
      if (result.ok) {
        postedHaptic()
        return setPhase({ kind: 'done' })
      }
      setErrors(result.issues.map((i) => i.message))
    } catch {
      setErrors([POST_FAILED])
    }
    setPhase({ kind: 'review' })
  }

  const saveReason = (reason: string): void => {
    if (reasonFor) onChange(patchLine(draft, reasonFor.n, { [reasonFor.field]: reason }))
    setReasonFor(null)
  }

  const pickItem = (item: Item): void => {
    const line = draft.lines.find((l) => l.n === resolveN)
    if (line) onChange(patchLine(draft, line.n, resolveLine(line, item)))
    setResolveN(null)
  }

  const blocked = issues.length > 0 || (warnings.length > 0 && !ack) || phase.kind === 'posting'
  const docNumber = draft.deliveryNo.trim() === '' ? 'استلام' : `إذن ${draft.deliveryNo.trim()}`

  return (
    <section className={styles.screen} aria-labelledby="review-title">
      <header className={styles.head}>
        <div>
          <h1 id="review-title" className={styles.title}>
            {readOnly ? 'إذن استلام' : 'مراجعة الإذن'}
          </h1>
          <p className={styles.meta}>
            {draft.supplier || 'من غير شركة'} · فاتورة {draft.invoiceNo || '—'} ·{' '}
            {formatDay(draft.businessDate)}
          </p>
        </div>
        {sealInfo ? (
          <Seal variant={sealInfo.variant} date={formatDay(sealInfo.day)} docNumber={docNumber} />
        ) : null}
      </header>

      <CountTable
        caption="الفاتورة قصاد اللي اتعدّ"
        labels={{ requested: 'الفاتورة', delivered: 'اتعدّ' }}
        rows={rows}
      />
      <Summary draft={draft} />

      {readOnly ? null : (
        <>
          {issues.length > 0 ? (
            <ul className={styles.issues} aria-label="لسه ناقص">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.line ?? 'h'}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {warnings.length > 0 ? (
            <div className={styles.warnings}>
              <ul>
                {warnings.map((w) => (
                  <li key={`${w.kind}-${w.line}`}>{w.message}</li>
                ))}
              </ul>
              <label className={styles.ack}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                فاهم التنبيهات وعايز أكمّل
              </label>
            </div>
          ) : null}
          {errors.length > 0 ? (
            <div className={styles.errors} role="alert">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={props.onBack}>ارجع للعدّ</Button>
            <Button variant="seal" disabled={blocked} onClick={() => void post()}>
              اعتماد
            </Button>
          </div>
        </>
      )}

      {sealInfo?.variant === 'cancelled' ? (
        <CancelledNote noun={RECEIPT_NOUN} reason={sealInfo.reason ?? null} />
      ) : null}
      {sealInfo && props.onPrint ? <PrintButton run={props.onPrint} /> : null}
      {canCancel && props.onCancel ? (
        <CancelAction
          noun={RECEIPT_NOUN}
          presets={CANCEL_PRESETS}
          summary={CANCEL_SUMMARY}
          onCancel={props.onCancel}
          onCancelled={setCancelledNow}
        />
      ) : null}

      {done && cancelledNow === null ? (
        <div className={styles.done} role="status">
          <p>الإذن اتعتمد. لو النت مش موجود هيتبعت أول ما يرجع.</p>
          {props.onFinish ? <Button onClick={props.onFinish}>رجوع للرئيسية</Button> : null}
        </div>
      ) : null}

      <ReasonSheet
        open={reasonFor !== null}
        title={reasonFor?.field === 'expiredReason' ? 'سبب الصلاحية المنتهية' : 'سبب الفرق'}
        summary={reasonSummary(draft, reasonFor)}
        presets={reasonFor?.field === 'expiredReason' ? [] : DIFF_PRESETS}
        initial={reasonInitial(draft, reasonFor)}
        onSave={saveReason}
        onClose={() => setReasonFor(null)}
      />
      <ItemPickerSheet
        open={resolveN !== null}
        title="الباركود مش معروف"
        note="اختار الصنف اللي الباركود ده بتاعه. هيتربط بعد الاعتماد، والمرة الجاية يتعرف لوحده."
        items={items}
        onPick={pickItem}
        onClose={() => setResolveN(null)}
      />
    </section>
  )
}

function reasonInitial(draft: ReceiptDraft, target: ReasonTarget | null): string {
  const line = target ? draft.lines.find((l) => l.n === target.n) : undefined
  return (target && line ? line[target.field] : null) ?? ''
}
