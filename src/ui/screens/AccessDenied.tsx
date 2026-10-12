import { DENIED_MESSAGE } from '../../data/listener'
import { StatusScreen } from './StatusScreen'
import styles from './StatusScreen.module.css'

export function AccessDenied({ onSignOut }: { readonly onSignOut: () => void }) {
  return (
    <StatusScreen
      alert
      title={DENIED_MESSAGE}
      message="الحساب ده مش مصرّح له يفتح بيانات المخزن. سجّل الخروج وادخل بالحساب الصحيح."
    >
      <button type="button" className={styles.button} onClick={onSignOut}>
        تسجيل الخروج
      </button>
    </StatusScreen>
  )
}
