import { describe, expect, it } from 'vitest'
import { emulatorsEnabled, missingConfigKeys, readFirebaseConfig } from '../../../src/data/config'
import { toDataError } from '../../../src/data/listener'
import { isOwnerHint } from '../../../src/data/owner'

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'd',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_APP_ID: 'a',
}

describe('firebase config', () => {
  it('lists missing and blank keys', () => {
    expect(missingConfigKeys({})).toHaveLength(4)
    expect(missingConfigKeys({ ...full, VITE_FIREBASE_APP_ID: '  ' })).toEqual([
      'VITE_FIREBASE_APP_ID',
    ])
    expect(missingConfigKeys(full)).toEqual([])
  })
  it('reads the config object', () => {
    expect(readFirebaseConfig(full)).toEqual({
      apiKey: 'k',
      authDomain: 'd',
      projectId: 'p',
      appId: 'a',
    })
  })
  it('enables emulators only for "1"', () => {
    expect(emulatorsEnabled({ VITE_USE_EMULATORS: '1' })).toBe(true)
    expect(emulatorsEnabled({ VITE_USE_EMULATORS: 'true' })).toBe(false)
    expect(emulatorsEnabled({})).toBe(false)
  })
})

describe('isOwnerHint', () => {
  it('trusts the rules when no owner uid is configured', () => {
    expect(isOwnerHint('abc', {})).toBe(true)
    expect(isOwnerHint('abc', { VITE_OWNER_UID: '' })).toBe(true)
  })
  it('compares when configured', () => {
    expect(isOwnerHint('abc', { VITE_OWNER_UID: 'abc' })).toBe(true)
    expect(isOwnerHint('zzz', { VITE_OWNER_UID: 'abc' })).toBe(false)
  })
})

describe('toDataError', () => {
  it('maps permission-denied to the not-allowed message', () => {
    const e = toDataError({ code: 'permission-denied', message: 'x' })
    expect(e.kind).toBe('denied')
    expect(e.message).toBe('الحساب ده مش مسموحله')
  })
  it('maps anything else to a generic Arabic message', () => {
    expect(toDataError(new Error('boom')).kind).toBe('other')
    expect(toDataError('str').message).toContain('حصلت مشكلة')
  })
})
