import { useState, type FormEvent } from 'react'
import { cairoToday } from '../../domain/dates'
import { formatDay } from '../../domain/fieldInput'
import type { IssueDraft } from '../../domain/issue'
import { addPermit, parsePermit, removePermit } from '../../domain/issueEdit'
import { Bdi } from '../components/Bdi'
import { BottomSheet } from '../components/BottomSheet'
import { Button } from '../components/Button'
import { Glyph } from '../components/Glyph'
import { HeaderSummary } from './HeaderSummary'
import extra from './IssueHeader.module.css'
import styles from './ReceiveHeader.module.css'

export interface IssueHeaderProps {
  readonly draft: IssueDraft
  readonly onChange: (draft: IssueDraft) => void
}

interface PermitAdderProps extends IssueHeaderProps {
  /** The permit number being typed. The form owns it, so تم can add it before closing. */
  readonly text: string
  readonly onText: (text: string) => void
}

function PermitAdder({ draft, onChange, text, onText }: PermitAdderProps) {
  const permit = parsePermit(text)

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (permit === null) return
    onChange(addPermit(draft, permit))
    onText('')
  }

  return (
    <div className={extra.permits}>
      <form className={extra.adder} onSubmit={submit}>
        <label className={styles.field}>
          <span>رقم إذن المريض (أرقام بس)</span>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            value={text}
            onChange={(e) => onText(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={permit === null}>
          إضافة إذن
        </Button>
      </form>
      {text.trim() !== '' && permit === null ? (
        <p className={extra.warn} role="alert">
          رقم الإذن لازم يكون أرقام بس
        </p>
      ) : null}
      <ul className={extra.list} aria-label="أرقام الأذون">
        {draft.permits.map((p) => (
          <li key={p} className={extra.permit}>
            <Bdi>{p}</Bdi>
            <button
              type="button"
              className={extra.remove}
              aria-label={`مسح الإذن ${p}`}
              onClick={() => onChange(removePermit(draft, p))}
            >
              <Glyph kind="cross" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BatchForm({ draft, onChange, onDone }: IssueHeaderProps & { onDone: () => void }) {
  const [permitText, setPermitText] = useState('')

  // A permit number typed but not added is added now; one that is not a number keeps the sheet
  // open (the red line under the box says why) rather than being dropped.
  const done = (): void => {
    if (permitText.trim() !== '') {
      const permit = parsePermit(permitText)
      if (permit === null) return
      onChange(addPermit(draft, permit))
    }
    onDone()
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span>اسم المندوب</span>
        <input
          className={styles.input}
          type="text"
          dir="auto"
          autoComplete="off"
          value={draft.rep}
          onChange={(e) => onChange({ ...draft, rep: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>تاريخ الصرف</span>
        <input
          className={styles.input}
          type="date"
          max={cairoToday()}
          value={draft.businessDate}
          onChange={(e) =>
            onChange({ ...draft, businessDate: e.target.value || draft.businessDate })
          }
        />
      </label>
      <PermitAdder draft={draft} onChange={onChange} text={permitText} onText={setPermitText} />
      <Button variant="primary" onClick={done}>
        تم
      </Button>
    </div>
  )
}

/** Representative, permit count and date as one line; the button edits them all. */
export function IssueHeader(props: IssueHeaderProps) {
  const [open, setOpen] = useState(false)
  const { draft } = props
  const repMissing = draft.rep.trim() === ''
  return (
    <>
      <HeaderSummary
        items={[
          { label: 'المندوب', value: draft.rep, empty: repMissing, required: true },
          { label: 'الأذون', value: draft.permits.length },
          { label: 'التاريخ', value: formatDay(draft.businessDate) },
        ]}
        editLabel="بيانات الدفعة"
        onEdit={() => setOpen(true)}
      />
      <BottomSheet open={open} title="بيانات الدفعة" onClose={() => setOpen(false)}>
        <BatchForm {...props} onDone={() => setOpen(false)} />
      </BottomSheet>
    </>
  )
}
