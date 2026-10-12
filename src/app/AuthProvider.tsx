import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authErrorMessage,
  completeRedirectSignIn,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  type AuthUser,
} from '../data/auth'

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'signedIn'; readonly user: AuthUser }

export interface AuthValue {
  readonly state: AuthState
  readonly busy: boolean
  readonly error: string | null
  signIn(): void
  signOut(): void
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** Persisted Firebase session; works offline after the first sign-in (research R3). */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    completeRedirectSignIn().catch((err: unknown) => setError(authErrorMessage(err)))
    return subscribeAuth((user) =>
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }),
    )
  }, [])

  const signIn = useCallback(() => {
    setBusy(true)
    setError(null)
    signInWithGoogle()
      .catch((err: unknown) => setError(authErrorMessage(err)))
      .finally(() => setBusy(false))
  }, [])

  const signOut = useCallback(() => {
    signOutUser().catch((err: unknown) => setError(authErrorMessage(err)))
  }, [])

  const value = useMemo(
    () => ({ state, busy, error, signIn, signOut }),
    [state, busy, error, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
