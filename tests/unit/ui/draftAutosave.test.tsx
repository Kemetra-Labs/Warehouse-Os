import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useDraftAutosave,
  type AutosaveAdapter,
  type DraftAutosave,
} from '../../../src/ui/screens/useDraftAutosave'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const save = vi.fn(() => Promise.resolve())
const ADAPTER: AutosaveAdapter<string> = { save, isBlank: (d) => d === '' }

let host: HTMLDivElement
let root: Root
let autosave: DraftAutosave<string>

function Harness() {
  const hook = useDraftAutosave('doc-1', true, ADAPTER)
  useEffect(() => {
    autosave = hook
  })
  return null
}

const goHidden = () => {
  const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
  state.mockRestore()
}

beforeEach(() => {
  vi.useFakeTimers()
  save.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Harness />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('useDraftAutosave', () => {
  it('saves shortly after the last change', () => {
    autosave.schedule('a')
    autosave.schedule('ab')
    expect(save).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(600))
    expect(save).toHaveBeenCalledExactlyOnceWith('doc-1', 'ab')
  })

  it('saves at once when the app goes to the background (a phone may never wake the timer)', () => {
    autosave.schedule('abc')
    goHidden()
    expect(save).toHaveBeenCalledExactlyOnceWith('doc-1', 'abc')
    act(() => void vi.advanceTimersByTime(600))
    expect(save).toHaveBeenCalledOnce()
  })

  it('leaving the screen saves what is waiting', () => {
    autosave.schedule('abcd')
    act(() => root.render(<div />))
    expect(save).toHaveBeenCalledExactlyOnceWith('doc-1', 'abcd')
  })

  it('a change that arrives after the screen left (a child joining its open line) saves at once', () => {
    act(() => root.render(<div />)) // React cleans the parent's effects before the child's
    autosave.schedule('late line')
    expect(save).toHaveBeenCalledExactlyOnceWith('doc-1', 'late line')
  })

  it('never saves a blank new document, and nothing while paused', () => {
    autosave.schedule('')
    goHidden()
    autosave.pause()
    autosave.schedule('x')
    goHidden()
    expect(save).not.toHaveBeenCalled()
  })
})
