import { useEffect, useRef, useState } from 'react'
import { createCameraSource } from './camera'
import { signal } from './feedback'
import { createScanGate } from './gate'
import styles from './Scanner.module.css'
import type { ScanCode, ScanFeedback, ScanSession, ScanSource } from './types'

export interface ScannerProps {
  /** Called once per counted code. The answer drives the outline: tick for known, cross for unknown. */
  readonly onCode: (code: ScanCode) => ScanFeedback
  /** The camera and detector. Tests pass a fake; the default is the real camera. */
  readonly source?: ScanSource
  /** The camera is missing or was refused. The scanner hides itself; typed search stays. */
  readonly onUnavailable?: () => void
}

type Status = 'starting' | 'ready' | 'unavailable'

const OUTLINE_MS = 700
const GLYPHS: Readonly<Record<ScanFeedback, string>> = {
  known: 'M4.5 9.5l3 2.8L13.5 6',
  unknown: 'M5.5 5.5l7 7M12.5 5.5l-7 7',
}
const LABELS: Readonly<Record<ScanFeedback, string>> = {
  known: 'اتقرا',
  unknown: 'الباركود مش معروف',
}

const defaultSource = createCameraSource()

/**
 * Camera viewfinder. The whole view is one button (pause or resume), scanning is continuous,
 * and each counted code gets a beep, a vibration and a coloured outline with a glyph.
 */
export function Scanner({ onCode, source = defaultSource, onUnavailable }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  const onUnavailableRef = useRef(onUnavailable)
  const sessionRef = useRef<ScanSession | null>(null)
  const pausedRef = useRef(false)
  const [gate] = useState(() => createScanGate())
  const [status, setStatus] = useState<Status>('starting')
  const [paused, setPaused] = useState(false)
  const [flash, setFlash] = useState<{ kind: ScanFeedback; id: number } | null>(null)

  useEffect(() => {
    onCodeRef.current = onCode
    onUnavailableRef.current = onUnavailable
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let session: ScanSession | null = null

    const handle = (code: ScanCode): void => {
      if (pausedRef.current || !gate.accept(code.rawValue)) return
      const kind = onCodeRef.current(code)
      signal(kind)
      setFlash((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }))
    }
    const giveUp = (): void => {
      if (cancelled) return
      setStatus('unavailable')
      onUnavailableRef.current?.()
    }

    source
      .hasCamera()
      .then((ok) => (ok && !cancelled ? source.start(video, handle) : null))
      .then((started) => {
        if (started === null) return giveUp()
        if (cancelled) return started.stop()
        session = started
        sessionRef.current = started
        setStatus('ready')
      })
      .catch(giveUp)

    return () => {
      cancelled = true
      session?.stop()
      sessionRef.current = null
    }
  }, [source, gate])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), OUTLINE_MS)
    return () => clearTimeout(t)
  }, [flash])

  const toggle = (): void => {
    const next = !pausedRef.current
    pausedRef.current = next
    sessionRef.current?.setPaused(next)
    setPaused(next)
  }

  if (status === 'unavailable') return null
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.view}
        aria-pressed={paused}
        aria-label="إيقاف المسح مؤقتًا"
        onClick={toggle}
      >
        <video ref={videoRef} className={styles.video} muted playsInline />
        <span className={styles.frame} aria-hidden="true" />
        {flash ? (
          <span
            key={flash.id}
            className={`${styles.outline} ${styles[flash.kind]}`}
            data-feedback={flash.kind}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false" className={styles.glyph}>
              <path d={GLYPHS[flash.kind]} />
            </svg>
            <span>{LABELS[flash.kind]}</span>
          </span>
        ) : null}
        <span className={styles.hint}>
          {paused ? 'المسح واقف. المس الشاشة عشان تكمّل' : 'وجّه الكاميرا على باركود العلبة'}
        </span>
      </button>
      <p className={styles.live} role="status">
        {flash ? LABELS[flash.kind] : ''}
      </p>
    </div>
  )
}
