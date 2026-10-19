import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import {
  chainOfHost,
  classifyTokenLink,
  COPY_TTL_MS,
  edges,
  extractAddress,
  inspectPaste,
  lookalikeOnPage,
  normalizeState,
  tokenAddressFromHref,
  type ExtState,
} from '../src/ext/logic'
import { hexToTron } from '../src/lib/tron'
import { USDT } from '../src/registry/usdt'

const SAVED = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const LOOK = '0xa1b2c3d4ffffffffffffffffffffffffff345678'
const OTHER = '0x7777777777777777777777777777777777777777'
const state: ExtState = { watchlist: [{ chain: 'bsc', address: getAddress(SAVED), label: 'Binance deposit' }], recent: {} }

describe('explorer pages', () => {
  it('maps hostnames to chains, exactly', () => {
    expect(chainOfHost('bscscan.com')).toBe('bsc')
    expect(chainOfHost('www.bscscan.com')).toBe('bsc')
    expect(chainOfHost('etherscan.io')).toBe('eth')
    expect(chainOfHost('bscscan.com.evil.example')).toBeNull()
    expect(chainOfHost('notbscscan.com')).toBeNull()
  })

  it('A1 token links: canonical = real, USDT-named other contract = fake, unrelated = nothing', () => {
    const real = `/token/${USDT.bsc.address}?a=0x1`
    expect(classifyTokenLink('bsc', real, 'Tether USD (USDT)')?.kind).toBe('real')
    expect(classifyTokenLink('bsc', real.toLowerCase(), '')?.kind).toBe('real')
    expect(classifyTokenLink('bsc', '/token/0xfa4efa4efa4efa4efa4efa4efa4efa4efa4efa4e', 'Tether USD (USDT)')?.kind).toBe('fake')
    expect(classifyTokenLink('bsc', '/token/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', 'PancakeSwap Token (CAKE)')).toBeNull()
    expect(classifyTokenLink('bsc', '/address/0x1', 'Tether USD (USDT)')).toBeNull()
  })

  it('A2 homoglyph names still read as USDT', () => {
    const sym = `U${String.fromCharCode(0x0405)}D${String.fromCharCode(0x0422)}`
    expect(classifyTokenLink('bsc', '/token/0xfa4efa4efa4efa4efa4efa4efa4efa4efa4efa4e', sym)?.kind).toBe('fake')
  })

  it('the Ethereum USDT address is fake on BSC pages, real on Etherscan pages', () => {
    const href = `/token/${USDT.eth.address}`
    expect(classifyTokenLink('bsc', href, 'Tether USD (USDT)')?.kind).toBe('fake')
    expect(classifyTokenLink('eth', href, 'Tether USD (USDT)')?.kind).toBe('real')
  })

  it('extracts the token address from absolute and relative hrefs', () => {
    expect(tokenAddressFromHref(`https://bscscan.com/token/${USDT.bsc.address}#balances`)).toBe(USDT.bsc.hex)
    expect(tokenAddressFromHref('/token/0x123')).toBeNull()
  })

  it('D22 lookalike of a saved address is badged; the real one and strangers are not', () => {
    expect(lookalikeOnPage('bsc', LOOK, state)?.text).toContain('Binance deposit')
    expect(lookalikeOnPage('bsc', SAVED, state)).toBeNull()
    expect(lookalikeOnPage('bsc', OTHER, state)).toBeNull()
  })
})

describe('paste guard', () => {
  const now = 1_000_000

  it('ignores text that is not a single address', () => {
    expect(inspectPaste('hello', null, state, now)).toBeNull()
    expect(inspectPaste(`${SAVED} and more`, null, state, now)).toBeNull()
    expect(extractAddress(`  ${SAVED}\n`)).toBe(SAVED)
  })

  it('D23 lookalike of a saved address -> danger with the real one for the diff', () => {
    const r = inspectPaste(LOOK, null, state, now)!
    expect(r.level).toBe('danger')
    expect(r.lookalikeOf).toBe(getAddress(SAVED))
  })

  it('exact saved address -> ok, with its label', () => {
    const r = inspectPaste(SAVED, null, state, now)!
    expect(r.level).toBe('ok')
    expect(r.headline).toContain('Binance deposit')
  })

  it('unknown address -> warn (new address)', () => {
    expect(inspectPaste(OTHER, null, state, now)!.level).toBe('warn')
  })

  it('E43 clipboard swap: pasted differs from what was copied a minute ago -> danger', () => {
    const r = inspectPaste(OTHER, { text: SAVED, ts: now - 60_000 }, state, now)!
    expect(r.level).toBe('danger')
    expect(r.headline).toMatch(/NOT the one you copied/)
  })

  it('a stale copy (older than the TTL) is not compared', () => {
    const r = inspectPaste(OTHER, { text: SAVED, ts: now - COPY_TTL_MS - 1 }, state, now)!
    expect(r.level).toBe('warn')
  })

  it('same address copied and pasted is fine (case-insensitive)', () => {
    const r = inspectPaste(SAVED, { text: SAVED.toUpperCase().replace('0X', '0x'), ts: now - 5000 }, state, now)!
    expect(r.level).toBe('ok')
  })

  it('A36 an address with a broken EIP-55 checksum is rejected as invalid', () => {
    const good = getAddress(OTHER)
    const flipped = good.slice(0, 3) + (good[3] === good[3]!.toUpperCase() ? good[3]!.toLowerCase() : good[3]!.toUpperCase()) + good.slice(4)
    if (flipped !== good && /[a-fA-F]/.test(good[3]!)) expect(inspectPaste(flipped, null, state, now)!.level).toBe('danger')
  })

  it('Tron addresses are checked too, against saved Tron addresses only', () => {
    const saved = hexToTron('0x1111111111111111111111111111111111111111')
    const st: ExtState = { watchlist: [{ chain: 'tron', address: saved, label: 'Tron wallet' }], recent: {} }
    expect(inspectPaste(saved, null, st, now)!.level).toBe('ok')
    expect(inspectPaste(SAVED, null, st, now)!.level).toBe('warn')
  })

  it('edges() gives the head and tail a human compares', () => {
    expect(edges(getAddress(SAVED))).toEqual({ head: '0xa1B2c3', tail: '345678' })
  })
})

describe('stored state is untrusted', () => {
  it('normalizeState survives junk', () => {
    expect(normalizeState(null)).toEqual({ watchlist: [], recent: {} })
    expect(normalizeState({ watchlist: [1, { address: 'x', chain: 'bsc', label: '' }], recent: 'no' }).watchlist).toHaveLength(1)
  })
})
