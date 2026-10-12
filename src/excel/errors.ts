export type ImportErrorCode =
  'unreadable-file' | 'missing-sheet' | 'bad-header' | 'bad-row' | 'duplicate-code' | 'no-items'

/** A precondition or mapping failure. `message` is Arabic and safe to show to the user. */
export class ImportError extends Error {
  readonly code: ImportErrorCode

  constructor(code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}
