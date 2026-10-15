import { describe, expect, it, vi } from 'vitest'
import { createDetector, SCAN_FORMATS } from '../../../src/scan/detector'
import { createScanGate } from '../../../src/scan/gate'

class FakeDetector {
  static formats: readonly string[] = SCAN_FORMATS
  static created: unknown[] = []
  constructor(public options: { formats: string[] }) {
    FakeDetector.created.push(options)
  }
  static getSupportedFormats(): Promise<readonly string[]> {
    return Promise.resolve(FakeDetector.formats)
  }
  detect(): Promise<{ rawValue: string; format: string }[]> {
    return Promise.resolve([{ rawValue: '6001234567890', format: 'ean_13' }])
  }
}

describe('SCAN_FORMATS', () => {
  it('covers EAN-13/8, UPC-A, Code-128, DataMatrix and the delivery-note QR', () => {
    expect([...SCAN_FORMATS].sort()).toEqual(
      ['code_128', 'data_matrix', 'ean_13', 'ean_8', 'qr_code', 'upc_a'].sort(),
    )
  })
})

describe('createDetector', () => {
  it('uses the native BarcodeDetector when it supports every format', async () => {
    const loadPonyfill = vi.fn()
    FakeDetector.formats = SCAN_FORMATS
    const d = await createDetector({ native: FakeDetector, loadPonyfill })
    expect(loadPonyfill).not.toHaveBeenCalled()
    expect(await d.detect({} as HTMLVideoElement)).toEqual([
      { rawValue: '6001234567890', format: 'ean_13' },
    ])
  })

  it('falls back to the bundled ponyfill when the native one lacks a format', async () => {
    FakeDetector.formats = ['ean_13']
    const loadPonyfill = vi.fn().mockResolvedValue(FakeDetector)
    await createDetector({ native: FakeDetector, loadPonyfill })
    expect(loadPonyfill).toHaveBeenCalledOnce()
  })

  it('falls back when there is no native detector or asking it fails', async () => {
    const loadPonyfill = vi.fn().mockResolvedValue(FakeDetector)
    await createDetector({ native: undefined, loadPonyfill })
    class Broken extends FakeDetector {
      static override getSupportedFormats(): Promise<readonly string[]> {
        return Promise.reject(new Error('nope'))
      }
    }
    await createDetector({ native: Broken, loadPonyfill })
    expect(loadPonyfill).toHaveBeenCalledTimes(2)
  })

  it('asks the detector for exactly the supported formats', async () => {
    FakeDetector.created = []
    FakeDetector.formats = SCAN_FORMATS
    await createDetector({ native: FakeDetector, loadPonyfill: vi.fn() })
    expect(FakeDetector.created[0]).toEqual({ formats: [...SCAN_FORMATS] })
  })
})

describe('createScanGate (continuous mode must not over-count)', () => {
  const make = () => {
    let t = 1000
    const gate = createScanGate({ freezeMs: 250, repeatMs: 1500 }, () => t)
    return { gate, at: (ms: number) => (t = ms) }
  }

  it('accepts the first read and ignores the same code while it stays in view', () => {
    const { gate, at } = make()
    expect(gate.accept('A')).toBe(true)
    for (let ms = 1100; ms <= 4000; ms += 100) {
      at(ms)
      expect(gate.accept('A')).toBe(false)
    }
  })

  it('accepts the same code again only after it was away for the repeat window', () => {
    const { gate, at } = make()
    expect(gate.accept('A')).toBe(true)
    at(1400)
    expect(gate.accept('A')).toBe(false) // seen at 1400
    at(2899)
    expect(gate.accept('A')).toBe(false) // 1499 ms after the last sighting
    at(4400)
    expect(gate.accept('A')).toBe(true) // away for 1500 ms or more
  })

  it('freezes everything for a moment after a hit, then accepts a different code', () => {
    const { gate, at } = make()
    expect(gate.accept('A')).toBe(true)
    at(1200)
    expect(gate.accept('B')).toBe(false)
    at(1250)
    expect(gate.accept('B')).toBe(true)
  })

  it('counts a box showing two codes once while it stays in view', () => {
    const { gate, at } = make()
    let counted = 0
    for (let ms = 1000; ms <= 4000; ms += 150) {
      at(ms)
      if (gate.accept('A')) counted += 1
      if (gate.accept('B')) counted += 1
    }
    // A at once; B once the freeze is over; then both stay in view and never count again.
    expect(counted).toBe(2)
  })

  it('counts each code again once it was away for the repeat time', () => {
    const { gate, at } = make()
    gate.accept('A')
    at(1300)
    expect(gate.accept('B')).toBe(true)
    at(1600)
    expect(gate.accept('A')).toBe(false) // seen 600 ms ago
    at(3200)
    expect(gate.accept('A')).toBe(true)
    at(3500)
    expect(gate.accept('B')).toBe(true)
  })
})
