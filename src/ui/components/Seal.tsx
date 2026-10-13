import styles from './Seal.module.css'

export type SealVariant = 'posted' | 'cancelled'

export interface SealProps {
  readonly variant?: SealVariant
  /** Display date, e.g. 12/10/2026. */
  readonly date: string
  /** Document number, e.g. "دفعة 14". */
  readonly docNumber: string
  /** Plays the stamp animation once on mount. Off for static lists and print. */
  readonly animate?: boolean
}

/** A date or number longer than this is squeezed to fit inside the inner ring (60 of 100 units). */
const FIT_CHARS = 11
const FIT_WIDTH = 60

const fit = (text: string): { textLength?: number; lengthAdjust?: 'spacingAndGlyphs' } =>
  text.length > FIT_CHARS ? { textLength: FIT_WIDTH, lengthAdjust: 'spacingAndGlyphs' } : {}

const TITLES: Readonly<Record<SealVariant, string>> = {
  posted: 'معتمد',
  cancelled: 'ملغي',
}

/**
 * Round approval seal, a solid disc so it reads on the dark ground. Violet (--seal) is reserved
 * for the posted state; the cancelled variant is the short red. A flat SVG: disc, double ring,
 * Arabic title, date, doc number.
 */
export function Seal({ variant = 'posted', date, docNumber, animate = true }: SealProps) {
  const title = TITLES[variant]
  return (
    <svg
      className={`${styles.seal} ${styles[variant]} ${animate ? styles.animate : ''}`}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${title} ${date} ${docNumber}`}
    >
      <circle className={styles.disc} cx="50" cy="50" r="48" />
      <circle className={styles.ringOuter} cx="50" cy="50" r="45" />
      <circle className={styles.ringInner} cx="50" cy="50" r="40" />
      <text className={styles.title} x="50" y="46" textAnchor="middle">
        {title}
      </text>
      <text className={styles.meta} x="50" y="61" textAnchor="middle" direction="ltr">
        {date}
      </text>
      <text className={styles.meta} x="50" y="74" textAnchor="middle" {...fit(docNumber)}>
        {docNumber}
      </text>
    </svg>
  )
}
