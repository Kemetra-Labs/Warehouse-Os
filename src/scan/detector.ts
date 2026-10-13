import type { CodeDetector } from './types'

/**
 * EAN-13/8 and UPC-A for the boxes, Code-128 and DataMatrix for GS1 labels (batch and expiry),
 * and QR for the delivery note (FR-030b: it holds only the delivery-note number).
 */
export const SCAN_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'code_128',
  'data_matrix',
  'qr_code',
] as const

interface DetectorCtor {
  new (options: { formats: string[] }): CodeDetector
  getSupportedFormats?: () => Promise<readonly string[]>
}

export interface DetectorDeps {
  /** `globalThis.BarcodeDetector`: present on Android Chrome. */
  readonly native: DetectorCtor | undefined
  /** Loads the bundled ZXing build; only called when the native one is missing or too small. */
  readonly loadPonyfill: () => Promise<DetectorCtor>
}

async function loadPonyfill(): Promise<DetectorCtor> {
  const [{ BarcodeDetector, setZXingModuleOverrides }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    // Served from our own origin (and the service worker precache) so scanning works offline.
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasm.default : prefix + path,
  })
  return BarcodeDetector as unknown as DetectorCtor
}

function browserDeps(): DetectorDeps {
  return {
    native: (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector,
    loadPonyfill,
  }
}

async function nativeCoversAll(native: DetectorCtor): Promise<boolean> {
  try {
    const supported = await native.getSupportedFormats?.()
    return supported !== undefined && SCAN_FORMATS.every((f) => supported.includes(f))
  } catch {
    return false
  }
}

/** The native detector when it reads every format we need (R5), otherwise the ZXing ponyfill. */
export async function createDetector(deps: DetectorDeps = browserDeps()): Promise<CodeDetector> {
  const { native } = deps
  const Ctor = native && (await nativeCoversAll(native)) ? native : await deps.loadPonyfill()
  return new Ctor({ formats: [...SCAN_FORMATS] })
}
