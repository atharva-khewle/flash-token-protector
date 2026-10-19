import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import type { Hex, TokenTransfer } from '../src/chains/types'
import { hexToTron } from '../src/lib/tron'
import { findLookalikes, isLookalike } from '../src/lib/lookalike'
import { USDT } from '../src/registry/usdt'
import { analyzeApprovals, analyzeTronPermissions, analyzeWallet, checkDestination, classifyCode } from '../src/verdict/wallet'
import { FAKE_TOKEN, ME, usdtUnits } from './helpers'

// Synthetic addresses built to share prefix/suffix, like vanity poisoning addresses.
const FRIEND = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678' as Hex
const POISON = '0xa1b2c3d4ffffffffffffffffffffffffff345678' as Hex
const ATTACKER = '0x7777777777777777777777777777777777777777' as Hex

function tx(over: Partial<TokenTransfer>): TokenTransfer {
  return {
    txHash: `0x${'01'.repeat(32)}`,
    blockNumber: 1n,
    timestamp: null,
    token: USDT.bsc.hex,
    tokenName: null,
    tokenSymbol: null,
    decimals: null,
    from: ME,
    to: FRIEND,
    value: usdtUnits('bsc', 100),
    txFrom: ME,
    ...over,
  }
}

describe('lookalike rule', () => {
  it('prefix+suffix vanity match is a lookalike; identical or unrelated are not', () => {
    expect(isLookalike(POISON, FRIEND)).not.toBeNull()
    expect(isLookalike(FRIEND, FRIEND)).toBeNull()
    expect(isLookalike(ATTACKER, FRIEND)).toBeNull()
  })
  it('one swapped character is a lookalike (edit distance)', () => {
    const one = (FRIEND.slice(0, 20) + (FRIEND[20] === '0' ? '1' : '0') + FRIEND.slice(21)) as Hex
    expect(isLookalike(one, FRIEND)?.distance).toBe(1)
  })
  it('Tron lookalikes are judged on the base58 form people read', () => {
    const real = hexToTron(FRIEND)
    const m = findLookalikes(real.slice(0, 5) + 'zzzzzzzzzzzzzzzzzzzzzzzz' + real.slice(-5), [real])
    expect(m.length).toBe(1)
  })
})

describe('D41 known limit of the lookalike rule', () => {
  it('a match on the first 4 characters only is NOT flagged (documented residual risk)', () => {
    const weak = '0xa1b2999999999999999999999999999999999999' as Hex
    expect(isLookalike(weak, FRIEND)).toBeNull()
  })
})

describe('D. address poisoning (wallet scan)', () => {
  it('D21 zero-value transfer "from me" that I did not sign', () => {
    const w = analyzeWallet('bsc', ME, [tx({}), tx({ txHash: `0x${'02'.repeat(32)}`, to: POISON, value: 0n, txFrom: ATTACKER })], [])
    expect(w.poisoning[0]).toMatchObject({ kind: 'zero-value', counterparty: POISON })
    expect(w.poisoning[0]?.match?.target).toBe(getAddress(FRIEND))
  })

  it('D22 dust from a vanity lookalike of an address I paid', () => {
    const w = analyzeWallet('bsc', ME, [tx({}), tx({ txHash: `0x${'03'.repeat(32)}`, from: POISON, to: ME, value: 10n ** 12n, txFrom: POISON })], [])
    expect(w.poisoning.map((p) => p.kind)).toContain('lookalike')
  })

  it('D22 plain dust from an unrelated address is still reported', () => {
    const w = analyzeWallet('bsc', ME, [tx({ from: ATTACKER, to: ME, value: 10n ** 12n, txFrom: ATTACKER })], [])
    expect(w.poisoning.map((p) => p.kind)).toContain('dust')
  })

  it('D23 lookalike of a watchlist address (e.g. my Binance deposit address)', () => {
    const w = analyzeWallet('bsc', ME, [tx({ from: POISON, to: ME, value: 0n, txFrom: POISON })], [FRIEND])
    expect(w.poisoning[0]?.kind).toBe('lookalike')
  })

  it('D42 poisoning with a fake token from a lookalike counts too', () => {
    const w = analyzeWallet('bsc', ME, [tx({}), tx({ token: FAKE_TOKEN, tokenSymbol: 'USDT', tokenName: 'Tether USD', from: POISON, to: ME, value: usdtUnits('bsc', 100), txFrom: POISON })], [])
    expect(w.poisoning[0]?.kind).toBe('lookalike')
    expect(w.fakeTokens[0]).toMatchObject({ token: FAKE_TOKEN, impersonatesUsdt: true })
  })

  it('A1 fake USDT received is separated from real USDT totals', () => {
    const w = analyzeWallet('bsc', ME, [tx({ from: ATTACKER, to: ME, value: usdtUnits('bsc', 7) }), tx({ token: FAKE_TOKEN, tokenSymbol: 'USDT', from: ATTACKER, to: ME, value: usdtUnits('bsc', 99999) })], [])
    expect(w.realIn.total).toBe('7')
    expect(w.fakeTokens).toHaveLength(1)
  })
})

describe('Check before sending (D23)', () => {
  it('danger on lookalike, known on exact, unknown otherwise', () => {
    expect(checkDestination(POISON, [FRIEND], []).level).toBe('danger')
    expect(checkDestination(FRIEND.toUpperCase().replace('0X', '0x'), [FRIEND], []).level).toBe('known')
    expect(checkDestination(ATTACKER, [FRIEND], []).level).toBe('unknown')
    expect(checkDestination(POISON, [], [FRIEND]).level).toBe('danger')
  })

  it('E43 clipboard hijack to an unrelated address shows as NEW, never KNOWN', () => {
    expect(checkDestination(ATTACKER, [FRIEND], [FRIEND]).level).toBe('unknown')
  })
})

describe('E. approvals and account control', () => {
  it('E24 unlimited USDT approval to an unknown spender is high risk', () => {
    const f = analyzeApprovals('bsc', [
      { token: USDT.bsc.hex, spender: ATTACKER, amount: 2n ** 256n - 1n },
      { token: USDT.bsc.hex, spender: FRIEND, amount: usdtUnits('bsc', 50) },
      { token: USDT.bsc.hex, spender: POISON, amount: 0n },
    ])
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ spender: ATTACKER, unlimited: true, level: 'high' })
    expect(f[1]).toMatchObject({ formatted: '50', level: 'medium' })
  })

  it('E25 EIP-7702 delegation code on an EOA is detected', () => {
    const delegate = 'cafe'.repeat(10)
    expect(classifyCode(`0xef0100${delegate}` as Hex)).toEqual({ kind: 'delegated', to: `0x${delegate}` })
    expect(classifyCode('0x')).toEqual({ kind: 'eoa' })
    expect(classifyCode('0x6080604052').kind).toBe('contract')
  })

  it('E26 leaked-seed bait / E27 permission hijack on Tron: owner key is someone else', () => {
    const me = hexToTron(ME)
    const other = hexToTron(ATTACKER)
    expect(analyzeTronPermissions(me, { threshold: 1, keys: [{ address: other, weight: 1 }] })[0]?.level).toBe('high')
    expect(analyzeTronPermissions(me, { threshold: 2, keys: [{ address: me, weight: 1 }, { address: other, weight: 1 }] })[0]?.level).toBe('high')
    expect(analyzeTronPermissions(me, { threshold: 1, keys: [{ address: me, weight: 1 }] })).toEqual([])
  })
})
