import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/data/convert'
import type { DataValue } from '../../../src/data/DataProvider'
import type { Settings } from '../../../src/domain/types'
import { BackupReminder } from '../../../src/ui/components/BackupReminder'
import { PrintButton } from '../../../src/ui/components/PrintButton'
import { ExportBackup } from '../../../src/ui/screens/ExportBackup'
import { ExportLedger } from '../../../src/ui/screens/ExportLedger'
import { ExportPrints } from '../../../src/ui/screens/ExportPrints'
import { buttonByText, click, flush } from '../../helpers/dom'
import { issueDoc, item, mov, receiptDoc, ts } from '../../helpers/exportFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  downloadLedgerRows: vi.fn(),
  downloadBackup: vi.fn(),
  downloadReceiptPrint: vi.fn(),
  downloadIssuePrint: vi.fn(),
  markLedgerExported: vi.fn(),
  markBackupDone: vi.fn(),
}))

vi.mock('../../../src/data/DataProvider', () => ({ useData: () => mocks.data }))
vi.mock('../../../src/data/repos/settings', () => ({
  markLedgerExported: mocks.markLedgerExported,
  markBackupDone: mocks.markBackupDone,
}))
vi.mock('../../../src/ui/screens/exportActions', () => ({
  downloadLedgerRows: mocks.downloadLedgerRows,
  downloadBackup: mocks.downloadBackup,
  downloadReceiptPrint: mocks.downloadReceiptPrint,
  downloadIssuePrint: mocks.downloadIssuePrint,
}))

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  for (const fn of [
    mocks.downloadLedgerRows,
    mocks.downloadBackup,
    mocks.downloadReceiptPrint,
    mocks.downloadIssuePrint,
    mocks.markLedgerExported,
    mocks.markBackupDone,
  ]) {
    fn.mockReset().mockResolvedValue(undefined)
  }
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function setData(over: Partial<DataValue> & { settings?: Settings } = {}): void {
  mocks.data = {
    status: 'ready',
    items: [item('SCR-01'), item('SCR-02')],
    movements: [],
    settings: DEFAULT_SETTINGS,
    receipts: [],
    issueBatches: [],
    ...over,
  }
}

async function mount(el: ReactElement): Promise<void> {
  await act(async () => root.render(<MemoryRouter>{el}</MemoryRouter>))
  await flush()
}

const text = (): string => host.textContent ?? ''
const testId = (id: string): Element | null => host.querySelector(`[data-testid="${id}"]`)

