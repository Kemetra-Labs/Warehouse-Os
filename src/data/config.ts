export type EnvLike = Readonly<Record<string, string | undefined>>

export const REQUIRED_FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

export interface FirebaseConfig {
  readonly apiKey: string
  readonly authDomain: string
  readonly projectId: string
  readonly appId: string
}

export function missingConfigKeys(env: EnvLike): string[] {
  return REQUIRED_FIREBASE_KEYS.filter((k) => (env[k] ?? '').trim() === '')
}

export function readFirebaseConfig(env: EnvLike): FirebaseConfig {
  return {
    apiKey: (env.VITE_FIREBASE_API_KEY ?? '').trim(),
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim(),
    projectId: (env.VITE_FIREBASE_PROJECT_ID ?? '').trim(),
    appId: (env.VITE_FIREBASE_APP_ID ?? '').trim(),
  }
}

export function emulatorsEnabled(env: EnvLike): boolean {
  return env.VITE_USE_EMULATORS === '1'
}
