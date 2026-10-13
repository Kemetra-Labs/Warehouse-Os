import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../../../src/ui/components/BottomSheet'
import { CountTable, rowState } from '../../../src/ui/components/CountTable'
import { hintFor, SearchBox } from '../../../src/ui/components/SearchBox'
import { Seal } from '../../../src/ui/components/Seal'
import { StatusDot } from '../../../src/ui/components/StatusDot'
import { SyncPill } from '../../../src/ui/components/SyncPill'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(el: ReactElement): void {
  act(() => root.render(el))
}

describe('CountTable', () => {
  it('derives match / miss and shows substitute lines as matches', () => {
    expect(rowState({ key: 'a', name: 'a', requested: 6, delivered: 6 })).toBe('match')
    expect(rowState({ key: 'a', name: 'a', requested: 6, delivered: 4 })).toBe('miss')
    expect(rowState({ key: 'a', name: 'a', requested: null, delivered: 2 })).toBe('match')
  })

  it('renders the four columns and a glyphed dot per row', () => {
    render(
      <CountTable
        caption="دفعة صرف 14"
        rows={[
          { key: '1', name: 'مسمار', requested: 24, delivered: 24 },
          { key: '2', name: 'نخاعي', requested: 6, delivered: 4 },
        ]}
      />,
    )
    const heads = [...host.querySelectorAll('th')].map((h) => h.textContent)
    expect(heads.slice(0, 3)).toEqual(['صنف', 'مطلوب', 'اتسلّم'])
    const dots = [...host.querySelectorAll('[role="img"]')]
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['مطابق', 'ناقص أو زائد'])
    expect(host.querySelectorAll('svg path')).toHaveLength(2)
  })
})

describe('CountTable labels', () => {
  it('can relabel the columns for the receiving double count', () => {
    render(
      <CountTable
        caption="استلام"
        labels={{ requested: 'الفاتورة', delivered: 'اتعدّ' }}
        rows={[{ key: '1', name: 'مسمار', requested: 50, delivered: 48 }]}
      />,
    )
    const heads = [...host.querySelectorAll('th')].map((h) => h.textContent)
    expect(heads.slice(0, 3)).toEqual(['صنف', 'الفاتورة', 'اتعدّ'])
  })
})

describe('StatusDot', () => {
  it('has an aria-label and a glyph for every state', () => {
    for (const state of ['match', 'miss', 'warn'] as const) {
      render(<StatusDot state={state} />)
      expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBeTruthy()
      expect(host.querySelector('path')?.getAttribute('d')).toBeTruthy()
    }
  })
})

describe('Seal', () => {
  it('labels posted and cancelled seals in Arabic', () => {
    render(<Seal date="12/10/2026" docNumber="دفعة 14" />)
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('معتمد 12/10/2026 دفعة 14')
    render(<Seal variant="cancelled" date="12/10/2026" docNumber="دفعة 14" />)
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toContain('ملغي')
  })
})

describe('SearchBox', () => {
  it('hints what the input was understood as', () => {
    expect(hintFor('')).toBeNull()
    expect(hintFor('8')).toBe('فهمتها: صفحة')
    expect(hintFor('6221234567893')).toBe('فهمتها: GTIN')
    expect(hintFor('nal-04')).toBe('فهمتها: كود')
    expect(hintFor('مسمار')).toBe('فهمتها: اسم')
  })

  it('has inputmode=search and resolves on submit', () => {
    const onResolve = vi.fn()
    render(<SearchBox onResolve={onResolve} />)
    const input = host.querySelector('input')
    expect(input?.getAttribute('inputmode')).toBe('search')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'NAL-04')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onResolve).toHaveBeenCalledWith({ kind: 'code', code: 'NAL-04' })
  })
})

describe('SearchBox clearOnSubmit', () => {
  it('empties the field after a submit so the next lookup starts clean', () => {
    const onResolve = vi.fn()
    render(<SearchBox onResolve={onResolve} clearOnSubmit />)
    const input = host.querySelector('input') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '10')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onResolve).toHaveBeenCalledWith({ kind: 'page', page: 10 })
    expect(input.value).toBe('')
  })
})

describe('SyncPill', () => {
  it('renders the Arabic label per state and a retry button when failed', () => {
    const onRetry = vi.fn()
    render(<SyncPill state={{ kind: 'pending', count: 3 }} />)
    expect(host.textContent).toBe('3 مستنية النت')
    render(<SyncPill state={{ kind: 'synced', count: 0 }} />)
    expect(host.textContent).toBe('متزامن')
    render(<SyncPill state={{ kind: 'failed', count: 2 }} onRetry={onRetry} />)
    const btn = host.querySelector('button')
    expect(btn?.textContent).toBe('فشل الإرسال')
    act(() => btn?.click())
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('BottomSheet', () => {
  it('is an accessible dialog that closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open title="بديل" onClose={onClose}>
        <button type="button">صرف</button>
      </BottomSheet>,
    )
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when closed', () => {
    render(
      <BottomSheet open={false} title="بديل" onClose={() => undefined}>
        x
      </BottomSheet>,
    )
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
})
