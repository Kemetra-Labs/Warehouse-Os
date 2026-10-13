export interface ScanGateOptions {
  /** After a hit, ignore every code for this long (the green or red outline holds). */
  readonly freezeMs: number
  /** The same code is counted again only after it was out of view for this long. */
  readonly repeatMs: number
}

export const DEFAULT_GATE: ScanGateOptions = { freezeMs: 250, repeatMs: 1500 }

export interface ScanGate {
  /** True when this read should count. Call it for every detection, accepted or not. */
  accept(value: string): boolean
}

/**
 * Continuous mode reads a code every frame. The gate turns that into one count per box:
 * a code held in view keeps refreshing its own timer, so it counts again only after it left.
 */
export function createScanGate(
  options: ScanGateOptions = DEFAULT_GATE,
  now: () => number = Date.now,
): ScanGate {
  let lastValue: string | null = null
  let lastSeenAt = 0
  let lastAcceptAt = Number.NEGATIVE_INFINITY

  return {
    accept(value) {
      const t = now()
      const frozen = t - lastAcceptAt < options.freezeMs
      if (value === lastValue && t - lastSeenAt < options.repeatMs) {
        lastSeenAt = t
        return false
      }
      if (frozen) return false
      lastValue = value
      lastSeenAt = t
      lastAcceptAt = t
      return true
    },
  }
}
