import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Num } from '../../../src/ui/components/Num'
import { Seal } from '../../../src/ui/components/Seal'
import { postedHaptic } from '../../../src/ui/haptics'

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
  vi.unstubAllGlobals()
})

function render(el: ReactElement): void {
  act(() => root.render(el))
}

const span = (): HTMLElement => host.querySelector('span') as HTMLElement

describe('Num (the quantity change motion)', () => {
  it('does not animate on the first render', () => {
    render(<Num value={4} />)
    expect(span().textContent).toBe('4')
    expect(span().className).not.toMatch(/fade|shake/)
  })

  it('cross-fades when the value changes', () => {
    render(<Num value={4} />)
    render(<Num value={5} />)
    expect(span().textContent).toBe('5')
    expect(span().className).toMatch(/fade/)
  })

  it('shakes instead when a changed count is a mismatch', () => {
    render(<Num value={4} miss />)
    render(<Num value={3} miss />)
    expect(span().className).toMatch(/shake/)
  })

  it('stays still when a re-render brings the same value', () => {
    render(<Num value={4} />)
    render(<Num value={4} />)
    expect(span().className).not.toMatch(/fade|shake/)
  })
})

describe('postedHaptic', () => {
  it('buzzes once, 30 ms, where the device can', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    postedHaptic()
    expect(vibrate).toHaveBeenCalledOnce()
    expect(vibrate).toHaveBeenCalledWith(30)
  })

  it('does nothing, and does not throw, with no vibration support', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined })
    expect(() => postedHaptic()).not.toThrow()
  })

  it('is not tied to showing a seal: rendering one never vibrates', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    render(<Seal date="12/10/2026" docNumber="دفعة 14" />)
    expect(vibrate).not.toHaveBeenCalled()
  })
})