describe('ExportLedger', () => {
  const fresh = [mov({ id: 'a' }), mov({ id: 'b', businessDate: '2026-10-13' })]
  const old = mov({ id: 'old' })
  const imported = mov({ id: 'imp-r5', source: { kind: 'import', id: null, row: 5 } })

  it('counts only new, unexported, non-imported movements', async () => {
    setData({
      movements: [...fresh, old, imported],
      settings: { ...DEFAULT_SETTINGS, lastLedgerExportedIds: ['old'] },
    })
    await mount(<ExportLedger />)
    expect(testId('ledger-count')?.textContent).toContain('2')
    expect(buttonByText(host, 'نزّل ملف السطور (2)')?.disabled).toBe(false)
    // "تم اللصق" is not offered before a file was downloaded.
    expect(buttonByText(host, 'تم اللصق')).toBeNull()
  })

  it('shows the numbered steps with Skip blanks', async () => {
    setData({ movements: fresh })
    await mount(<ExportLedger />)
    const steps = [...host.querySelectorAll('ol li')].map((li) => li.textContent ?? '')
    expect(steps).toHaveLength(6)
    expect(steps.join(' ')).toContain('Skip blanks')
    expect(steps.join(' ')).toContain('A1:R2')
  })

  it('is empty right after an import: no download, a message instead', async () => {
    setData({ movements: [imported] })
    await mount(<ExportLedger />)
    expect(text()).toContain('مفيش سطور جديدة')
    expect(buttonByText(host, 'نزّل ملف السطور (0)')?.disabled).toBe(true)
  })

  it('records exactly the ids of the downloaded file when "تم اللصق" is pressed', async () => {
    setData({ movements: fresh })
    await mount(<ExportLedger />)
    click(buttonByText(host, 'نزّل ملف السطور (2)'))
    await flush()
    expect(mocks.downloadLedgerRows).toHaveBeenCalledTimes(1)
    expect(mocks.markLedgerExported).not.toHaveBeenCalled()

    // A movement arrives after the download: it was never pasted, so it must not be marked.
    setData({ movements: [...fresh, mov({ id: 'late' })] })
    await mount(<ExportLedger />)
    click(buttonByText(host, 'تم اللصق'))
    await flush()
    expect(mocks.markLedgerExported).toHaveBeenCalledWith(['a', 'b'])
    expect(testId('ledger-pasted')?.textContent).toContain('2')
    expect(buttonByText(host, 'تم اللصق')).toBeNull()
  })

  it('still offers "تم اللصق" after the screen is closed and opened again', async () => {
    setData({ movements: fresh })
    await mount(<ExportLedger />)
    click(buttonByText(host, 'نزّل ملف السطور (2)'))
    await flush()

    // The tab was discarded between the download (phone) and the paste (PC).
    act(() => root.unmount())
    root = createRoot(host)
    setData({ movements: [...fresh, mov({ id: 'late' })] })
    await mount(<ExportLedger />)
    click(buttonByText(host, 'تم اللصق'))
    await flush()
    expect(mocks.markLedgerExported).toHaveBeenCalledWith(['a', 'b'])

    // Confirmed: a fresh open no longer offers it.
    act(() => root.unmount())
    root = createRoot(host)
    await mount(<ExportLedger />)
    expect(buttonByText(host, 'تم اللصق')).toBeNull()
  })

  it('goes back to empty once the ids are recorded', async () => {
    setData({
      movements: fresh,
      settings: { ...DEFAULT_SETTINGS, lastLedgerExportedIds: ['a', 'b'] },
    })
    await mount(<ExportLedger />)
    expect(text()).toContain('مفيش سطور جديدة')
  })

  it('does not offer "تم اللصق" when the download failed', async () => {
    setData({ movements: fresh })
    mocks.downloadLedgerRows.mockRejectedValue(new Error('boom'))
    await mount(<ExportLedger />)
    click(buttonByText(host, 'نزّل ملف السطور (2)'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ما قدرناش نجهّز الملف')
    expect(buttonByText(host, 'تم اللصق')).toBeNull()
  })

  it('warns when the rows would run past row 595', async () => {
    const used = mov({ id: 'imp-r590', source: { kind: 'import', id: null, row: 590 } })
    setData({ movements: [used, ...Array.from({ length: 7 }, (_, i) => mov({ id: `n${i}` }))] })
    await mount(<ExportLedger />)
    expect(testId('ledger-capacity')?.textContent).toContain('كبّر الجدول')
  })
})

describe('ExportBackup', () => {
  it('says there is no backup yet, then downloads and records the time', async () => {
    setData()
    await mount(<ExportBackup />)
    expect(testId('backup-status')?.textContent).toContain('لسه ما اتعملتش')
    click(buttonByText(host, 'نزّل نسخة احتياطية'))
    await flush()
    expect(mocks.downloadBackup).toHaveBeenCalledTimes(1)
    expect(mocks.markBackupDone).toHaveBeenCalledTimes(1)
    expect(testId('backup-done')).not.toBeNull()
  })

  it('does not record a backup that failed to build', async () => {
    setData()
    mocks.downloadBackup.mockRejectedValue(new Error('boom'))
    await mount(<ExportBackup />)
    click(buttonByText(host, 'نزّل نسخة احتياطية'))
    await flush()
    expect(mocks.markBackupDone).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ما قدرناش')
  })

  it('shows the last backup and flags one older than 7 days', async () => {
    setData({ settings: { ...DEFAULT_SETTINGS, lastBackupAt: ts(Date.now() - 9 * 86_400_000) } })
    await mount(<ExportBackup />)
    expect(testId('backup-status')?.textContent).toContain('أكتر من 7 أيام')
  })
})

describe('BackupReminder', () => {
  it('shows when no backup was ever made and the store has data', async () => {
    setData()
    await mount(<BackupReminder />)
    expect(testId('backup-reminder')?.textContent).toContain('لسه ما اتعملتش نسخة')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/exports')
  })

  it('says how many days when the last one is old', async () => {
    setData({ settings: { ...DEFAULT_SETTINGS, lastBackupAt: ts(Date.now() - 10 * 86_400_000) } })
    await mount(<BackupReminder />)
    expect(testId('backup-reminder')?.textContent).toContain('عدّى 10 يوم')
  })

  it('stays quiet after a recent backup, on an empty store, and while loading', async () => {
    setData({ settings: { ...DEFAULT_SETTINGS, lastBackupAt: ts(Date.now() - 86_400_000) } })
    await mount(<BackupReminder />)
    expect(testId('backup-reminder')).toBeNull()
    setData({ items: [], movements: [] })
    await mount(<BackupReminder />)
    expect(testId('backup-reminder')).toBeNull()
    setData({ status: 'loading' })
    await mount(<BackupReminder />)
    expect(testId('backup-reminder')).toBeNull()
  })
})

describe('ExportPrints', () => {
  it('lists posted and cancelled documents, not drafts, and prints the one chosen', async () => {
    const receipt = receiptDoc()
    const batch = issueDoc({ status: 'cancelled' })
    setData({
      receipts: [receipt, receiptDoc({ id: 'draft', status: 'draft' })],
      issueBatches: [batch],
      movements: [],
    })
    await mount(<ExportPrints />)
    const rows = [...host.querySelectorAll('[data-testid="print-row"]')]
    expect(rows).toHaveLength(2)
    expect(text()).toContain('ملغي')
    const receiptRow = rows.find((r) => r.textContent?.includes('استلام'))
    click(receiptRow?.querySelector('button') ?? null)
    await flush()
    expect(mocks.downloadReceiptPrint).toHaveBeenCalledWith(
      expect.objectContaining({ receipt: expect.objectContaining({ id: 'r1' }) }),
    )
    const issueRow = rows.find((r) => r.textContent?.includes('صرف'))
    click(issueRow?.querySelector('button') ?? null)
    await flush()
    expect(mocks.downloadIssuePrint).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing is posted yet', async () => {
    setData()
    await mount(<ExportPrints />)
    expect(text()).toContain('لسه مفيش')
  })
})

describe('PrintButton', () => {
  it('shows an Arabic failure as it is, and anything else as a generic message', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('الدفعة لسه بتتحمّل.'))
    await mount(<PrintButton run={run} />)
    click(buttonByText(host, 'نزّل ملف للطباعة'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('الدفعة لسه بتتحمّل.')
    run.mockRejectedValueOnce(new Error('ENOENT'))
    click(buttonByText(host, 'نزّل ملف للطباعة'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ما قدرناش نجهّز ملف الطباعة',
    )
  })
})
