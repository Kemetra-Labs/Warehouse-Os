import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemRow as LedgerRow } from '../../../src/data/deriveLedger'
import { ItemRow } from '../../../src/ui/components/ItemRow'

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

const render = (el: ReactElement): void => act(() => root.render(el))

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    item: {
      code: 'SCR-01',
      page: 12,
      category: 'c',
      nameAr: 'مسمار',
      nameEn: '',
      material: '',
      size: '',
      unit: 'قطعة',
      supplier: '',
      gtins: [],
      authorityCode: null,
      priceMinor: 100,
      reorderManual: null,
      active: true,
      updatedAt: { toMillis: () => 0 } as never,
    },
    balance: 4,
    issued: 0,
    reorder: 5,
    status: 'يحتاج طلب',
    pendingSettlement: false,
    lastPostedAt: 10,
    changedSinceSeen: false,
    ...over,
  }
}

describe('ItemRow', () => {
  it('shows the balance, name, page and status with no marker when nothing changed', () => {
    render(<ItemRow row={row()} />)
    const el = host.firstElementChild
    expect(el?.textContent).toContain('مسمار')
    expect(el?.textContent).toContain('SCR-01')
    expect(el?.textContent).toContain('يحتاج طلب')
    expect(el?.getAttribute('data-changed')).toBe('false')
    expect(host.querySelector('[role="img"]')).toBeNull()
    expect(host.querySelector('button')).toBeNull()
  })

  it('marks a change that came from another device with a labelled dot', () => {
    render(<ItemRow row={row({ changedSinceSeen: true })} />)
    expect(host.firstElementChild?.getAttribute('data-changed')).toBe('true')
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('جهاز تاني')
  })

  it('names a negative balance a pending settlement', () => {
    render(<ItemRow row={row({ balance: -3, pendingSettlement: true })} />)
    expect(host.firstElementChild?.getAttribute('data-negative')).toBe('true')
    expect(host.textContent).toContain('تسوية معلّقة')
    expect(host.textContent).toContain('-3')
  })

  it('draws out as a struck square, so it differs from reorder by form and not by hue alone', () => {
    render(<ItemRow row={row({ balance: 0, status: 'نافد' })} />)
    expect(host.querySelector('svg path')).not.toBeNull()
    render(<ItemRow row={row()} />)
    expect(host.querySelector('svg')).toBeNull()
  })

  it('opens the item on tap, so its highlight can clear', () => {
    const onOpen = vi.fn()
    render(<ItemRow row={row({ changedSinceSeen: true })} onOpen={onOpen} />)
    act(() => host.querySelector('button')?.click())
    expect(onOpen).toHaveBeenCalledWith('SCR-01')
  })
})
