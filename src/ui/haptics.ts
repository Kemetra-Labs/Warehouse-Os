const POSTED_MS = 30

/** One medium buzz when a document has just been posted (ui-inspiration, the seal moment). */
export function postedHaptic(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(POSTED_MS)
  }
}
