import { useId, useState, type FormEvent } from 'react'
import { classify, type SearchClass } from '../../domain/search'
import styles from './SearchBox.module.css'

export interface SearchBoxProps {
  readonly onResolve: (result: SearchClass) => void
  readonly placeholder?: string
  /** Empty the field after each submit, so the next lookup starts clean (receiving, issuing). */
  readonly clearOnSubmit?: boolean
  /** The text the field starts with (a list restoring its search after the user came back). */
  readonly initialValue?: string
  /** Called on every keystroke: a list can narrow as the user types. */
  readonly onTextChange?: (text: string) => void
}

const KIND_LABELS: Readonly<Record<SearchClass['kind'], string>> = {
  page: 'صفحة',
  gtin: 'GTIN',
  ambiguous: 'باركود أو كود الهيئة',
  code: 'كود',
  name: 'اسم',
}

/** What the input was understood as, for the hint under the field. */
export function hintFor(input: string): string | null {
  if (input.trim() === '') return null
  return `فهمتها: ${KIND_LABELS[classify(input).kind]}`
}

/** One input for page number, GTIN, item code or name (FR-020). Enter submits. */
export function SearchBox({
  onResolve,
  placeholder = 'رقم الصفحة أو الباركود أو الكود أو الاسم',
  clearOnSubmit = false,
  initialValue = '',
  onTextChange,
}: SearchBoxProps) {
  const [value, setValue] = useState(initialValue)
  const hintId = useId()
  const hint = hintFor(value)

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (value.trim() === '') return
    onResolve(classify(value))
    if (clearOnSubmit) setValue('')
  }

  const change = (text: string): void => {
    setValue(text)
    onTextChange?.(text)
  }

  return (
    <form className={styles.form} role="search" onSubmit={submit}>
      <input
        className={styles.input}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        dir="auto"
        value={value}
        placeholder={placeholder}
        aria-label="بحث عن صنف"
        aria-describedby={hintId}
        onChange={(e) => change(e.target.value)}
      />
      <p id={hintId} className={styles.hint} aria-live="polite">
        {hint}
      </p>
    </form>
  )
}
