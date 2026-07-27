import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decrypt(stored: string): string {
  const key = getKey()
  const iv = Buffer.from(stored.slice(0, 24), 'hex')
  const tag = Buffer.from(stored.slice(24, 56), 'hex')
  const ciphertext = Buffer.from(stored.slice(56), 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

// Encrypted output is always plain lowercase hex, at least 56 chars (iv+tag)
// plus ciphertext. Real API keys (sk-ant-..., AIzaSy..., sk-...) contain
// characters outside [0-9a-f] and are shorter, so this distinguishes rows
// written before encryption was added without needing a migration.
export function decryptMaybeLegacy(stored: string): string {
  const looksEncrypted = stored.length >= 56 && /^[0-9a-f]+$/i.test(stored)
  if (!looksEncrypted) return stored
  try {
    return decrypt(stored)
  } catch {
    return stored
  }
}
