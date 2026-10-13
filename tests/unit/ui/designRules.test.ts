import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Design rules that are cheap to keep true by machine (T092, T093): logical properties only,
 * 12 px minimum text, AA contrast for the colour tokens, and motion that animates only
 * transform and opacity and always has a reduced-motion answer. The rest of T093 (no sideways
 * overflow at 412 px) is `tests/e2e/layout.spec.ts`.
 */
const SRC = join(import.meta.dirname, '..', '..', '..', 'src')

function sourceFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name), ext)
      : ext.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? cssFiles(join(dir, e.name))
      : e.name.endsWith('.css')
        ? [join(dir, e.name)]
        : [],
  )
}

/** Each file with comments removed, so a rule that is only described in a comment never counts. */
const FILES = cssFiles(SRC).map((path) => ({
  name: relative(SRC, path).split(sep).join('/'),
  css: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))

describe('css files', () => {
  it('finds the stylesheets', () => {
    expect(FILES.length).toBeGreaterThan(30)
  })

  it('uses logical properties only (no left/right)', () => {
    const physical =
      /(^|[\s;{])(left|right)\s*:|(margin|padding|border)-(left|right)\b|border-(top|bottom)-(left|right)-radius|text-align\s*:\s*(left|right)|float\s*:|\b(scroll-margin|scroll-padding)-(left|right)/
    const found = FILES.filter((f) => physical.test(f.css)).map((f) => f.name)
    expect(found).toEqual([])
  })

  it('has no text smaller than 12px', () => {
    const small: string[] = []
    for (const f of FILES) {
      for (const m of f.css.matchAll(/font-size\s*:\s*([\d.]+)px/g)) {
        if (Number(m[1]) < 12) small.push(`${f.name}: ${m[0]}`)
      }
    }
    expect(small).toEqual([])
    const tokens = FILES.find((f) => f.name === 'ui/tokens.css')?.css ?? ''
    const scale = [...tokens.matchAll(/--text-\w+:\s*(\d+)px/g)].map((m) => Number(m[1]))
    expect(scale.length).toBeGreaterThan(0)
    expect(Math.min(...scale)).toBeGreaterThanOrEqual(12)
  })
})

describe('motion', () => {
  // The count-match tick draws itself with stroke-dashoffset: the one named exception,
  // ui-inspiration.md "Count-match tick" (a 16 px glyph, so no layout or compositor cost).
  const DRAWN = new Set(['ui/components/StatusDot.module.css'])

  it('animates only transform and opacity in keyframes', () => {
    const bad: string[] = []
    for (const f of FILES) {
      for (const k of f.css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
        for (const p of (k[2] ?? '').matchAll(/([\w-]+)\s*:/g)) {
          const prop = p[1] ?? ''
          const ok =
            prop === 'opacity' ||
            prop === 'transform' ||
            (DRAWN.has(f.name) && prop === 'stroke-dashoffset')
          if (!ok) bad.push(`${f.name} @keyframes ${k[1]}: ${prop}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('transitions only transform and opacity', () => {
    const bad: string[] = []
    for (const f of FILES) {
      for (const t of f.css.matchAll(/transition\s*:([^;]*);/g)) {
        for (const part of (t[1] ?? '').split(',')) {
          const prop = part.trim().split(/\s+/)[0] ?? ''
          if (prop !== 'opacity' && prop !== 'transform' && prop !== 'none')
            bad.push(`${f.name}: ${part.trim()}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('answers prefers-reduced-motion wherever something moves', () => {
    const missing = FILES.filter(
      (f) =>
        /@keyframes|animation\s*:|animation-name|transition\s*:/.test(f.css) &&
        !f.css.includes('prefers-reduced-motion'),
    ).map((f) => f.name)
    expect(missing).toEqual([])
  })
})

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function ratio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

describe('colour tokens', () => {
  const css = FILES.find((f) => f.name === 'ui/tokens.css')?.css ?? ''
  const t: Record<string, string> = {}
  for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) t[m[1] ?? ''] = m[2] ?? ''

  // Text pairs need 4.5:1 (WCAG AA). Dim light is the working condition, so none is waived.
  // Body text sits on the ground or a panel; the state inks are the text form of each state;
  // ink-on-fill is the text on a state tile or a state badge.
  const TEXT: readonly (readonly [string, string])[] = [
    ['bone', 'ground'],
    ['bone', 'panel'],
    ['bone', 'panel-2'],
    ['muted', 'ground'],
    ['muted', 'panel'],
    ['muted', 'panel-2'],
    ['muted', 'tint-neutral'],
    ['count-ink', 'ground'],
    ['count-ink', 'panel'],
    ['count-ink', 'panel-2'],
    ['count-ink', 'tint-marker'],
    ['short-ink', 'ground'],
    ['short-ink', 'panel'],
    ['short-ink', 'tint-miss'],
    ['ok-ink', 'ground'],
    ['ok-ink', 'panel'],
    ['ok-ink', 'panel-2'],
    ['attn', 'ground'],
    ['attn', 'panel'],
    ['attn', 'panel-2'],
    ['attn', 'tint-amber'],
    ['bone', 'tint-miss'],
    ['bone', 'tint-amber'],
    ['bone', 'tint-marker'],
    ['disabled-ink', 'disabled-bg'],
    ['ink-on-fill', 'ok'],
    ['ink-on-fill', 'short'],
    ['ink-on-fill', 'attn'],
    ['ink-on-fill', 'count'],
    ['ground', 'bone'], // the reversed primary button
    ['bone', 'seal'], // the posted seal and the approve button
  ]
  it.each(TEXT)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], fg).toBeDefined()
    expect(t[bg], bg).toBeDefined()
    expect(ratio(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(4.5)
  })

  // Large text (the 40 px stepper numeral, the 46 px tile numerals) needs 3:1.
  it.each([
    ['count', 'panel'],
    ['count', 'ground'],
  ] as const)('%s numerals on %s are at least 3:1', (fg, bg) => {
    expect(ratio(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(3)
  })

  // Non-text parts that carry meaning need 3:1 (WCAG 1.4.11): the edge of an input, a state fill
  // against the ground it sits on.
  it.each([
    ['control-line', 'panel'],
    ['control-line', 'ground'],
    ['ok', 'ground'],
    ['short', 'ground'],
    ['attn', 'ground'],
    ['count', 'ground'],
  ] as const)('%s against %s is at least 3:1', (fg, bg) => {
    expect(ratio(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(3)
  })

  it('is dark only: the document asks for dark form controls and scrollbars', () => {
    expect(css).toMatch(/color-scheme:\s*dark/)
    expect(css).not.toMatch(/prefers-color-scheme/)
  })

  it('has no gradients anywhere in the stylesheets', () => {
    const found = FILES.filter((f) => /gradient\(/.test(f.css)).map((f) => f.name)
    expect(found).toEqual([])
  })
})

describe('legacy token names', () => {
  // The names of the old whiteboard-and-scrub palette. Every screen now uses the status-board
  // tokens (--ground, --panel, --bone, --hair, --count-ink, --short-ink, --ok-ink, --attn).
  const LEGACY =
    /--(?:board|surface|ink|line|hairline|marker|miss|match|amber|scrub|scrub-2|on-scrub)(?![\w-])/g

  it('are neither defined nor used anywhere in src', () => {
    const found: string[] = []
    for (const path of sourceFiles(SRC, /\.(css|ts|tsx)$/)) {
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(LEGACY)) {
        found.push(`${relative(SRC, path).split(sep).join('/')}: ${m[0]}`)
      }
    }
    expect(found).toEqual([])
  })

  it('does not trip on the status-board names that contain them', () => {
    const text =
      'var(--ink-on-fill) var(--ok-ink) var(--control-line) var(--amber-line) var(--tint-miss)'
    expect(text.match(LEGACY)).toBeNull()
  })
})
