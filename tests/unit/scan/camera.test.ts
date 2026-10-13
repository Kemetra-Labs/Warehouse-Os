import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCameraSource, type CameraDeps } from '../../../src/scan/camera'
import type { CodeDetector, ScanCode } from '../../../src/scan/types'

const CODE: ScanCode = { rawValue: '6001234567890', format: 'ean_13' }

function fakeVideo() {
  return {
    srcObject: null as unknown,
    readyState: 4,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  }
}

function fakeStream() {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] }, stop }
}

function deps(over: Partial<CameraDeps> = {}): CameraDeps {
  const detector: CodeDetector = { detect: () => Promise.resolve([CODE]) }
  return {
    mediaDevices: {
      getUserMedia: vi.fn(() => Promise.resolve(fakeStream().stream as unknown as MediaStream)),
      enumerateDevices: vi.fn(() => Promise.resolve([{ kind: 'videoinput' } as MediaDeviceInfo])),
    },
    createDetector: () => Promise.resolve(detector),
    intervalMs: 100,
    ...over,
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createCameraSource.hasCamera', () => {
  it('is false without mediaDevices or without a video input', async () => {
    expect(await createCameraSource(deps({ mediaDevices: undefined })).hasCamera()).toBe(false)
    const none = deps({
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: () => Promise.resolve([{ kind: 'audioinput' } as MediaDeviceInfo]),
      },
    })
    expect(await createCameraSource(none).hasCamera()).toBe(false)
  })

  it('is false when listing devices throws, true with a video input', async () => {
    const broken = deps({
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: () => Promise.reject(new Error('blocked')),
      },
    })
    expect(await createCameraSource(broken).hasCamera()).toBe(false)
    expect(await createCameraSource(deps()).hasCamera()).toBe(true)
  })
})

describe('createCameraSource.start', () => {
  it('opens the rear camera into the video and forwards detections on a timer', async () => {
    const d = deps()
    const video = fakeVideo()
    const onCode = vi.fn()
    const session = await createCameraSource(d).start(video as unknown as HTMLVideoElement, onCode)
    expect(d.mediaDevices?.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    })
    expect(video.srcObject).not.toBeNull()
    expect(video.play).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(350)
    expect(onCode).toHaveBeenCalledWith(CODE)
    expect(onCode.mock.calls.length).toBeGreaterThanOrEqual(2)
    session.stop()
  })

  it('stops reading while paused and reads again after resume', async () => {
    const video = fakeVideo()
    const onCode = vi.fn()
    const session = await createCameraSource(deps()).start(
      video as unknown as HTMLVideoElement,
      onCode,
    )
    session.setPaused(true)
    expect(video.pause).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(onCode).not.toHaveBeenCalled()
    session.setPaused(false)
    await vi.advanceTimersByTimeAsync(250)
    expect(onCode).toHaveBeenCalled()
    session.stop()
  })

  it('stop releases the camera tracks and ends the loop', async () => {
    const { stream, stop } = fakeStream()
    const d = deps({
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(stream as unknown as MediaStream)),
        enumerateDevices: () => Promise.resolve([{ kind: 'videoinput' } as MediaDeviceInfo]),
      },
    })
    const video = fakeVideo()
    const onCode = vi.fn()
    const session = await createCameraSource(d).start(video as unknown as HTMLVideoElement, onCode)
    session.stop()
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(onCode).not.toHaveBeenCalled()
  })

  it('a stale session stopping does not blank the video a newer session owns', async () => {
    const first = fakeStream()
    const second = fakeStream()
    const streams = [first.stream, second.stream]
    const d = deps({
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(streams.shift() as unknown as MediaStream)),
        enumerateDevices: () => Promise.resolve([{ kind: 'videoinput' } as MediaDeviceInfo]),
      },
    })
    const video = fakeVideo()
    const source = createCameraSource(d)
    const a = await source.start(video as unknown as HTMLVideoElement, vi.fn())
    const b = await source.start(video as unknown as HTMLVideoElement, vi.fn())
    a.stop()
    expect(first.stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBe(second.stream)
    b.stop()
    expect(video.srcObject).toBeNull()
  })

  it('keeps going when one detection throws', async () => {
    let calls = 0
    const detector: CodeDetector = {
      detect: () => (++calls === 1 ? Promise.reject(new Error('frame')) : Promise.resolve([CODE])),
    }
    const onCode = vi.fn()
    const session = await createCameraSource(
      deps({ createDetector: () => Promise.resolve(detector) }),
    ).start(fakeVideo() as unknown as HTMLVideoElement, onCode)
    await vi.advanceTimersByTimeAsync(350)
    expect(onCode).toHaveBeenCalled()
    session.stop()
  })

  it('rejects when the camera is refused, and releases nothing it never got', async () => {
    const d = deps({
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.reject(new DOMException('no', 'NotAllowedError'))),
        enumerateDevices: () => Promise.resolve([]),
      },
    })
    await expect(
      createCameraSource(d).start(fakeVideo() as unknown as HTMLVideoElement, vi.fn()),
    ).rejects.toThrow()
  })
})
