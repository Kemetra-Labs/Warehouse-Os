import styles from './Glyph.module.css'

export type GlyphKind = 'minus' | 'plus' | 'cross'

const PATHS: Readonly<Record<GlyphKind, string>> = {
  minus: 'M3 8h10',
  plus: 'M3 8h10M8 3v10',
  cross: 'M4 4l8 8M12 4l-8 8',
}

/**
 * A drawn symbol for a square button (−, +, ×), so it never depends on a font. Decorative: the
 * button carries the accessible name. Takes the colour of the text around it.
 */
export function Glyph({ kind }: { readonly kind: GlyphKind }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PATHS[kind]} />
    </svg>
  )
}
