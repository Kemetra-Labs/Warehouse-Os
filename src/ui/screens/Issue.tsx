import { useMemo, useState } from 'react'
import type { CancelAttempt } from '../../data/cancelPost'
import type { IssuePostResult } from '../../data/issuePost'
import { formatDay } from '../../domain/fieldInput'
import {
  coverage,
  draftTotals,
  validateForPost,
  type BatchTotals,
  type IssueDraft,
} from '../../domain/issue'
import {
  addSubstitute,
  issueNegative,
  removeRequested,
  removeSubstitute,
  setItemReason,
  setLineBatch,
  setRequestedQty,
} from '../../domain/issueEdit'
import { availableOf, balanceOf, linesNeedingReason, type StockView } from '../../domain/issueStock'
import { formatMoney } from '../../domain/money'
import type { Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { BATCH_NOUN, CancelAction, CancelledNote } from '../components/CancelAction'
import { CountTable } from '../components/CountTable'
import { PrintButton } from '../components/PrintButton'
import { ReasonSheet } from '../components/ReasonSheet'
import { Seal } from '../components/Seal'
import { postedHaptic } from '../haptics'
import { IssueAdd } from './IssueAdd'
import { IssueHeader } from './IssueHeader'
import styles from './Issue.module.css'
import { buildIssueRows, type IssueRowActions } from './issueRows'
import { SubstituteSheet } from './SubstituteSheet'
import type { SealInfo } from './ReceiptReview'
import { useIssueRequest } from './useIssueRequest'
import type { SealedBatch } from './useIssueLoad'

export interface IssueProps {
  readonly draft: IssueDraft
  readonly items: readonly Item[]
  readonly stock: StockView
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today: string
  /** A batch that is already posted (or cancelled): shown read-only under its seal. */
  readonly sealed: SealedBatch | null
  /** Another batch (made on another device while offline) has the same number (R10). */
  readonly duplicateNumber?: boolean
  readonly onChange: (draft: IssueDraft) => void
  /** Posts the batch as given: it may hold the open line that joined just now. */
  readonly onPost: (draft: IssueDraft) => Promise<IssuePostResult>
  /** Cancels the posted batch. Without it a posted batch has no cancel action. */
  readonly onCancel?: (reason: string) => Promise<CancelAttempt>
  /** Downloads the A4 print file of the posted (or cancelled) batch. */
  readonly onPrint?: () => Promise<void>
  /** Shown after posting: leave the batch. */
  readonly onFinish?: () => void
}

type Phase =
  | { readonly kind: 'edit' }
  | { readonly kind: 'posting' }
  | { readonly kind: 'done'; readonly totals: BatchTotals }

const NEGATIVE_PRESETS = ['حالة مستعجلة', 'الرصيد على الورق غلط', 'هتتسوّى بعد الجرد'] as const
const POST_FAILED = 'ما قدرناش نعتمد الدفعة. جرّب تاني.'
const CANCEL_PRESETS = ['اتصرفت للمندوب الغلط', 'الدفعة اتكررت', 'الأصناف أو الكميات غلط'] as const
const CANCEL_SUMMARY = 'هيتعمل عكس لكل صنف في الدفعة والأرصدة هترجع. الحركات الأصلية هتفضل ظاهرة.'

function Totals({ totals }: { readonly totals: BatchTotals }) {
  const diff = totals.differenceMinor
  return (
    <div className={styles.sum} data-testid="totals" role="group" aria-label="ملخص القيمة">
      <div>
        <b>{formatMoney(totals.requestedMinor)}</b>
        <span>قيمة المطلوب (ج)</span>
      </div>
      <div>
        <b>{formatMoney(totals.issuedMinor)}</b>
        <span>اللي اتسلّم (ج)</span>
      </div>
      <div className={diff === 0 ? styles.same : styles.off}>
        <b>{formatMoney(diff)}</b>
        <span>الفرق (ج)</span>
      </div>
    </div>
  )
}

/** FR-040 / US3-7: a posted batch shows the permit numbers it was issued against. */
function PermitList({ permits }: { readonly permits: readonly string[] }) {
  if (permits.length === 0) return null
  return (
    <p className={styles.permits} data-testid="permits">
      أرقام الأذون:{' '}
      {permits.map((p) => (
        <span key={p} className={styles.permit}>
          <Bdi>{p}</Bdi>
        </span>
      ))}
    </p>
  )
}

/** The item codes that have at least one line beyond the balance. */
function overdrawnItems(draft: IssueDraft, stock: StockView): Set<string> {
  const lines = linesNeedingReason(draft.issued, stock)
  return new Set(draft.issued.filter((l) => lines.has(l.n)).map((l) => l.itemCode))
}

/** Issuing to the rep: requested lines, substitutes, negative issue with a reason, then the seal. */
export function Issue(props: IssueProps) {
  const { draft, items, stock, today, sealed, onChange } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' })
  const [errors, setErrors] = useState<readonly string[]>([])
  const [substituteFor, setSubstituteFor] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  // Set once this screen cancels the batch: the editor keeps its own copy from a one-time load.
  const [cancelledNow, setCancelledNow] = useState<string | null>(null)

  const flow = useIssueRequest({ draft, items, stock, onChange })
  const readOnly = sealed !== null || phase.kind === 'done'
  const posting = phase.kind === 'posting'
  const itemOf = (code: string | null): Item | null => items.find((i) => i.code === code) ?? null

  // A posted batch is shown as it was posted: no validation, no live balances, stored totals.
  // What blocks approving is judged on the batch as it will read once a ready open line joined.
  const problems = useMemo(
    () => (readOnly ? [] : validateForPost(flow.withOpen, { today, stock })),
    [readOnly, flow.withOpen, today, stock],
  )
  const overdrawn = useMemo(
    () => (readOnly ? new Set<string>() : overdrawnItems(draft, stock)),
    [readOnly, draft, stock],
  )
  const shorts = useMemo(() => coverage(draft), [draft])
  const totals =
    sealed?.totals ??
    (phase.kind === 'done' ? phase.totals : null) ??
    draftTotals(draft, (code) => itemOf(code)?.priceMinor ?? 0)

  const edit = (next: IssueDraft): void => onChange(next)
  const actions: IssueRowActions = {
    onSubstitute: setSubstituteFor,
    onReason: setReasonFor,
    onQty: (code, qty) => edit(setRequestedQty(draft, code, qty, stock)),
    onRemove: (code) => edit(removeRequested(draft, code)),
    onDropSubstitute: (forCode, subCode) => edit(removeSubstitute(draft, forCode, subCode, stock)),
    onBatch: (n, batch) => edit(setLineBatch(draft, n, batch, stock)),
  }
  const rows = buildIssueRows({
    draft,
    items,
    stock: readOnly ? null : stock,
    overdrawn,
    actions: readOnly ? null : actions,
  })

  const post = async (batch: IssueDraft): Promise<void> => {
    setPhase({ kind: 'posting' })
    setErrors([])
    try {
      const result = await props.onPost(batch)
      if (result.ok) {
        postedHaptic()
        return setPhase({
          kind: 'done',
          totals: draftTotals(batch, (code) => itemOf(code)?.priceMinor ?? 0),
        })
      }
      setErrors(result.problems.map((p) => p.message))
    } catch {
      setErrors([POST_FAILED])
    }
    setPhase({ kind: 'edit' })
  }

  /**
   * راجع واعتمد / اعتماد. An open line only joins on this tap: its row then shows the batch and
   * expiry it was given (earliest first, changeable there) before anything is posted, since a
   * posted movement can only be reversed, never removed. With no open line, it posts.
   */
  const approve = (): void => {
    const hadOpen = flow.open !== null
    const batch = flow.approve()
    if (batch === null || hadOpen) return
    if (validateForPost(batch, { today, stock }).length > 0) return
    void post(batch)
  }

  const saveReason = (reason: string): void => {
    const short = shorts.find((c) => c.itemCode === reasonFor && c.shortQty > 0)
    if (reasonFor) {
      edit(
        short
          ? issueNegative(draft, reasonFor, reason, stock)
          : setItemReason(draft, reasonFor, reason),
      )
    }
    setReasonFor(null)
  }

  const subTarget = itemOf(substituteFor)
  const subShort = shorts.find((c) => c.itemCode === substituteFor)?.shortQty ?? 0
  const seal: SealInfo | null =
    cancelledNow !== null
      ? { variant: 'cancelled', day: today, reason: cancelledNow }
      : (sealed?.seal ?? (readOnly ? { variant: 'posted', day: today } : null))
  const canCancel = props.onCancel !== undefined && seal?.variant === 'posted'
  const reasonItem = itemOf(reasonFor)

  return (
    <section className={styles.screen} aria-labelledby="issue-title">
      <header className={styles.head}>
        <div>
          <h1 id="issue-title" className={styles.title}>
            {readOnly ? 'دفعة صرف' : 'صرف للمندوب'} {draft.number}
          </h1>
          <p className={styles.meta}>
            {draft.rep || 'من غير مندوب'} · {formatDay(draft.businessDate)} · {draft.permits.length}{' '}
            إذن
          </p>
        </div>
        {seal ? (
          <Seal
            variant={seal.variant}
            date={formatDay(seal.day)}
            docNumber={`دفعة ${draft.number}`}
          />
        ) : null}
      </header>

      {props.duplicateNumber ? (
        <p className={styles.warning} role="status" data-testid="duplicate-number">
          فيه دفعة تانية بنفس الرقم {draft.number}، اتعملت من جهاز تاني. الرقم مش هيتغيّر عشان ممكن
          يكون اتطبع.
        </p>
      ) : null}
      {readOnly ? <PermitList permits={draft.permits} /> : null}

      {readOnly ? null : (
        <>
          <IssueHeader draft={draft} onChange={edit} />
          <IssueAdd
            items={items}
            flow={flow}
            availableOf={(code) => availableOf(stock, code, draft.issued)}
          />
        </>
      )}

      {rows.length === 0 ? (
        <p className={styles.note}>ابحث عن صنف بالصفحة أو الكود أو الاسم وضيفه للدفعة.</p>
      ) : (
        <CountTable caption="المطلوب قصاد اللي اتسلّم" rows={rows} />
      )}
      <Totals totals={totals} />

      {readOnly ? null : (
        <>
          {problems.length > 0 ? (
            <ul className={styles.issues} aria-label="لسه ناقص">
              {problems.map((p, i) => (
                <li key={`${p.code}-${p.itemCode ?? 'h'}-${i}`}>{p.message}</li>
              ))}
            </ul>
          ) : null}
          {errors.length > 0 ? (
            <div className={styles.errors} role="alert">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : null}
          <footer className={styles.footer}>
            <Button
              variant={flow.open ? 'primary' : 'seal'}
              size="main"
              disabled={posting || (flow.open ? flow.problem !== null : problems.length > 0)}
              onClick={approve}
            >
              {flow.open ? 'راجع واعتمد' : 'اعتماد'}
            </Button>
          </footer>
        </>
      )}

      {seal?.variant === 'cancelled' ? (
        <CancelledNote noun={BATCH_NOUN} reason={seal.reason ?? null} />
      ) : null}
      {seal && props.onPrint ? <PrintButton run={props.onPrint} /> : null}
      {canCancel && props.onCancel ? (
        <CancelAction
          noun={BATCH_NOUN}
          presets={CANCEL_PRESETS}
          summary={CANCEL_SUMMARY}
          onCancel={props.onCancel}
          onCancelled={setCancelledNow}
        />
      ) : null}

      {phase.kind === 'done' && cancelledNow === null ? (
        <div className={styles.done} role="status">
          <p>الدفعة اتعتمدت. لو النت مش موجود هتتبعت أول ما يرجع.</p>
          {props.onFinish ? <Button onClick={props.onFinish}>رجوع للرئيسية</Button> : null}
        </div>
      ) : null}

      <SubstituteSheet
        open={substituteFor !== null}
        requested={subTarget}
        shortQty={subShort}
        items={items}
        availableOf={(code) => availableOf(stock, code, draft.issued)}
        onPick={(sub, qty) => {
          if (substituteFor) edit(addSubstitute(draft, substituteFor, sub.code, qty, stock))
          setSubstituteFor(null)
        }}
        onNegative={() => {
          setReasonFor(substituteFor)
          setSubstituteFor(null)
        }}
        onClose={() => setSubstituteFor(null)}
      />
      <ReasonSheet
        open={reasonFor !== null}
        title="سبب الصرف بالسالب"
        summary={
          reasonItem
            ? `${reasonItem.nameAr} · الرصيد ${balanceOf(stock, reasonFor ?? '')} · الصنف هيظهر في تسويات معلّقة`
            : undefined
        }
        presets={NEGATIVE_PRESETS}
        initial={
          draft.issued.find((l) => l.itemCode === reasonFor && l.negativeReason)?.negativeReason ??
          ''
        }
        onSave={saveReason}
        onClose={() => setReasonFor(null)}
      />
    </section>
  )
}
