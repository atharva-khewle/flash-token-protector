import { describe, expect, it } from 'vitest'
import { familyOfAddress, parseAddress, parseAmount, parseTxHash } from '../src/lib/input'
import { hexToTron, tronToHex } from '../src/lib/tron'
import { USDT } from '../src/registry/usdt'

const ZWSP = String.fromCharCode(0x200b)
const RLO = String.fromCharCode(0x202e)
const CYR_E = String.fromCharCode(0x0435) // Cyrillic small ie
const evmHash = `0x${'ab'.repeat(32)}`

describe('L0 input: tx hashes', () => {
  it('C20 accepts a well-formed EVM hash and lowercases it', () => {
    const r = parseTxHash(evmHash.toUpperCase().replace('0X', '0x'), 'bsc')
    expect(r).toMatchObject({ ok: true, hash: evmHash })
  })

  it('C20 rejects wrong length', () => {
    const r = parseTxHash('0x1234', 'bsc')
    expect(r.ok).toBe(false)
  })

  it('C20 rejects an address pasted as a hash', () => {
    const r = parseTxHash(USDT.bsc.address, 'bsc')
    expect(r.ok === false && r.reason).toMatch(/address/)
  })

  it('L0 strips zero-width and bidi characters and reports them', () => {
    const r = parseTxHash(`${ZWSP}${evmHash.slice(0, 10)}${ZWSP}${evmHash.slice(10)}${RLO}`, 'bsc')
    expect(r).toMatchObject({ ok: true, hash: evmHash, hidden: 3 })
  })

  it('A2 rejects homoglyph characters inside a hash', () => {
    const r = parseTxHash(evmHash.slice(0, 20) + CYR_E + evmHash.slice(21), 'bsc')
    expect(r.ok).toBe(false)
  })

  it('A5 refuses ambiguous chain: Tron-style hash on BSC, 0x hash on Tron', () => {
    expect(parseTxHash('ab'.repeat(32), 'bsc').ok).toBe(false)
    expect(parseTxHash(evmHash, 'tron').ok).toBe(false)
    expect(parseTxHash('ab'.repeat(32), 'tron')).toMatchObject({ ok: true, family: 'tron' })
  })
})

describe('L0 input: addresses', () => {
  it('A36 rejects an EIP-55 checksum mismatch (one character case-flipped)', () => {
    const good = USDT.bsc.address
    const i = good.search(/[a-f]/)
    const tampered = good.slice(0, i) + good[i]!.toUpperCase() + good.slice(i + 1)
    expect(parseAddress(good, 'evm').ok).toBe(true)
    expect(parseAddress(tampered, 'evm').ok).toBe(false)
  })

  it('accepts all-lowercase EVM addresses (no checksum to check)', () => {
    expect(parseAddress(USDT.bsc.hex, 'evm').ok).toBe(true)
  })

  it('A2 rejects Cyrillic lookalike letters in a Tron address', () => {
    const bad = USDT.tron.address.replace('e', CYR_E)
    expect(bad).not.toBe(USDT.tron.address)
    expect(parseAddress(bad, 'tron').ok).toBe(false)
  })

  it('Tron base58check round-trip, and a one-char typo fails the checksum', () => {
    expect(tronToHex(USDT.tron.address)).toBe(USDT.tron.hex)
    expect(hexToTron(USDT.tron.hex)).toBe(USDT.tron.address)
    const typo = USDT.tron.address.slice(0, 10) + (USDT.tron.address[10] === 'Q' ? 'R' : 'Q') + USDT.tron.address.slice(11)
    expect(tronToHex(typo)).toBeNull()
  })

  it('guesses family from format only', () => {
    expect(familyOfAddress(USDT.eth.address)).toBe('evm')
    expect(familyOfAddress(USDT.tron.address)).toBe('tron')
    expect(familyOfAddress('hello')).toBeNull()
  })
})

describe('amount parsing uses registry decimals (A6)', () => {
  it('parses decimals exactly', () => {
    expect(parseAmount('5,000.5', 6)).toBe(5_000_500_000n)
    expect(parseAmount('1', 18)).toBe(10n ** 18n)
  })
  it('rejects too many decimals and junk', () => {
    expect(parseAmount('1.1234567', 6)).toBeNull()
    expect(parseAmount('1e6', 6)).toBeNull()
    expect(parseAmount('-5', 6)).toBeNull()
  })
})
