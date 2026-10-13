import { useState, type FormEvent } from 'react'
import { cleanGtinInput, GTIN_PATTERN } from '../../domain/items'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import styles from './ItemGtins.module.css'

export interface ItemGtinsProps {
  readonly gtins: readonly string[]
  readonly onChange: (gtins: readonly string[]) => void
}

/** An item can hold several barcodes (FR-015): add one at a time, remove with the ×. */
export function ItemGtins({ gtins, onChange }: ItemGtinsProps) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const add = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const gtin = cleanGtinInput(text)
    if (gtin === '') return
    if (!GTIN_PATTERN.test(gtin)) {
      setProblem('الباركود لازم يكون 8 أو 13 رقم')
      return
    }
    if (gtins.includes(gtin)) {
      setProblem('الباركود ده مضاف قبل كده')
      return
    }
    onChange([...gtins, gtin])
    setText('')
    setProblem(null)
  }

  return (
    <fieldset className={styles.box}>
      <legend className={styles.legend}>الباركود</legend>
      <ul className={styles.list} aria-label="باركودات الصنف">
        {gtins.map((g) => (
          <li key={g} className={styles.chip}>
            <Bdi>{g}</Bdi>
            <button
              type="button"
              className={styles.remove}
              aria-label={`مسح الباركود ${g}`}
              onClick={() => onChange(gtins.filter((x) => x !== g))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {gtins.length === 0 ? <p className={styles.none}>مفيش باركود لسه.</p> : null}
      <form className={styles.adder} onSubmit={add}>
        <label className={styles.field}>
          <span>باركود جديد</span>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            value={text}
            aria-invalid={problem !== null}
            onChange={(e) => {
              setText(e.target.value)
              setProblem(null)
            }}
          />
        </label>
        <Button type="submit" variant="secondary" disabled={text.trim() === ''}>
          إضافة باركود
        </Button>
      </form>
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
    </fieldset>
  )
}
