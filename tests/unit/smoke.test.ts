import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs in a jsdom environment', () => {
    expect(document.documentElement).toBeDefined()
    expect(1 + 1).toBe(2)
  })
})
