import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Scanner } from '../../../src/scan/Scanner'
import type { ScanCode, ScanSession, ScanSource } from '../../../src/scan/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const EAN: ScanCode = { rawValue: '6001234567890', format: 'ean_13' }
const OTHER: ScanCode = { rawValue: '6001234567891', format: 'ean_13' }

interface Harness {
  readonly source: ScanSource
  emit(code: ScanCode): void
  readonly session: { setPaused: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }
  readonly start: ReturnType<typeof vi.fn>
}

function harness(opts: { camera?: boolean; startFails?: boolean } = {}): Harness {
  let handler: (c: ScanCode) => void = () => undefined
  const session = { setPaused: vi.fn(), stop: vi.fn() }
  const start = vi.fn((_video: HTMLVideoElement, onCode: (c: ScanCode) => void) => {
    handler = onCode
    return opts.startFails
      ? Promise.reject(new Error('refused'))
      : Promise.resolve(session as ScanSession)
  })
  return {
    source: { hasCamera: () => Promise.resolve(opts.camera ?? true), start },
    emit: (c) => handler(c),
    session,
    start,
  }
}

let host: HTMLDivElement
let root: Root
const vibrate = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
  vibrate.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

async function mount(h: Harness, props: Partial<Parameters<typeof Scanner>[0]> = {}) {
  const onCode = vi.fn((): 'known' | 'unknown' => 'known')
  await act(async () => {
    root.render(<Scanner source={h.source} onCode={onCode} {...props} />)
  })
  return onCode
}

const button = () => host.querySelector('button')
const outline = () => host.querySelector('[data-feedback]')

describe('Scanner', () => {
  it('starts the camera and the whole view is one button', async () => {
    const h = harness()
    await mount(h)
    expect(h.start).toHaveBeenCalledOnce()
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(button()?.querySelector('video')).not.toBeNull()
  })

  it('shows a green outline with a tick for a known code, and vibrates', async () => {
    const h = harness()
    const onCode = await mount(h)
    act(() => h.emit(EAN))
    expect(onCode).toHaveBeenCalledWith(EAN)
    expect(outline()?.getAttribute('data-feedback')).toBe('known')
    expect(outline()?.querySelector('svg path')?.getAttribute('d')).toBeTruthy()
    expect(vibrate).toHaveBeenCalledWith(40)
  })

  it('shows a red outline with a cross for an unknown code, with the error vibration', async () => {
    const h = harness()
    await mount(h, { onCode: () => 'unknown' })
    act(() => h.emit(EAN))
    expect(outline()?.getAttribute('data-feedback')).toBe('unknown')
    expect(outline()?.textContent).toContain('مش معروف')
    expect(vibrate).toHaveBeenCalledWith([30, 60, 30])
  })

  it('does not rely on colour: the glyphs differ between known and unknown', async () => {
    const h = harness()
    const kinds: ('known' | 'unknown')[] = ['known', 'unknown']
    await mount(h, { onCode: () => kinds.shift() ?? 'known' })
    act(() => h.emit(EAN))
    const tick = outline()?.querySelector('path')?.getAttribute('d')
    act(() => vi.advanceTimersByTime(2000))
    act(() => h.emit(OTHER))
    expect(outline()?.querySelector('path')?.getAttribute('d')).not.toBe(tick)
  })

  it('clears the outline after a moment', async () => {
    const h = harness()
    await mount(h)
    act(() => h.emit(EAN))
    expect(outline()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(outline()).toBeNull()
  })

  it('counts a code held in view once, not once per frame', async () => {
    const h = harness()
    const onCode = await mount(h)
    act(() => h.emit(EAN))
    for (let i = 0; i < 10; i++) {
      act(() => vi.advanceTimersByTime(100))
      act(() => h.emit(EAN))
    }
    expect(onCode).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(2000))
    act(() => h.emit(EAN))
    expect(onCode).toHaveBeenCalledTimes(2)
  })

  it('counts a box once when it shows both its EAN-13 and its GS1 DataMatrix', async () => {
    const h = harness()
    const onCode = await mount(h)
    const matrix: ScanCode = { rawValue: '0106001234567890\x1d10LOT7', format: 'data_matrix' }
    for (let i = 0; i < 20; i++) {
      act(() => h.emit(i % 2 === 0 ? EAN : matrix))
      act(() => vi.advanceTimersByTime(150))
    }
    expect(onCode).toHaveBeenCalledTimes(1)
  })

  it('a tap pauses and resumes continuous scanning', async () => {
    const h = harness()
    const onCode = await mount(h)
    act(() => button()?.click())
    expect(h.session.setPaused).toHaveBeenLastCalledWith(true)
    expect(button()?.getAttribute('aria-pressed')).toBe('true')
    act(() => h.emit(EAN))
    expect(onCode).not.toHaveBeenCalled()
    act(() => button()?.click())
    expect(h.session.setPaused).toHaveBeenLastCalledWith(false)
    act(() => h.emit(EAN))
    expect(onCode).toHaveBeenCalledOnce()
  })

  it('hides itself and says so when there is no camera', async () => {
    const h = harness({ camera: false })
    const onUnavailable = vi.fn()
    await mount(h, { onUnavailable })
    expect(host.querySelector('button')).toBeNull()
    expect(host.querySelector('video')).toBeNull()
    expect(onUnavailable).toHaveBeenCalledOnce()
    expect(h.start).not.toHaveBeenCalled()
  })

  it('hides itself when the camera is refused', async () => {
    const h = harness({ startFails: true })
    const onUnavailable = vi.fn()
    await mount(h, { onUnavailable })
    expect(host.querySelector('button')).toBeNull()
    expect(onUnavailable).toHaveBeenCalledOnce()
  })

  it('never opens the camera if it unmounts before the camera check finishes', async () => {
    const h = harness()
    await act(async () => {
      root.render(<Scanner source={h.source} onCode={() => 'known'} />)
      root.render(<div />)
    })
    expect(h.start).not.toHaveBeenCalled()
  })

  it('stops the camera when it unmounts', async () => {
    const h = harness()
    await mount(h)
    act(() => root.unmount())
    expect(h.session.stop).toHaveBeenCalledOnce()
    root = createRoot(host) // keep afterEach happy
  })
})
