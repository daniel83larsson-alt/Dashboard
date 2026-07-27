// Covers the credential-encryption roundtrip and the decryptMaybeLegacy
// heuristic (length >= 56 && all-hex) that lets us tell an already-encrypted
// stored value apart from a plaintext row written before encryption existed,
// without a migration.
process.env.CREDENTIALS_ENCRYPTION_KEY = '95e9e39bed8b85ec60848f66dc564b5ef424e7c4fa413c5570add02b1e2e992c'.slice(0, 64)

import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, decryptMaybeLegacy } from './encrypt'

describe('encrypt/decrypt', () => {
  it('round-trips a value unchanged', () => {
    const plaintext = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'
    const stored = encrypt(plaintext)
    expect(decrypt(stored)).toBe(plaintext)
  })
})

describe('decryptMaybeLegacy', () => {
  it('passes through a realistic plaintext API key completely unchanged', () => {
    const plaintext = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'
    expect(decryptMaybeLegacy(plaintext)).toBe(plaintext)
  })

  it('passes through a realistic Gemini-style plaintext key unchanged', () => {
    const plaintext = 'AIzaSyD1234567890abcdefghijklmnopqrstu'
    expect(decryptMaybeLegacy(plaintext)).toBe(plaintext)
  })

  it('correctly decrypts real ciphertext produced by encrypt()', () => {
    const plaintext = 'sk-ant-api03-real-secret-value'
    const stored = encrypt(plaintext)
    expect(decryptMaybeLegacy(stored)).toBe(plaintext)
  })

  it('falls back to returning the input unchanged when it is corrupted/truncated hex, without throwing', () => {
    const stored = encrypt('some-secret')
    const corrupted = stored.slice(0, -4) // truncated but still long, all-hex -> "looks encrypted", decrypt() will throw internally
    expect(() => decryptMaybeLegacy(corrupted)).not.toThrow()
    expect(decryptMaybeLegacy(corrupted)).toBe(corrupted)
  })
})
