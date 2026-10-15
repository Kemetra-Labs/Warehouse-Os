import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlannedOp } from '../../../src/data/importWriter'
import type { RestoreStore } from '../../../src/data/restoreWriter'
import { backupFile, type BackupData } from '../../../src/excel/backup'
import { RestoreBackup } from '../../../src/ui/screens/RestoreBackup'
import { buttonByText, click, flush } from '../../helpers/dom'
import { item, mov } from '../../helpers/exportFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../src/app/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signedIn', user: { uid: 'owner-uid' } } }),
}))

const DATA: BackupData = {
  items: [item('SCR-01', { page: 1 }), item('SCR-02', { page: 2, gtins: [] })],
  movements: [
    mov({ id: 'r1-L1', itemCode: 'SCR-01', source: { kind: 'receipt', id: 'r1' } }),
    mov({ id: 'r1-L2', itemCode: 'SCR-02', source: { kind: 'receipt', id: 'r1' } }),
  ],
  receipts: [],
  issueBatches: [],
}

let host: HTMLDivElement
let root: Root
let committed: (readonly PlannedOp[])[]

function makeStore(existing: { items?: string[]; movements?: string[] } = {}): RestoreStore {
  return {
    existingItemCodes: () => Promise.resolve(new Set(existing.items ?? [])),
    existingMovementIds: () => Promise.resolve(new Set(existing.movements ?? [])),
    commit: (ops) => {
      committed.push(ops)
      return Promise.resolve()
    },
  }
}

async function mount(store: RestoreStore) {
  await act(async () => {
    root.render(<RestoreBackup makeStore={() => store} />)
  })
}

async function pick(bytes: Uint8Array | ArrayBuffer): Promise<void> {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([bytes as BlobPart], 'نسخة.xlsx')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flush()
  await flush()
}

beforeEach(() => {
  committed = []
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RestoreBackup', () => {
  it('shows what would be restored, writes nothing until the button, then restores', async () => {
    await mount(makeStore())
    await pick((await backupFile(DATA, '2026-10-12')).bytes)
    const summary = host.querySelector('[data-testid="restore-summary"]')!
    expect(summary.textContent).toContain('أصناف هتتضاف: 2')
    expect(summary.textContent).toContain('حركات هتتضاف: 2')
    expect(committed).toEqual([])

    click(buttonByText(host, 'استعد دلوقتي'))
    await flush()
    await flush()
    expect(host.querySelector('[data-testid="restore-done"]')?.textContent).toContain(
      'اتستعاد 2 صنف و2 حركة',
    )
    const ops = committed.flat()
    expect(ops.map((o) => o.id)).toEqual(['SCR-01', 'SCR-02', 'r1-L1', 'r1-L2'])
    expect(ops.find((o) => o.id === 'r1-L1')?.data).toMatchObject({ createdBy: 'owner-uid' })
  })

  it('leaves what already exists alone, and offers nothing when everything is there', async () => {
    await mount(makeStore({ items: ['SCR-01', 'SCR-02'], movements: ['r1-L1', 'r1-L2'] }))
    await pick((await backupFile(DATA, '2026-10-12')).bytes)
    expect(host.querySelector('[data-testid="restore-summary"]')?.textContent).toContain(
      'موجود قبل كده: 2',
    )
    expect(buttonByText(host, 'مفيش حاجة تتستعاد')?.disabled).toBe(true)
    expect(committed).toEqual([])
  })

  it('refuses a file with problems, lists them, and writes nothing', async () => {
    await mount(makeStore())
    const bad = { ...DATA, movements: [mov({ id: 'x', itemCode: 'ZZZ-99' })] }
    await pick((await backupFile(bad, '2026-10-12')).bytes)
    const errors = host.querySelector('[data-testid="restore-errors"]')
    expect(errors?.textContent).toContain('ZZZ-99')
    expect(host.querySelector('[data-testid="restore-summary"]')).toBeNull()
    expect(committed).toEqual([])
  })

  it('says so when the file is not a backup', async () => {
    await mount(makeStore())
    await pick(new Uint8Array([1, 2, 3, 4]))
    expect(host.querySelector('[data-testid="restore-errors"]')?.textContent).toMatch(/مش ملف/)
  })

  it('keeps the button, and says it can be run again, when the write stops halfway', async () => {
    const store = makeStore()
    store.commit = () => Promise.reject(new Error('offline'))
    await mount(store)
    await pick((await backupFile(DATA, '2026-10-12')).bytes)
    click(buttonByText(host, 'استعد دلوقتي'))
    await flush()
    await flush()
    expect(host.querySelector('[data-testid="restore-errors"]')?.textContent).toContain(
      'اضغط استعادة تاني',
    )
    expect(buttonByText(host, 'استعد دلوقتي')).not.toBeNull()
  })
})
