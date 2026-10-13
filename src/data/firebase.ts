import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { emulatorsEnabled, missingConfigKeys, readFirebaseConfig } from './config'

export interface Firebase {
  readonly app: FirebaseApp
  readonly db: Firestore
  readonly auth: Auth
}

let instance: Firebase | null = null

/** Keys that are blank in the build environment. Empty means Firebase can start. */
export function missingFirebaseConfig(): string[] {
  return missingConfigKeys(import.meta.env)
}

/** Lazily initialises Firebase once. Throws if the config is incomplete (callers gate on it). */
export function getFirebase(): Firebase {
  if (instance) return instance
  const missing = missingFirebaseConfig()
  if (missing.length > 0) throw new Error(`Missing Firebase config: ${missing.join(', ')}`)

  const app = initializeApp(readFirebaseConfig(import.meta.env))
  // Offline-first (research R1): local cache shared across tabs, writes queue in IndexedDB.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  if (emulatorsEnabled(import.meta.env)) {
    connectFirestoreEmulator(db, 'localhost', 8081)
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  }
  instance = { app, db, auth }
  return instance
}
