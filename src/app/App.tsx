import { BrowserRouter } from 'react-router'
import { isOwner } from '../data/auth'
import { DataProvider, useData } from '../data/DataProvider'
import { missingFirebaseConfig } from '../data/firebase'
import { AccessDenied } from '../ui/screens/AccessDenied'
import { ConfigError } from '../ui/screens/ConfigError'
import { SignIn } from '../ui/screens/SignIn'
import { StatusScreen } from '../ui/screens/StatusScreen'
import { AuthProvider, useAuth } from './AuthProvider'
import { AppRoutes } from './routes'
import { UpdatePrompt } from './UpdatePrompt'

function DataGate() {
  const { status, error } = useData()
  const { signOut } = useAuth()
  if (status === 'denied') return <AccessDenied onSignOut={signOut} />
  if (status === 'error') {
    return <StatusScreen alert title="تعذّر تحميل البيانات" message={error?.message ?? ''} />
  }
  return <AppRoutes />
}

function AuthGate() {
  const { state, busy, error, signIn, signOut } = useAuth()
  if (state.status === 'loading') {
    return <StatusScreen title="مخزن الشرائح والمسامير" message="جاري التحميل..." />
  }
  if (state.status === 'signedOut') return <SignIn onSignIn={signIn} busy={busy} error={error} />
  if (!isOwner(state.user)) return <AccessDenied onSignOut={signOut} />
  return (
    <DataProvider>
      <DataGate />
    </DataProvider>
  )
}

export function App() {
  const missing = missingFirebaseConfig()
  return (
    <>
      {missing.length > 0 ? (
        <ConfigError missing={missing} />
      ) : (
        <AuthProvider>
          <BrowserRouter>
            <AuthGate />
          </BrowserRouter>
        </AuthProvider>
      )}
      <UpdatePrompt />
    </>
  )
}
