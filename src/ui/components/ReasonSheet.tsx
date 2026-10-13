import { useState, type FormEvent, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import styles from './ReasonSheet.module.css'

export interface ReasonSheetProps {
  readonly open: boolean
  readonly title: string
  /** What the reason is for, e.g. the invoiced and counted numbers. */
  readonly summary?: ReactNode
  readonly presets: readonly string[]
  readonly initial: string
  readonly onSave: (reason: string) => void
  readonly onClose: () => void
}

interface FormProps extends Pick<ReasonSheetProps, 'presets' | 'initial' | 'onSave'> {
  readonly summary?: ReactNode
}

function ReasonForm({ summary, presets, initial, onSave }: FormProps) {
  const [text, setText] = useState(initial)
  const reason = text.trim()

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (reason !== '') onSave(reason)
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {summary ? <p className={styles.summary}>{summary}</p> : null}
      <div className={styles.presets}>
        {presets.map((preset) => (
          <Button key={preset} onClick={() => setText(preset)}>
            {preset}
          </Button>
        ))}
      </div>
      <label className={styles.field}>
        <span>السبب</span>
        <input
          className={styles.input}
          type="text"
          dir="auto"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button type="submit" variant="primary" disabled={reason === ''}>
        حفظ السبب
      </Button>
    </form>
  )
}

/** A short reason, asked for in a sheet: quick choices on top, free text below. */
export function ReasonSheet({ open, title, onClose, ...form }: ReasonSheetProps) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <ReasonForm {...form} />
    </BottomSheet>
  )
}
