import { vi } from 'vitest'
import type { ScanCode, ScanSession, ScanSource } from '../../src/scan/types'

export interface FakeScanSource {
  readonly source: ScanSource
  /** Feeds a code to the scanner as if the camera had read it. */
  emit(code: ScanCode): void
}

/** A camera-less ScanSource for jsdom tests: no video, no detector, codes on demand. */
export function fakeScanSource(opts: { camera?: boolean } = {}): FakeScanSource {
  let handler: (c: ScanCode) => void = () => undefined
  const session: ScanSession = { setPaused: vi.fn(), stop: vi.fn() }
  return {
    source: {
      hasCamera: () => Promise.resolve(opts.camera ?? true),
      start: (_video, onCode) => {
        handler = onCode
        return Promise.resolve(session)
      },
    },
    emit: (code) => handler(code),
  }
}

export const ean = (rawValue: string): ScanCode => ({ rawValue, format: 'ean_13' })
export const qr = (rawValue: string): ScanCode => ({ rawValue, format: 'qr_code' })
