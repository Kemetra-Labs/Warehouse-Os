import type { EnvLike } from './config'

/**
 * UI hint only (research R3). The Firestore rules are the real gate. With no configured
 * owner UID we cannot tell, so we trust the rules and let the first read decide.
 */
export function isOwnerHint(uid: string, env: EnvLike): boolean {
  const owner = (env.VITE_OWNER_UID ?? '').trim()
  return owner === '' || owner === uid
}
