import { useState } from 'react'

/** The time when the screen was opened (a stable value for "how old is it" checks). */
export function useNow(): number {
  const [now] = useState(() => Date.now())
  return now
}
