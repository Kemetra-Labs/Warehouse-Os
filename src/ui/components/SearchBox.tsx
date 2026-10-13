import {
  useId,
  useMemo,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { classify, suggestItems, type SearchClass } from '../../domain/search'
import type { Item } from '../../domain/types'
import styles from './SearchBox.module.css'
import { optionId, SuggestionList } from './SuggestionList'

export interface SearchBoxProps {
  readonly onResolve: (result: SearchClass) => void
  readonly placeholder?: string
  /** Empty the field after each submit, so the next lookup starts clean (receiving, issuing). */
  readonly clearOnSubmit?: boolean
  /** The text the field starts with (a list restoring its search after the user came back). */
  readonly initialValue?: string
  /** Called on every keystroke: a list can narrow as the user types. */
  readonly onTextChange?: (text: string) => void
  /** With `onPickItem`: the items to suggest from while the user types (no Enter needed). */
  readonly suggestFrom?: readonly Item[]
  /** A tapped (or arrow-and-Enter) suggestion; the field empties and the list closes. */
  readonly onPickItem?: (item: Item) => void
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

/** The next highlighted option for an arrow key, wrapping at both ends; -1 means none. */
export function stepIndex(current: number, count: number, step: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return step === 1 ? 0 : count - 1
  return (current + step + count) % count
}

/**
 * One input for page number, GTIN, item code or name (FR-020). Enter submits. With `suggestFrom`
 * the matching items also show under the field as you type (combobox + listbox).
 */
export function SearchBox({
  onResolve,
  placeholder = 'رقم الصفحة أو الباركود أو الكود أو الاسم',
  clearOnSubmit = false,
  initialValue = '',
  onTextChange,
  suggestFrom,
  onPickItem,
}: SearchBoxProps) {
  const [value, setValue] = useState(initialValue)
  const [open, setOpen] = useState(true)
  const [active, setActive] = useState(-1)
  const hintId = useId()
  const listId = useId()
  const hint = hintFor(value)
  const suggesting = suggestFrom !== undefined && onPickItem !== undefined
  const suggestions = useMemo(
    () => (suggestFrom ? suggestItems(suggestFrom, value) : []),
    [suggestFrom, value],
  )
  const showList = suggesting && open && value.trim() !== ''
  const activeIndex = active < suggestions.length ? active : -1

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (value.trim() === '') return
    onResolve(classify(value))
    if (clearOnSubmit) setValue('')
  }

  const change = (text: string): void => {
    setValue(text)
    setOpen(true)
    setActive(-1)
    onTextChange?.(text)
  }

  const pick = (item: Item): void => {
    onPickItem?.(item)
    setValue('')
    setOpen(false)
    setActive(-1)
    onTextChange?.('')
  }

  const arrow = (e: KeyboardEvent<HTMLInputElement>, step: 1 | -1): void => {
    if (suggestions.length === 0) return
    e.preventDefault()
    if (!showList) return setOpen(true)
    setActive(stepIndex(activeIndex, suggestions.length, step))
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!suggesting || e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') return arrow(e, 1)
    if (e.key === 'ArrowUp') return arrow(e, -1)
    if (!showList) return
    if (e.key === 'Escape') {
      e.preventDefault() // a search field would otherwise clear itself
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'Enter') {
      const chosen = suggestions[activeIndex]
      if (!chosen) return // no highlighted option: Enter submits the text, as ever
      e.preventDefault()
      pick(chosen)
    }
  }

  const leave = (e: FocusEvent<HTMLFormElement>): void => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
  }

  const comboboxProps = suggesting
    ? {
        role: 'combobox',
        'aria-expanded': showList && suggestions.length > 0,
        'aria-controls': listId,
        'aria-autocomplete': 'list' as const,
        'aria-activedescendant':
          showList && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined,
        onKeyDown: keyDown,
        onFocus: () => setOpen(true),
      }
    : {}

  return (
    <form className={styles.form} role="search" onSubmit={submit} onBlur={leave}>
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
        {...comboboxProps}
      />
      <p id={hintId} className={styles.hint} aria-live="polite">
        {hint}
      </p>
      {showList ? (
        <SuggestionList id={listId} items={suggestions} activeIndex={activeIndex} onPick={pick} />
      ) : null}
    </form>
  )
}
