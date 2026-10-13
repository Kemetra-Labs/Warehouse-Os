import type { ScanFeedback } from './types'

const VIBRATION: Readonly<Record<ScanFeedback, number | number[]>> = {
  known: 40,
  unknown: [30, 60, 30],
}
const TONE_HZ: Readonly<Record<ScanFeedback, number>> = { known: 880, unknown: 330 }
const TONE_MS = 90

let audio: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audio ??= new Ctor()
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined)
    return audio
  } catch {
    return null
  }
}

function beep(kind: ScanFeedback): void {
  const ctx = audioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = TONE_HZ[kind]
    gain.gain.value = 0.15
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + TONE_MS / 1000)
  } catch {
    // No sound is not an error: the outline and the vibration still say it.
  }
}

function vibrate(kind: ScanFeedback): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(VIBRATION[kind])
  }
}

/** The beep and the buzz that go with the outline. Every part is optional on a device. */
export function signal(kind: ScanFeedback): void {
  beep(kind)
  vibrate(kind)
}
