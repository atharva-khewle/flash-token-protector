// Tron address helpers. Tron addresses are base58check of 0x41 + 20 bytes.

import { sha256 } from 'viem'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(s: string): Uint8Array | null {
  let n = 0n
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) return null
    n = n * 58n + BigInt(i)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const ch of s) {
    if (ch !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

function base58Encode(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, '')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

function checksum(payload: Uint8Array): Uint8Array {
  const once = sha256(payload, 'bytes')
  return sha256(once, 'bytes').slice(0, 4)
}

/** Returns lowercase 0x + 40 hex (without the 0x41 prefix), or null if invalid. */
export function tronToHex(addr: string): `0x${string}` | null {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return null
  const raw = base58Decode(addr)
  if (!raw || raw.length !== 25) return null
  const payload = raw.slice(0, 21)
  const sum = raw.slice(21)
  const expect = checksum(payload)
  for (let i = 0; i < 4; i++) if (sum[i] !== expect[i]) return null
  if (payload[0] !== 0x41) return null
  return `0x${toHex(payload.slice(1))}`
}

/** Accepts 40 hex (EVM-style) or 42 hex starting with 41. */
export function hexToTron(hex: string): string {
  let h = hex.toLowerCase().replace(/^0x/, '')
  if (h.length === 42 && h.startsWith('41')) h = h.slice(2)
  if (!/^[0-9a-f]{40}$/.test(h)) throw new Error(`bad tron hex: ${hex}`)
  const payload = fromHex('41' + h)
  const full = new Uint8Array(25)
  full.set(payload, 0)
  full.set(checksum(payload), 21)
  return base58Encode(full)
}
