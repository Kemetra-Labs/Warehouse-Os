import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutbox, type Outbox } from '../../../src/data/outbox'

let factory: IDBFactory
let outbox: Outbox

const entry = { id: 'issue-14', kind: 'issue.post', payload: { lines: 3 } }

beforeEach(() => {
  factory = new IDBFactory()
  outbox = createOutbox({ factory, dbName: 'test-outbox', now: () => 1000 })
})

describe('outbox', () => {
  it('stores an entry before commit as pending', async () => {
    await outbox.put(entry)
    const rows = await outbox.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'issue-14',
      status: 'pending',
      error: null,
      createdAt: 1000,
    })
  })

  it('deletes the entry on ack', async () => {
    await outbox.put(entry)
    await outbox.markAcked('issue-14')
    expect(await outbox.list()).toEqual([])
  })

  it('marks the entry failed on reject and keeps the payload', async () => {
    await outbox.put(entry)
    await outbox.markFailed('issue-14', 'permission-denied')
    const [row] = await outbox.list()
    expect(row).toMatchObject({
      status: 'failed',
      error: 'permission-denied',
      payload: { lines: 3 },
    })
  })

  it('ignores markFailed for an unknown id', async () => {
    await outbox.markFailed('nope', 'x')
    expect(await outbox.list()).toEqual([])
  })

  it('survives a reload (new connection)', async () => {
    await outbox.put(entry)
    await outbox.markFailed('issue-14', 'boom')
    outbox.close()
    const reopened = createOutbox({ factory, dbName: 'test-outbox' })
    const [row] = await reopened.list()
    expect(row).toMatchObject({ id: 'issue-14', status: 'failed', error: 'boom' })
    reopened.close()
  })

  it('lists entries oldest first', async () => {
    let t = 0
    const o = createOutbox({ factory, dbName: 'order', now: () => ++t })
    await o.put({ ...entry, id: 'b' })
    await o.put({ ...entry, id: 'a' })
    expect((await o.list()).map((e) => e.id)).toEqual(['b', 'a'])
    o.close()
  })

  it('clears a rejected resend whose document is already posted on the server', async () => {
    await outbox.put(entry)
    const check = vi.fn().mockResolvedValue(true)
    expect(await outbox.reconcile('issue-14', check, 'already-exists')).toBe('cleared')
    expect(check).toHaveBeenCalledWith('issue-14')
    expect(await outbox.list()).toEqual([])
  })

  it('marks failed when the server does not hold the document', async () => {
    await outbox.put(entry)
    expect(await outbox.reconcile('issue-14', async () => false, 'permission-denied')).toBe(
      'failed',
    )
    const [row] = await outbox.list()
    expect(row).toMatchObject({ status: 'failed', error: 'permission-denied' })
  })

  it('marks failed when the server check itself throws', async () => {
    await outbox.put(entry)
    const check = async (): Promise<boolean> => {
      throw new Error('offline')
    }
    expect(await outbox.reconcile('issue-14', check, 'rejected')).toBe('failed')
    const [row] = await outbox.list()
    expect(row?.error).toContain('offline')
  })

  it('notifies subscribers after changes', async () => {
    const fn = vi.fn()
    const off = outbox.subscribe(fn)
    await outbox.put(entry)
    await outbox.markAcked('issue-14')
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    await outbox.put(entry)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
