import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'

/** Told by every `ParsedField` whether its text parses; a screen reads it before it moves on. */
export type ReportValidity = (fieldId: string, invalid: boolean) => void

const FieldValidityContext = createContext<ReportValidity | null>(null)
export const FieldValidityProvider = FieldValidityContext.Provider

/**
 * Reports one field as invalid while its text does not parse. Text that does not parse commits
 * nothing, so without this a screen would carry on with the field's last good number.
 */
export function useReportValidity(invalid: boolean): void {
  const report = useContext(FieldValidityContext)
  const id = useId()
  useEffect(() => {
    report?.(id, invalid)
    return () => report?.(id, false)
  }, [report, id, invalid])
}

export interface ValidityScope {
  /** Give this to a `FieldValidityProvider` around the fields. */
  readonly report: ReportValidity
  /** True after `leave` was refused, until the fields are all valid again. */
  readonly stuck: boolean
  /** False (and `stuck` turns on) while a field holds text that is not valid: do not close. */
  leave(): boolean
}

/**
 * Tracks the fields of one editor on top of the screen's own tracking. A field that is closed away
 * reports itself valid as it unmounts, so an editor must refuse to close over an invalid field:
 * otherwise the text is gone and the old number goes on to be posted.
 */
export function useValidityScope(): ValidityScope {
  const outer = useContext(FieldValidityContext)
  const bad = useRef(new Set<string>())
  const [stuck, setStuck] = useState(false)
  const report = useCallback<ReportValidity>(
    (id, invalid) => {
      if (invalid) bad.current.add(id)
      else bad.current.delete(id)
      outer?.(id, invalid)
      if (bad.current.size === 0) setStuck(false)
    },
    [outer],
  )
  const leave = useCallback((): boolean => {
    if (bad.current.size === 0) return true
    setStuck(true)
    return false
  }, [])
  return { report, stuck, leave }
}
