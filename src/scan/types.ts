/** One barcode read from a camera frame. `format` is the Barcode Detection API name, e.g. `ean_13`. */
export interface ScanCode {
  readonly rawValue: string
  readonly format: string
}

/** Reads codes from one video frame. The native BarcodeDetector and the ponyfill both fit. */
export interface CodeDetector {
  detect(video: HTMLVideoElement): Promise<readonly ScanCode[]>
}

/** A running camera. `stop` releases the tracks; `setPaused` freezes the frame and the reading. */
export interface ScanSession {
  setPaused(paused: boolean): void
  stop(): void
}

/**
 * Everything the Scanner needs from the outside world: whether a camera exists, and how to
 * read codes from it. Tests pass a fake, so no real camera or detector is ever involved.
 */
export interface ScanSource {
  hasCamera(): Promise<boolean>
  /** Rejects when the camera cannot be opened (refused, busy, unplugged). */
  start(video: HTMLVideoElement, onCode: (code: ScanCode) => void): Promise<ScanSession>
}

/** What the screen says about a code: drives the green tick or the red cross. */
export type ScanFeedback = 'known' | 'unknown'
