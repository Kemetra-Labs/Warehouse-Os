import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { getFirebase } from './firebase'
import { isOwnerHint } from './owner'

export interface AuthUser {
  readonly uid: string
  readonly email: string | null
  readonly displayName: string | null
}

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'auth/popup-closed-by-user': 'اتقفلت نافذة الدخول قبل ما تخلص. جرّب تاني.',
  'auth/cancelled-popup-request': 'اتقفلت نافذة الدخول قبل ما تخلص. جرّب تاني.',
  'auth/network-request-failed': 'مفيش نت. اتأكد من الاتصال وجرّب تاني.',
}

export const SIGN_IN_FAILED_MESSAGE = 'ما قدرناش نسجّل الدخول. جرّب تاني.'

function codeOf(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : null
  return typeof code === 'string' ? code : ''
}

export function authErrorMessage(err: unknown): string {
  return ERROR_MESSAGES[codeOf(err)] ?? SIGN_IN_FAILED_MESSAGE
}

/** Popup first (desktop); redirect when the browser blocks popups (many phones). */
export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebase()
  const provider = new GoogleAuthProvider()
  try {
    await signInWithPopup(auth, provider)
  } catch (err) {
    if (!REDIRECT_FALLBACK_CODES.has(codeOf(err))) throw err
    await signInWithRedirect(auth, provider)
  }
}

/** Completes a redirect sign-in after the page reloads; a no-op otherwise. */
export async function completeRedirectSignIn(): Promise<void> {
  await getRedirectResult(getFirebase().auth)
}

export function subscribeAuth(cb: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(getFirebase().auth, (u) => {
    cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null)
  })
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebase().auth)
}

/** UI hint only; the Firestore rules are the real gate. */
export function isOwner(user: AuthUser): boolean {
  return isOwnerHint(user.uid, import.meta.env)
}
