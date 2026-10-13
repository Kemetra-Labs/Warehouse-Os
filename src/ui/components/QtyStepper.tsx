import { useState, type ReactNode } from 'react'
import { parseQtyInput } from '../../domain/fieldInput'
import styles from './QtyStepper.module.css'

export interface QtyStepperProps {
  /** The committed count. When it changes from outside (a scan), the text follows. */
  readonly value: number
  /** What the number is, for the field's name (not shown). */
  readonly label: string
  readonly onCommit: (value: number) => void
  /** Under the numeral, e.g. "اتعدّ من 6 في الفاتورة". */
  readonly caption?: ReactNode
}

/** The text of a whole-number input that follows its committed value but keeps what was typed. */
function useQtyText(value: number, onCommit: (value: number) => void) {
  const [text, setText] = useState(String(value))
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(String(value))
  }
  const set = (next: number): void => {
    setSynced(next)
    setText(String(next))
    onCommit(next)
  }
  const type = (next: string): void => {
    setText(next)
    const n = parseQtyInput(next)
    if (n !== null) {
      setSynced(n)
      onCommit(n)
    }
  }
  return { text, valid: parseQtyInput(text) !== null, set, type }
}

export interface InlineQtyProps {
  readonly value: number
  readonly label: string
  readonly onCommit: (value: number) => void
}

/**
 * A small whole-number field that sits inside a sentence ("اتعدّ من [6] في الفاتورة"). Zero shows
 * empty with a dash, so a quantity that is still missing reads as missing.
 */
export function InlineQty({ value, label, onCommit }: InlineQtyProps) {
  const qty = useQtyText(value, onCommit)
  return (
    <label className={styles.inline}>
      <span className={styles.sr}>{label}</span>
      <input
        className={styles.inlineInput}
        type="text"
        inputMode="numeric"
        dir="ltr"
        autoComplete="off"
        placeholder="؟"
        value={value === 0 && qty.text === '0' ? '' : qty.text}
        aria-invalid={!qty.valid}
        onChange={(e) => qty.type(e.target.value)}
      />
    </label>
  )
}

/**
 * A count with a big −/+ on each side (56 px) and the numeral between them. The numeral is a real
 * input, so typing a number stays possible; text that is not a whole number is kept as typed and
 * marked invalid, nothing is committed.
 */
export function QtyStepper({ value, label, onCommit, caption }: QtyStepperProps) {
  const { text, valid, set, type } = useQtyText(value, onCommit)

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.step}
        aria-label="نقّص واحد"
        disabled={value <= 0}
        onClick={() => set(Math.max(0, value - 1))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 8h10" />
        </svg>
      </button>
      <div className={styles.center}>
        <label className={styles.field}>
          <span className={styles.sr}>{label}</span>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            value={text}
            aria-invalid={!valid}
            onChange={(e) => type(e.target.value)}
          />
        </label>
        {caption ? <div className={styles.caption}>{caption}</div> : null}
      </div>
      <button
        type="button"
        className={styles.step}
        aria-label="زوّد واحد"
        onClick={() => set(value + 1)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 8h10M8 3v10" />
        </svg>
      </button>
    </div>
  )
}
