import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shows a bar when a new version is ready. Never reloads on its own (research R9). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div role="status" style={barStyle}>
      <span>تحديث جديد متاح</span>
      <button type="button" onClick={() => void updateServiceWorker(true)} style={buttonStyle}>
        إعادة التحميل
      </button>
    </div>
  )
}

const barStyle = {
  position: 'fixed',
  insetInline: 0,
  insetBlockEnd: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--panel-2)',
  color: 'var(--bone)',
  borderBlockStart: '1px solid var(--hair)',
  zIndex: 100,
} as const

const buttonStyle = {
  minBlockSize: 44,
  paddingInline: 'var(--space-4)',
  border: 0,
  borderRadius: 10,
  background: 'var(--bone)',
  color: 'var(--ground)',
  fontFamily: 'inherit',
  fontWeight: 800,
} as const
