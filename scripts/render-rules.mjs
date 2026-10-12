// Renders firestore.rules.template -> firestore.rules with the owner UID (research R3).
// Usage: node scripts/render-rules.mjs [--test-uid]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = '__OWNER_UID__'

function fail(message) {
  console.error(`[ERROR] render-rules: ${message}`)
  process.exit(1)
}

function readEnvLocal() {
  const file = resolve(root, '.env.local')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const useTestUid = process.argv.includes('--test-uid')
const uid = useTestUid
  ? 'test-owner'
  : (process.env.OWNER_UID || readEnvLocal().OWNER_UID || '').trim()

if (!uid) fail('OWNER_UID is missing. Set it in the environment or in .env.local.')
if (!/^[A-Za-z0-9_-]+$/.test(uid)) fail('OWNER_UID contains unexpected characters.')

const templatePath = resolve(root, 'firestore.rules.template')
if (!existsSync(templatePath)) fail('firestore.rules.template not found.')
const template = readFileSync(templatePath, 'utf8')
if (!template.includes(PLACEHOLDER)) fail(`template has no ${PLACEHOLDER} placeholder.`)

writeFileSync(resolve(root, 'firestore.rules'), template.replaceAll(PLACEHOLDER, uid))
console.log(`[OK] firestore.rules rendered (${useTestUid ? 'test uid' : 'owner uid'})`)
