import { act, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemRow } from '../../../src/data/deriveLedger'
import type { ListQuery } from '../../../src/domain/items'
import { STATUS_LABELS, type Item } from '../../../src/domain/types'
import { ItemsView } from '../../../src/ui/screens/Items'
import { buttonByText, click, type } from '../../helpers/dom'
import { item } from '../../helpers/receiptFixtures'

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

const row = (it: Item, status: string, balance: number, pending = false): ItemRow => ({
  item: it,
  balance,
  issued: 0,
  reorder: 5,
  status,
  pendingSettlement: pending,
  lastPostedAt: null,
  changedSinceSeen: false,
})

const ROWS: readonly ItemRow[] = [
  row(
    item('SCR-01', { page: 1, category: 'مسامير', nameAr: 'مسمار عظم' }),
    STATUS_LABELS.AVAILABLE,
    30,
  ),
  row(
    item('SCR-02', { page: 2, category: 'مسامير', nameAr: 'مسمار نخاع' }),
    STATUS_LABELS.REORDER,
    3,
  ),
  row(item('PLT-01', { page: 3, category: 'شرائح', nameAr: 'شريحة ساق' }), STATUS_LABELS.OUT, 0),
  row(
    item('PLT-02', { page: 4, category: 'شرائح', nameAr: 'شريحة ذراع' }),
    STATUS_LABELS.OVERDRAWN,
    -2,
    true,
  ),
]

const START: ListQuery = { filter: 'all', category: null, text: '' }

/** The view with its query kept in state, as the route keeps it in the address. */
function Harness({ onOpen }: { readonly onOpen: (code: string) => void }) {
  const [query, setQuery] = useState(START)
  return <ItemsView rows={ROWS} query={query} onQueryChange={setQuery} onOpen={onOpen} />
}

const render = (el: ReactElement): void => act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))
const shown = (): string[] =>
  [...host.querySelectorAll('ul[aria-label="الأصناف"] li')].map(
    (li) => /[A-Z]{3}-\d{2}/.exec(li.textContent ?? '')?.[0] ?? '',
  )

describe('ItemsView', () => {
  it('has an Arabic heading and lists every active item by page', () => {
    render(<Harness onOpen={() => undefined} />)
    expect(host.querySelector('h1')?.textContent).toBe('الأصناف')
    expect(shown()).toEqual(['SCR-01', 'SCR-02', 'PLT-01', 'PLT-02'])
  })

  it('narrows to the items that need ordering, are out, or wait for a settlement', () => {
    render(<Harness onOpen={() => undefined} />)
    click(buttonByText(host, 'تحتاج طلب'))
    expect(shown()).toEqual(['SCR-02'])
    click(buttonByText(host, 'نافد'))
    expect(shown()).toEqual(['PLT-01'])
    click(buttonByText(host, 'تسويات معلّقة'))
    expect(shown()).toEqual(['PLT-02'])
    click(buttonByText(host, 'الكل'))
    expect(shown()).toHaveLength(4)
  })

  it('marks the chosen filter pressed and shows a count on each', () => {
    render(<Harness onOpen={() => undefined} />)
    click(buttonByText(host, 'نافد'))
    expect(buttonByText(host, 'نافد')?.getAttribute('aria-pressed')).toBe('true')
    expect(buttonByText(host, 'الكل')?.getAttribute('aria-pressed')).toBe('false')
    expect(buttonByText(host, 'تحتاج طلب')?.textContent).toContain('1')
  })

  it('fills the two state filters when they have items and hollows them at zero', () => {
    render(
      <ItemsView
        rows={ROWS.slice(0, 1)}
        query={START}
        onQueryChange={() => undefined}
        onOpen={() => undefined}
      />,
    )
    expect(buttonByText(host, 'نافد')?.getAttribute('data-zero')).toBe('true')
    expect(buttonByText(host, 'نافد')?.getAttribute('data-tone')).toBeNull()
    render(<Harness onOpen={() => undefined} />)
    expect(buttonByText(host, 'نافد')?.getAttribute('data-tone')).toBe('short')
    expect(buttonByText(host, 'تحتاج طلب')?.getAttribute('data-tone')).toBe('attn')
    expect(buttonByText(host, 'الكل')?.getAttribute('data-tone')).toBeNull()
  })

  it('filters by category, and the category list has each category once', () => {
    render(<Harness onOpen={() => undefined} />)
    const select = host.querySelector('select')
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      'كل الفئات',
      'شرائح',
      'مسامير',
    ])
    act(() => {
      if (select) select.value = 'شرائح'
      select?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(shown()).toEqual(['PLT-01', 'PLT-02'])
  })

  it('searches as the user types, by name, page or code', () => {
    render(<Harness onOpen={() => undefined} />)
    const box = host.querySelector('input[type=search]')
    type(box, 'شريحة ذراع')
    expect(shown()).toEqual(['PLT-02'])
    type(box, '2')
    expect(shown()).toEqual(['SCR-02'])
    type(box, 'scr-0')
    expect(shown()).toEqual(['SCR-01', 'SCR-02'])
  })

  it('says when nothing matches', () => {
    render(<Harness onOpen={() => undefined} />)
    type(host.querySelector('input[type=search]'), 'مفيش زي كده')
    expect(shown()).toEqual([])
    expect(host.textContent).toContain('مفيش أصناف بالشروط دي')
  })

  it('opens an item card when a row is tapped', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    click(host.querySelectorAll('ul[aria-label="الأصناف"] button')[1] ?? null)
    expect(onOpen).toHaveBeenCalledWith('SCR-02')
  })

  it('links to the add form, and to the import when there are no items', () => {
    render(
      <ItemsView
        rows={[]}
        query={START}
        onQueryChange={() => undefined}
        onOpen={() => undefined}
      />,
    )
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/items/new')
    expect(hrefs).toContain('/import')
  })
})
