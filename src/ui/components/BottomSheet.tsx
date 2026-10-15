import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import styles from './BottomSheet.module.css'

export interface BottomSheetProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
}

const SWIPE_CLOSE_PX = 80
/** Safety net if the exit animation never reports (reduced motion, tests, hidden tab). */
const EXIT_FALLBACK_MS = 400
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function trapTab(e: KeyboardEvent<HTMLDivElement>, root: HTMLElement): void {
  // A disabled control cannot take focus: counting it as the last one would let Tab escape.
  const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.matches(':disabled'),
  )
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!first || !last) {
    e.preventDefault()
    return
  }
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

/** Accessible modal sheet: scrim, grab handle, Esc or swipe down to close. */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const returnFocus = useRef<Element | null>(null)
  const [rendered, setRendered] = useState(open)

  // Mount on open; unmount after the exit animation (adjust state during render).
  if (open && !rendered) setRendered(true)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement
    sheetRef.current?.focus()
    return () => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (open || !rendered) return
    const t = setTimeout(() => setRendered(false), EXIT_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [open, rendered])

  if (!rendered) return null

  const setOffset = (px: number): void => {
    const el = sheetRef.current
    if (el) el.style.transform = px > 0 ? `translateY(${px}px)` : ''
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    dragStart.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current !== null) setOffset(e.clientY - dragStart.current)
  }
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current === null) return
    const dy = e.clientY - dragStart.current
    dragStart.current = null
    setOffset(0)
    if (dy > SWIPE_CLOSE_PX) onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab' && sheetRef.current) {
      trapTab(e, sheetRef.current)
    }
  }

  return (
    <div className={styles.root} data-state={open ? 'open' : 'closing'}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onAnimationEnd={(e) => {
          if (!open && e.target === e.currentTarget) setRendered(false)
        }}
      >
        <div
          className={styles.handleZone}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className={styles.handle} />
        </div>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
