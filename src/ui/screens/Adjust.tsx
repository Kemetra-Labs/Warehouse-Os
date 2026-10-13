import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../app/AuthProvider'
import type { ManualAttempt } from '../../data/cancelPost'
import type { ItemRow } from '../../data/deriveLedger'
import { useData } from '../../data/DataProvider'
import { getDeviceId } from '../../data/deviceId'
import { postManualMovement } from '../../data/repos/movements'
import { useLedger } from '../../data/useLedger'
import { validateManual, type ManualInput, type ManualProblem } from '../../domain/adjust'
import { cairoToday } from '../../domain/dates'
import { formatExpiry } from '../../domain/fieldInput'
import type { BatchBalance } from '../../domain/ledger'
import { formatMoney } from '../../domain/money'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import styles from './Adjust.module.css'
import {
  NEW_BATCH,
  batchKey,
  initialForm,
  toManualInput,
  type AdjustFormState,
  type Direction,
} from './adjustForm'

const RETURN_PRESETS = ['رجع من المندوب', 'مرتجع من المستشفى'] as const
const ADJUST_PRESETS = ['جرد', 'تسوية رصيد سالب', 'تالف', 'فرق عدّ'] as const
const SAVE_FAILED = 'ما قدرناش نسجّل الحركة. جرّب تاني.'

const signedQty = (n: number): string => (n > 0 ? `+${n}` : String(n))

interface FieldsProps {
  readonly form: AdjustFormState
  readonly batches: readonly BatchBalance[]
  readonly today: string
  readonly onChange: (patch: Partial<AdjustFormState>) => void
}

