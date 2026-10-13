import { createDetector } from './detector'
import type { CodeDetector, ScanCode, ScanSession, ScanSource } from './types'

export interface CameraDeps {
  readonly mediaDevices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'> | undefined
  readonly createDetector: () => Promise<CodeDetector>
  /** Pause between two frames being read. */
  readonly intervalMs: number
}

const FRAME_INTERVAL_MS = 150
/** HAVE_CURRENT_DATA: the video has a frame to read. */
const HAVE_CURRENT_DATA = 2

function browserDeps(): CameraDeps {
  return {
    mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
    createDetector: () => createDetector(),
    intervalMs: FRAME_INTERVAL_MS,
  }
}

async function hasVideoInput(devices: CameraDeps['mediaDevices']): Promise<boolean> {
  if (!devices || typeof devices.getUserMedia !== 'function') return false
  try {
    return (await devices.enumerateDevices()).some((d) => d.kind === 'videoinput')
  } catch {
    return false
  }
}

interface Loop {
  setPaused(paused: boolean): void
  stop(): void
}

/** Reads one frame at a time (never overlapping) until stopped. A bad frame is skipped. */
function startLoop(
  video: HTMLVideoElement,
  detector: CodeDetector,
  onCode: (code: ScanCode) => void,
  intervalMs: number,
): Loop {
  let stopped = false
  let paused = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const tick = async (): Promise<void> => {
    if (!paused && video.readyState >= HAVE_CURRENT_DATA) {
      try {
        const codes = await detector.detect(video)
        if (!stopped && !paused) for (const code of codes) onCode(code)
      } catch {
        // An unreadable frame is normal (motion blur, a closing lens). Try the next one.
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs)
  }
  timer = setTimeout(() => void tick(), intervalMs)

  return {
    setPaused(next) {
      paused = next
    },
    stop() {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    },
  }
}

function release(stream: MediaStream, video: HTMLVideoElement): void {
  stream.getTracks().forEach((t) => t.stop())
  // A newer session may already own the video (React strict mode starts, stops, starts again).
  if (video.srcObject === stream) video.srcObject = null
}

async function openCamera(deps: CameraDeps, video: HTMLVideoElement): Promise<MediaStream> {
  if (!deps.mediaDevices) throw new Error('No camera API')
  const stream = await deps.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  })
  video.srcObject = stream
  try {
    await video.play()
  } catch {
    // Autoplay can be refused until a tap; frames still arrive once the user interacts.
  }
  return stream
}

/** The real camera plus the detector. Browser APIs come in through `deps` for tests. */
export function createCameraSource(deps: CameraDeps = browserDeps()): ScanSource {
  return {
    hasCamera: () => hasVideoInput(deps.mediaDevices),
    async start(video, onCode): Promise<ScanSession> {
      const stream = await openCamera(deps, video)
      let detector: CodeDetector
      try {
        detector = await deps.createDetector()
      } catch (err) {
        release(stream, video)
        throw err
      }
      const loop = startLoop(video, detector, onCode, deps.intervalMs)
      return {
        setPaused(paused) {
          loop.setPaused(paused)
          if (paused) video.pause()
          else void video.play().catch(() => undefined)
        },
        stop() {
          loop.stop()
          release(stream, video)
        },
      }
    },
  }
}
