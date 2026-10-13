import { Button } from '../components/Button'
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
      <Button variant="primary" size="main" onClick={onSignIn} disabled={busy}>
        {busy ? 'جاري الدخول...' : 'الدخول بحساب جوجل'}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </StatusScreen>
  )
}
