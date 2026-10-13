import { useState, type ChangeEvent } from 'react'
import { useData } from '../../data/DataProvider'
import { setAuthorityCodes } from '../../data/repos/items'
import { settleQuickly } from '../../data/settle'
import { ImportError } from '../../excel/errors'
import {
  CONFIRM_MARKS,
  readAuthorityMapping,
  type AuthorityImport as Plan,
  type RejectReason,
} from '../../excel/importAuthorityCodes'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import shared from './ImportParity.module.css'
import styles from './AuthorityImport.module.css'

const REASONS: Readonly<Record<RejectReason, string>> = {
  'invalid-code': 'كود الهيئة مش 8 أو 9 أرقام',
  'duplicate-in-file': 'الكود أو الصنف متكرر في الملف بقيمة مختلفة',
  'held-by-other-item': 'كود الهيئة ده عند صنف تاني',
  'already-different': 'الصنف عنده كود هيئة تاني',
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ready'; readonly plan: Plan }
  | { readonly kind: 'writing' }
  | { readonly kind: 'done'; readonly count: number; readonly queued: boolean }

const GENERIC_ERROR = 'حصلت مشكلة غير متوقعة. جرّب تاني.'
const REFUSED = 'السيرفر رفض التحديث. راجع الملف وجرّب تاني.'

function Summary({ plan }: { readonly plan: Plan }) {
  return (
    <>
      <ul className={styles.counts} aria-label="ملخص الملف">
        <li>
          هيتحدّث <b data-testid="authority-updates">{plan.updates.length}</b> صنف
        </li>
        <li>
          صفوف من غير تأكيد اتساب: <b>{plan.skippedUnconfirmed}</b>
        </li>
        {plan.unchanged > 0 ? (
          <li>
            أصناف كودها زي ما هو: <b>{plan.unchanged}</b>
          </li>
        ) : null}
      </ul>
      {plan.unknownCodes.length > 0 ? (
        <details className={shared.warnings} open>
          <summary>أكواد مش موجودة في الأصناف ({plan.unknownCodes.length})</summary>
          <ul>
            {plan.unknownCodes.map((c) => (
              <li key={c}>
                <Bdi>{c}</Bdi>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {plan.rejected.length > 0 ? (
        <details className={shared.warnings} open>
          <summary>صفوف مرفوضة ({plan.rejected.length})</summary>
          <ul>
            {plan.rejected.map((r) => (
              <li key={`${r.row}-${r.itemCode}`}>
                صف {r.row}: <Bdi>{r.itemCode}</Bdi>
                {r.authorityCode === null ? (
                  ''
                ) : (
                  <>
                    {' '}
                    / <Bdi>{r.authorityCode}</Bdi>
                  </>
                )}{' '}
                - {REASONS[r.reason]}
                {r.heldBy === undefined ? (
                  ''
                ) : (
                  <>
                    {' '}
                    (<Bdi>{r.heldBy}</Bdi>)
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}

/**
 * Loads authority codes (كود الهيئة) onto existing items from the owner-reviewed mapping file
 * (FR-017). The file is read here, checked against the items, summarised, and only then written:
 * nothing changes until the owner taps the button.
 */
export function AuthorityImport() {
  const { items } = useData()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      setStage({ kind: 'ready', plan: readAuthorityMapping(await file.arrayBuffer(), items) })
    } catch (err) {
      setError(err instanceof ImportError ? err.message : GENERIC_ERROR)
      setStage({ kind: 'idle' })
    }
  }

  const apply = async (plan: Plan): Promise<void> => {
    setStage({ kind: 'writing' })
    const outcome = await settleQuickly(setAuthorityCodes(plan.updates))
    if (outcome === 'failed') {
      setError(REFUSED)
      setStage({ kind: 'ready', plan })
      return
    }
    setStage({ kind: 'done', count: plan.updates.length, queued: outcome === 'pending' })
  }

  const busy = stage.kind === 'writing'
  const plan = stage.kind === 'ready' ? stage.plan : null

  return (
    <section className={styles.block} aria-labelledby="authority-title">
      <h2 id="authority-title" className={styles.title}>
        استيراد أكواد الهيئة
      </h2>
      <p className={shared.note}>
        اختار ملف المطابقة (.xlsx) اللي راجعته: أعمدة "الكود" و"كود الهيئة" و"تأكيد". الصفوف اللي
        مفيهاش تأكيد بتتساب. علامات التأكيد المقبولة: {CONFIRM_MARKS.join(' ، ')}
      </p>

      <label className={`${shared.pick} ${busy ? shared.disabled : ''}`}>
        اختار ملف أكواد الهيئة
        <input
          className={shared.file}
          type="file"
          accept=".xlsx"
          aria-label="ملف أكواد الهيئة"
          disabled={busy}
          onChange={(e) => void onFile(e)}
        />
      </label>

      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {plan ? <Summary plan={plan} /> : null}
      {plan ? (
        <Button disabled={plan.updates.length === 0} onClick={() => void apply(plan)}>
          {plan.updates.length === 0 ? 'مفيش حاجة تتحدّث' : `حدّث ${plan.updates.length} صنف`}
        </Button>
      ) : null}
      {stage.kind === 'writing' ? <p className={shared.note}>بيحدّث...</p> : null}
      {stage.kind === 'done' ? (
        <p className={shared.done} role="status">
          {stage.queued
            ? `اتحدّث ${stage.count} صنف على الجهاز، وهيتبعتوا لما النت يرجع.`
            : `اتحدّث ${stage.count} صنف.`}
        </p>
      ) : null}
    </section>
  )
}
