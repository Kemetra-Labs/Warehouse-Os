import { useState } from 'react'
import { Button } from './Button'
import styles from './PrintButton.module.css'

const FAILED = 'ما قدرناش نجهّز ملف الطباعة. جرّب تاني.'

export interface PrintButtonProps {
  /** Builds and downloads the file. A thrown error with a message is shown as is when it is Arabic. */
  readonly run: () => Promise<void>
  readonly label?: string
}

const isArabic = (text: string): boolean => /[\u0600-\u06ff]/.test(text)

/** Downloads a print file (an A4 right-to-left `.xlsx`), with the failure in words. */
export function PrintButton({ run, label = 'نزّل ملف للطباعة' }: PrintButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const click = (): void => {
    setBusy(true)
    setError(null)
    run()
      .catch((err: unknown) =>
        setError(err instanceof Error && isArabic(err.message) ? err.message : FAILED),
      )
      .finally(() => setBusy(false))
  }

  return (
    <div className={styles.box}>
      <Button disabled={busy} onClick={click}>
        {busy ? 'جاري التجهيز...' : label}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
