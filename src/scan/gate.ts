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
 * Every counted code keeps its own timer, so a box showing two codes (an EAN-13 and a GS1
 * DataMatrix) does not count again each time the camera reads the other one.
 */
export function createScanGate(
  options: ScanGateOptions = DEFAULT_GATE,
  now: () => number = Date.now,
): ScanGate {
  const lastSeenAt = new Map<string, number>()
  let lastAcceptAt = Number.NEGATIVE_INFINITY

  return {
    accept(value) {
      const t = now()
      for (const [v, seen] of lastSeenAt) if (t - seen >= options.repeatMs) lastSeenAt.delete(v)
      if (lastSeenAt.has(value)) {
        lastSeenAt.set(value, t)
        return false
      }
      if (t - lastAcceptAt < options.freezeMs) return false
      lastSeenAt.set(value, t)
      lastAcceptAt = t
      return true
    },
  }
}
