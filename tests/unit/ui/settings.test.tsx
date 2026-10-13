import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/data/convert'
import type { Settled } from '../../../src/data/settle'
import type { Settings } from '../../../src/domain/types'
import { SettingsView } from '../../../src/ui/screens/Settings'
import { buttonByText, click, flush, inputByLabel, type } from '../../helpers/dom'

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

const COVERAGE = 'مدة التغطية'
const DEFAULT_REORDER = 'الحد الافتراضي'

type Save = (patch: { coverageMonths: number; defaultReorder: number }) => Promise<Settled>

function view(settings: Settings, save: Save = () => Promise.resolve('saved')): ReactElement {
  return (
    <MemoryRouter>
      <SettingsView settings={settings} items={[]} movements={[]} save={save} />
    </MemoryRouter>
  )
}

const render = (el: ReactElement): void => act(() => root.render(el))
const saveButton = (): HTMLButtonElement | null => buttonByText(host, 'حفظ')

describe('SettingsView', () => {
  it('shows the stored settings', () => {
    render(view({ ...DEFAULT_SETTINGS, coverageMonths: 2, defaultReorder: 7 }))
    expect(inputByLabel(host, COVERAGE)?.value).toBe('2')
    expect(inputByLabel(host, DEFAULT_REORDER)?.value).toBe('7')
  })

  it('shows settings that arrive after the screen opened, as long as nothing was typed', () => {
    render(view(DEFAULT_SETTINGS)) // the defaults a cold start shows first
    expect(inputByLabel(host, COVERAGE)?.value).toBe('1.5')
    render(view({ ...DEFAULT_SETTINGS, coverageMonths: 3, defaultReorder: 9 }))
    expect(inputByLabel(host, COVERAGE)?.value).toBe('3')
    expect(inputByLabel(host, DEFAULT_REORDER)?.value).toBe('9')
    expect(saveButton()?.disabled).toBe(true) // nothing changed: saving would write the same values
  })

  it('keeps what the user typed when the stored settings change underneath', () => {
    render(view(DEFAULT_SETTINGS))
    type(inputByLabel(host, COVERAGE) ?? null, '4')
    render(view({ ...DEFAULT_SETTINGS, coverageMonths: 3 }))
    expect(inputByLabel(host, COVERAGE)?.value).toBe('4')
  })

  it('refuses coverage of zero and a default below 1, and cannot save them', () => {
    render(view(DEFAULT_SETTINGS))
    type(inputByLabel(host, COVERAGE) ?? null, '0')
    expect(host.textContent).toContain('مدة التغطية لازم تكون أكتر من صفر')
    expect(saveButton()?.disabled).toBe(true)
    type(inputByLabel(host, COVERAGE) ?? null, '2')
    type(inputByLabel(host, DEFAULT_REORDER) ?? null, '0')
    expect(host.textContent).toContain('الحد الافتراضي لازم يكون رقم صحيح')
    expect(saveButton()?.disabled).toBe(true)
  })

  it('never saves a half-typed value as the number it used to be', () => {
    render(view(DEFAULT_SETTINGS))
    type(inputByLabel(host, COVERAGE) ?? null, '2x')
    expect(saveButton()?.disabled).toBe(true)
  })

  it('saves the two values and says it is saved', async () => {
    const save = vi.fn<Save>().mockResolvedValue('saved')
    render(view(DEFAULT_SETTINGS, save))
    type(inputByLabel(host, COVERAGE) ?? null, '2.5')
    type(inputByLabel(host, DEFAULT_REORDER) ?? null, '8')
    click(saveButton())
    await flush()
    expect(save).toHaveBeenCalledWith({ coverageMonths: 2.5, defaultReorder: 8 })
    expect(host.textContent).toContain('اتحفظ.')
  })

  it('says a write that is still waiting for the network is saved on the device', async () => {
    render(view(DEFAULT_SETTINGS, () => Promise.resolve('pending')))
    type(inputByLabel(host, DEFAULT_REORDER) ?? null, '6')
    click(saveButton())
    await flush()
    expect(host.textContent).toContain('اتحفظ على الجهاز')
  })

  it('says so when the server refuses', async () => {
    render(view(DEFAULT_SETTINGS, () => Promise.resolve('failed')))
    type(inputByLabel(host, DEFAULT_REORDER) ?? null, '6')
    click(saveButton())
    await flush()
    expect(host.textContent).toContain('السيرفر رفض الحفظ')
  })
})