function Choice<T extends string>(props: {
  readonly legend: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onPick: (value: T) => void
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>{props.legend}</legend>
      {props.options.map((o) => (
        <label key={o.value} className={styles.option}>
          <input
            type="radio"
            name={props.legend}
            checked={props.value === o.value}
            onChange={() => props.onPick(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

function batchLabel(b: BatchBalance): string {
  const expiry = b.expiry === null ? '' : ` · صلاحية ${formatExpiry(b.expiry)}`
  return `${b.label}${expiry} · الرصيد ${b.balance}`
}

function BatchPicker({ form, batches, onChange }: FieldsProps) {
  return (
    <>
      <label className={styles.field}>
        <span>التشغيلة</span>
        <select value={form.batch} onChange={(e) => onChange({ batch: e.target.value })}>
          {batches.map((b) => (
            <option key={batchKey(b)} value={batchKey(b)}>
              {batchLabel(b)}
            </option>
          ))}
          <option value={NEW_BATCH}>تشغيلة تانية</option>
        </select>
      </label>
      {form.batch === NEW_BATCH ? (
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>رقم التشغيلة</span>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              value={form.newBatchNo}
              onChange={(e) => onChange({ newBatchNo: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>الصلاحية</span>
            <input
              type="text"
              dir="ltr"
              inputMode="numeric"
              placeholder="03/2031"
              autoComplete="off"
              value={form.newExpiry}
              onChange={(e) => onChange({ newExpiry: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </>
  )
}

function Fields(props: FieldsProps) {
  const { form, today, onChange } = props
  const presets = form.kind === 'return' ? RETURN_PRESETS : ADJUST_PRESETS
  return (
    <>
      <Choice
        legend="نوع الحركة"
        value={form.kind}
        options={[
          { value: 'return', label: 'مرتجع (رجع للمخزن)' },
          { value: 'adjust', label: 'تسوية (زيادة أو نقص)' },
        ]}
        onPick={(kind) => onChange({ kind })}
      />
      {form.kind === 'adjust' ? (
        <Choice<Direction>
          legend="اتجاه التسوية"
          value={form.direction}
          options={[
            { value: 'up', label: 'زيادة في الرصيد' },
            { value: 'down', label: 'نقص من الرصيد' },
          ]}
          onPick={(direction) => onChange({ direction })}
        />
      ) : null}
      <label className={styles.field}>
        <span>الكمية</span>
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          value={form.qtyText}
          onChange={(e) => onChange({ qtyText: e.target.value })}
        />
      </label>
      <BatchPicker {...props} />
      <label className={styles.field}>
        <span>تاريخ الحركة</span>
        <input
          type="date"
          max={today}
          value={form.businessDate}
          onChange={(e) => onChange({ businessDate: e.target.value })}
        />
      </label>
      <div className={styles.presets}>
        {presets.map((preset) => (
          <Button key={preset} onClick={() => onChange({ reason: preset })}>
            {preset}
          </Button>
        ))}
      </div>
      <label className={styles.field}>
        <span>السبب</span>
        <input
          type="text"
          dir="auto"
          autoComplete="off"
          value={form.reason}
          onChange={(e) => onChange({ reason: e.target.value })}
        />
      </label>
    </>
  )
}

export interface AdjustViewProps {
  readonly row: ItemRow
  readonly batches: readonly BatchBalance[]
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today: string
  /** Queues the movement. It works offline: the answer comes as soon as the outbox holds it. */
  readonly onSave: (input: ManualInput) => Promise<ManualAttempt>
}

/** The movement the form describes now, or why it cannot be saved yet. */
function currentProblems(
  form: AdjustFormState,
  row: ItemRow,
  batches: readonly BatchBalance[],
  today: string,
): { input: ManualInput | null; problems: readonly ManualProblem[] } {
  const result = toManualInput(
    form,
    { itemCode: row.item.code, priceMinor: row.item.priceMinor },
    batches,
  )
  if (!result.ok) return { input: null, problems: result.problems }
  const problems = validateManual(result.input, today)
  return { input: problems.length === 0 ? result.input : null, problems }
}

function Done({ saved, code }: { readonly saved: ManualInput; readonly code: string }) {
  return (
    <div className={styles.done} role="status" data-testid="adjust-done">
      <p>
        اتسجّلت: {saved.kind === 'return' ? 'مرتجع' : 'تسوية'} <Bdi>{signedQty(saved.qty)}</Bdi>. لو
        النت مش موجود هتتبعت أول ما يرجع.
      </p>
      <Link to={`/items/${code}`}>رجوع لكارت الصنف</Link>
    </div>
  )
}

/** A return (مرتجع) or a signed adjustment (تسوية) of one item: a new movement, with a reason. */
export function AdjustView({ row, batches, today, onSave }: AdjustViewProps) {
  const [form, setForm] = useState(() => initialForm(row.balance, batches, today))
  const [saved, setSaved] = useState<ManualInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { item } = row

  const { input, problems } = useMemo(
    () => currentProblems(form, row, batches, today),
    [form, row, batches, today],
  )
  const change = (patch: Partial<AdjustFormState>): void =>
    setForm((prev) => ({ ...prev, ...patch }))

  const save = (): void => {
    if (!input) return
    setBusy(true)
    setError(null)
    onSave(input)
      .then((result) => {
        if (result.ok) return setSaved(input)
        setError(result.problems.map((p) => p.message).join(' '))
      })
      .catch(() => setError(SAVE_FAILED))
      .finally(() => setBusy(false))
  }

  return (
    <section className={styles.screen} aria-labelledby="adjust-title">
      <nav aria-label="تنقل">
        <Link to={`/items/${item.code}`}>كارت الصنف</Link>
      </nav>
      <header className={styles.head}>
        <h1 id="adjust-title" className={styles.title}>
          مرتجع وتسوية
        </h1>
        <p className={styles.meta}>
          {item.nameAr} · <Bdi>{item.code}</Bdi> · الرصيد <Bdi>{row.balance}</Bdi>
          {row.pendingSettlement ? ' · تسوية معلّقة' : ''}
        </p>
      </header>

      {saved ? (
        <Done saved={saved} code={item.code} />
      ) : (
        <>
          <Fields form={form} batches={batches} today={today} onChange={change} />
          <p className={styles.preview} data-testid="adjust-preview">
            السعر <Bdi>{formatMoney(item.priceMinor)}</Bdi> ج
            {input ? (
              <>
                {' '}
                · الرصيد بعد الحركة <Bdi>{row.balance + input.qty}</Bdi>
              </>
            ) : null}
          </p>
          {problems.length > 0 && form.reason.trim() !== '' ? (
            <ul className={styles.issues} aria-label="لسه ناقص">
              {problems.map((p, i) => (
                <li key={`${p.code}-${i}`}>{p.message}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="primary" disabled={input === null || busy} onClick={save}>
            {form.kind === 'return' ? 'سجّل المرتجع' : 'سجّل التسوية'}
          </Button>
        </>
      )}
    </section>
  )
}

/** The route `/items/:code/adjust`. */
export function Adjust() {
  const { code = '' } = useParams()
  const ledger = useLedger()
  const { outbox } = useData()
  const { state } = useAuth()
  const row = ledger.byCode.get(code)
  const batches = useMemo(() => ledger.batchBalancesFor(code), [ledger, code])

  if (!row) {
    return (
      <section className={styles.screen}>
        <h1 className={styles.title}>الصنف ده مش موجود</h1>
        <p className={styles.meta}>
          مفيش صنف بالكود <Bdi>{code}</Bdi>. <Link to="/items">ارجع لقائمة الأصناف</Link>
        </p>
      </section>
    )
  }

  const save = (form: ManualInput): Promise<ManualAttempt> => {
    if (state.status !== 'signedIn') return Promise.reject(new Error('not signed in'))
    // One id per press of "save": a retry of the same call writes the movement at most once.
    return postManualMovement(
      { id: crypto.randomUUID(), form, uid: state.user.uid, deviceId: getDeviceId() },
      outbox,
    )
  }
  // The form opens from the balance as it is now; a different item gets a fresh form.
  return <AdjustView key={code} row={row} batches={batches} today={cairoToday()} onSave={save} />
}
