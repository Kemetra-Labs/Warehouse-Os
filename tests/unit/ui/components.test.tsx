import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../../../src/ui/components/BottomSheet'
import { CountTable, rowState } from '../../../src/ui/components/CountTable'
import { hintFor, SearchBox, stepIndex } from '../../../src/ui/components/SearchBox'
import { press, type as typeInto } from '../../helpers/dom'
import { ITEMS } from '../../helpers/receiptFixtures'
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

describe('SearchBox suggestions', () => {
  const onResolve = vi.fn()
  const onPickItem = vi.fn()
  const input = () => host.querySelector('input') as HTMLInputElement
  const options = () => [...host.querySelectorAll('[role="option"]')]
  const mount = () =>
    render(
      <SearchBox clearOnSubmit onResolve={onResolve} suggestFrom={ITEMS} onPickItem={onPickItem} />,
    )

  beforeEach(() => {
    onResolve.mockClear()
    onPickItem.mockClear()
  })

  it('steps through the options and wraps at both ends', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0)
    expect(stepIndex(-1, 3, -1)).toBe(2)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(0, 0, 1)).toBe(-1)
  })

  it('shows nothing for empty input, and is a combobox pointing at its listbox', () => {
    mount()
    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('[role="listbox"]')).toBeNull()
    expect(host.textContent).not.toContain('مفيش صنف')
  })

  it('lists the matching items as you type, with name, page and code', () => {
    mount()
    typeInto(input(), '2')
    const list = host.querySelector('[role="listbox"]')
    expect(list?.id).toBe(input().getAttribute('aria-controls'))
    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(options().map((o) => o.textContent)).toEqual([
      'صنف تجريبي باءص 2 · AAA-02',
      'صنف تجريبي جيمص 2 · BBB-01',
    ])
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('says so when nothing matches', () => {
    mount()
    typeInto(input(), 'كرسي')
    expect(options()).toHaveLength(0)
    expect(host.textContent).toContain('مفيش صنف بالرقم أو الاسم ده')
    expect(input().getAttribute('aria-expanded')).toBe('false')
  })

  it('a tap picks the item, empties the field and closes the list', () => {
    mount()
    typeInto(input(), '2')
    act(() => (options()[1] as HTMLElement).click())
    expect(onPickItem).toHaveBeenCalledWith(ITEMS[2])
    expect(onResolve).not.toHaveBeenCalled()
    expect(input().value).toBe('')
    expect(host.querySelector('[role="listbox"]')).toBeNull()
  })

  it('arrow keys highlight an option, and Enter picks it instead of submitting', () => {
    mount()
    typeInto(input(), '2')
    press(input(), 'ArrowDown')
    press(input(), 'ArrowDown')
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1]?.id)
    press(input(), 'ArrowUp')
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
    const enter = press(input(), 'Enter')
    expect(enter.defaultPrevented).toBe(true)
    expect(onPickItem).toHaveBeenCalledWith(ITEMS[1])
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('Enter with no highlighted option still submits the text, as before', () => {
    mount()
    typeInto(input(), '4')
    expect(options()).toHaveLength(1)
    const enter = press(input(), 'Enter')
    expect(enter.defaultPrevented).toBe(false)
    act(() => {
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onResolve).toHaveBeenCalledWith({ kind: 'page', page: 4 })
    expect(onPickItem).not.toHaveBeenCalled()
  })

  it('Escape closes the list, keeps the text, and typing opens it again', () => {
    mount()
    typeInto(input(), '2')
    const esc = press(input(), 'Escape')
    expect(esc.defaultPrevented).toBe(true)
    expect(host.querySelector('[role="listbox"]')).toBeNull()
    expect(input().value).toBe('2')
    typeInto(input(), '21')
    typeInto(input(), '2')
    expect(options()).toHaveLength(2)
  })

  it('leaves the field a plain search box when no suggestions are asked for', () => {
    render(<SearchBox onResolve={onResolve} />)
    expect(input().getAttribute('role')).toBeNull()
    typeInto(input(), '2')
    expect(host.querySelector('[role="listbox"]')).toBeNull()
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
