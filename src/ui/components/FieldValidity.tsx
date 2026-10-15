import { createContext, useContext, useEffect, useId } from 'react'

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
