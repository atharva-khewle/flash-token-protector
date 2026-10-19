// L0: input hygiene. Strip invisible characters, classify, refuse ambiguity.

import { getAddress, isAddress } from 'viem'
import type { ChainFamily, ChainKey } from '../registry/chains'
import { CHAINS } from '../registry/chains'
import { tronToHex } from './tron'

// Zero-width, bidi controls, BOM, NBSP and other space-like characters.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00A0\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g

/** Counts characters that were not plain visible ASCII, after trimming ordinary edge whitespace. */
export function hiddenCount(raw: string): number {
  return (raw.trim().match(INVISIBLE) ?? []).length
}

export type HashParse =
  | { ok: true; hash: string; family: ChainFamily; hidden: number }
  | { ok: false; reason: string }

export function parseTxHash(raw: string, chain: ChainKey): HashParse {
  const hidden = hiddenCount(raw)
  const v = raw.replace(INVISIBLE, '').trim()
  const family = CHAINS[chain].family
  if (v === '') return { ok: false, reason: 'Empty input.' }
  if (/[^\x21-\x7e]/.test(v)) {
    return { ok: false, reason: 'Hash contains non-ASCII characters (possible lookalike characters). Re-copy it from the explorer you trust.' }
  }
  if (isAddress(v, { strict: false }) || /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)) {
    return { ok: false, reason: 'This is an address, not a transaction hash.' }
  }
  const m = /^(0x)?([0-9a-fA-F]+)$/.exec(v)
  if (!m) return { ok: false, reason: 'A tx hash is 64 hex characters (0-9, a-f).' }
  const body = m[2]!
  if (body.length !== 64) {
    return { ok: false, reason: `A tx hash is 64 hex characters. This one has ${body.length}.` }
  }
  if (family === 'evm' && !m[1]) {
    return { ok: false, reason: 'EVM hashes start with 0x. Hashes without 0x are usually Tron. Pick the right chain, or add 0x if you are sure.' }
  }
  if (family === 'tron' && m[1]) {
    return { ok: false, reason: 'Tron hashes have no 0x prefix. Hashes with 0x are usually BSC or Ethereum. Pick the right chain, or remove 0x if you are sure.' }
  }
  const hash = family === 'evm' ? `0x${body.toLowerCase()}` : body.toLowerCase()
  return { ok: true, hash, family, hidden }
}

export type AddressParse =
  | { ok: true; family: ChainFamily; display: string; hex: `0x${string}`; hidden: number }
  | { ok: false; reason: string }

/** Parses an address for a given chain family. Mixed-case EVM addresses must pass EIP-55. */
export function parseAddress(raw: string, family: ChainFamily): AddressParse {
  const hidden = hiddenCount(raw)
  const v = raw.replace(INVISIBLE, '').trim()
  if (v === '') return { ok: false, reason: 'Empty address.' }
  if (/[^\x21-\x7e]/.test(v)) {
    return { ok: false, reason: 'Address contains non-ASCII characters (lookalike letters). Do not use it.' }
  }
  if (family === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return { ok: false, reason: 'An EVM address is 0x followed by 40 hex characters.' }
    const mixed = /[a-f]/.test(v.slice(2)) && /[A-F]/.test(v.slice(2))
    if (mixed && !isAddress(v, { strict: true })) {
      return { ok: false, reason: 'Checksum (capital letters) does not match. One character may have been changed. Do not use it.' }
    }
    return { ok: true, family, display: getAddress(v), hex: v.toLowerCase() as `0x${string}`, hidden }
  }
  const hex = tronToHex(v)
  if (!hex) return { ok: false, reason: 'Not a valid Tron address (must start with T, 34 characters, valid checksum).' }
  return { ok: true, family, display: v, hex, hidden }
}

/** Guesses the family from format only. Returns null when it cannot tell. */
export function familyOfAddress(raw: string): ChainFamily | null {
  const v = raw.replace(INVISIBLE, '').trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return 'evm'
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)) return 'tron'
  return null
}

/** Parses a decimal amount like "5000" or "5000.25" into base units. */
export function parseAmount(raw: string, decimals: number): bigint | null {
  const v = raw.replace(INVISIBLE, '').replace(/[,_\s]/g, '')
  if (v === '') return null
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v)
  if (!m) return null
  const frac = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0')
  if ((m[2] ?? '').length > decimals) return null
  return BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac === '' ? '0' : frac)
}
