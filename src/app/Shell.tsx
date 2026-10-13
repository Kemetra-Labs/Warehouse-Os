import { NavLink, Outlet, useNavigate } from 'react-router'
import { useSyncState } from '../data/sync'
import { SyncPill } from '../ui/components/SyncPill'
import { HOSPITAL_NAME, NAV_ITEMS, STORE_NAME, type NavIcon } from './nav'
import styles from './Shell.module.css'

/** One stroke weight (2) for every icon, as in the status-board mock. */
const ICONS: Readonly<Record<NavIcon, string>> = {
  home: 'M4 11l8-6 8 6v8H4z',
  items: 'M5 6h14M5 12h14M5 18h9',
  movements: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  exports: 'M6 3h9l4 4v14H6zM15 3v4h4',
}

function NavGlyph({ icon }: { readonly icon: NavIcon }) {
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true" focusable="false">
      <path d={ICONS[icon]} />
    </svg>
  )
}

/** Station bar (store, hospital, sync state), routed content, bottom navigation. */
export function Shell() {
  const sync = useSyncState()
  const navigate = useNavigate()

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.names}>
          <b className={styles.store}>{STORE_NAME}</b>
          <small className={styles.hospital}>{HOSPITAL_NAME}</small>
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
            <NavGlyph icon={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
