import { NavLink, Outlet, useNavigate } from 'react-router'
import { useSyncState } from '../data/sync'
import { SyncPill } from '../ui/components/SyncPill'
import { HOSPITAL_NAME, NAV_ITEMS, STORE_NAME } from './nav'
import styles from './Shell.module.css'

/** Scrub header with the sync pill at inline-end, routed content, bottom navigation. */
export function Shell() {
  const sync = useSyncState()
  const navigate = useNavigate()

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <small className={styles.hospital}>{HOSPITAL_NAME}</small>
          <b className={styles.store}>{STORE_NAME}</b>
        </div>
        <SyncPill state={sync} onRetry={() => void navigate('/unsent')} />
      </header>
      <div className={styles.content}>
        <Outlet />
      </div>
      <nav className={styles.nav} aria-label="التنقل الرئيسي">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
