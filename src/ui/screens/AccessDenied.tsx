import { DENIED_MESSAGE } from '../../data/listener'
import { Button } from '../components/Button'
import { StatusScreen } from './StatusScreen'

export function AccessDenied({ onSignOut }: { readonly onSignOut: () => void }) {
  return (
    <StatusScreen
      alert
      title={DENIED_MESSAGE}
      message="الحساب ده مش مصرّح له يفتح بيانات المخزن. سجّل الخروج وادخل بالحساب الصحيح."
    >
      <Button variant="primary" size="main" onClick={onSignOut}>
        تسجيل الخروج
      </Button>
    </StatusScreen>
  )
}
