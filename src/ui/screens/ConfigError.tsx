import { Bdi } from '../components/Bdi'
import { StatusScreen } from './StatusScreen'
import styles from './StatusScreen.module.css'

/** Shown when the Firebase env vars are missing; replaces a white-screen crash. */
export function ConfigError({ missing }: { readonly missing: readonly string[] }) {
  return (
    <StatusScreen
      alert
      title="إعدادات Firebase ناقصة"
      message="التطبيق مش قادر يتصل بقاعدة البيانات. أضف القيم الناقصة في ملف .env.local وأعد تشغيل التطبيق."
    >
      <ul className={styles.list}>
        {missing.map((key) => (
          <li key={key}>
            <Bdi>{key}</Bdi>
          </li>
        ))}
      </ul>
    </StatusScreen>
  )
}
