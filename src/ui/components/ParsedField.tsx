import { useState, type ReactNode } from 'react'
import styles from './ParsedField.module.css'

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

export interface ParsedFieldProps<T> {
  readonly label: string
  /** The committed value. When it changes from outside (a scan), the text follows. */
  readonly value: T
  readonly format: (value: T) => string
  readonly parse: (text: string) => Parsed<T>
  readonly onCommit: (value: T) => void
  readonly inputMode?: 'numeric' | 'decimal' | 'text'
  /** Codes, quantities and dates stay left-to-right inside the right-to-left screen. */
  readonly dir?: 'ltr' | 'auto'
  /** Amber: something differs from what was expected (a changed price). */
  readonly changed?: boolean
  readonly hint?: ReactNode
  readonly placeholder?: string
  /** The id of a `<datalist>` that suggests values. */
  readonly list?: string
}

/**
 * A text field that keeps what the user typed while it parses it into a typed value. Text that
 * does not parse yet (a half-typed date) is kept as is and marked invalid; nothing is committed.
 */
export function ParsedField<T>({
  label,
  value,
  format,
  parse,
  onCommit,
  inputMode = 'text',
  dir = 'auto',
  changed = false,
  hint,
  placeholder,
  list,
}: ParsedFieldProps<T>) {
  const [text, setText] = useState(() => format(value))
  const [synced, setSynced] = useState(value)
  if (!Object.is(value, synced)) {
    setSynced(value)
    setText(format(value))
  }

  const onInput = (next: string): void => {
    setText(next)
    const parsed = parse(next)
    if (parsed.ok) {
      setSynced(parsed.value)
      onCommit(parsed.value)
    }
  }

  return (
    <label
      className={`${styles.field} ${changed ? styles.changed : ''}`}
      data-changed={changed ? 'true' : undefined}
    >
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        type="text"
        inputMode={inputMode}
        dir={dir}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        list={list}
        aria-invalid={!parse(text).ok}
        onChange={(e) => onInput(e.target.value)}
      />
      {hint ? <small className={styles.hint}>{hint}</small> : null}
    </label>
  )
}
