import { StatusScreen } from './StatusScreen'
import styles from './StatusScreen.module.css'

export interface SignInProps {
  readonly onSignIn: () => void
  readonly busy: boolean
  readonly error: string | null
}

export function SignIn({ onSignIn, busy, error }: SignInProps) {
  return (
    <StatusScreen
      title="مخزن الشرائح والمسامير"
      message="سجّل الدخول بحساب جوجل علشان تفتح المخزن."
    >
      <button type="button" className={styles.button} onClick={onSignIn} disabled={busy}>
        {busy ? 'جاري الدخول...' : 'الدخول بحساب جوجل'}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </StatusScreen>
  )
}
