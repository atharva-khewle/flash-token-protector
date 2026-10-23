import { describe, expect, it } from 'vitest'
import type { Hex, TokenTransfer } from '../src/chains/types'
import { USDT } from '../src/registry/usdt'
import { analyzeBehavior } from '../src/verdict/behavior'
import { analyzeWallet } from '../src/verdict/wallet'
import { FAKE_TOKEN, ME, usdtUnits } from './helpers'

const FRIEND = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678' as Hex
const POISON = '0xa1b2c3d4ffffffffffffffffffffffffff345678' as Hex
const ATTACKER = '0x7777777777777777777777777777777777777777' as Hex
const victims = [1, 2, 3, 4].map((i) => `0x${String(i).repeat(40)}` as Hex)

let n = 0
function tx(over: Partial<TokenTransfer>): TokenTransfer {
  n++
  return {
    txHash: `0x${n.toString(16).padStart(64, '0')}`,
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

const run = (me: Hex, list: TokenTransfer[], watch: Hex[] = []) => analyzeBehavior('bsc', me, list, analyzeWallet('bsc', me, list, watch))

describe('who is attacking whom', () => {
  it('ordinary payments: neither attacked nor attacking', () => {
    const b = run(ME, [tx({}), tx({ from: FRIEND, to: ME, txFrom: FRIEND })])
    expect(b.role).toBe('none')
    expect(b.victim).toEqual([])
    expect(b.attacker).toEqual([])
  })

  it('poisoned and sent fake USDT: victim, with the attackers named', () => {
    const b = run(ME, [
      tx({}),
      tx({ to: POISON, value: 0n, txFrom: ATTACKER }),
      tx({ token: FAKE_TOKEN, tokenSymbol: 'USDT', tokenName: 'Tether USD', from: ATTACKER, to: ME, txFrom: ATTACKER }),
    ])
    expect(b.role).toBe('victim')
    expect(b.victim.join(' ')).toMatch(/did not sign/)
    expect(b.victim.join(' ')).toMatch(/fake USDT/)
    expect(b.attackers).toContain(POISON)
    expect(b.attackers).toContain(ATTACKER)
  })

  it('a lookalike address collecting zero-value transfers from many victims is an attacker', () => {
    const b = run(POISON, victims.map((v) => tx({ from: v, to: POISON, value: 0n, txFrom: ATTACKER })))
    expect(b.role).toBe('attacker')
    expect(b.attacker[0]).toMatch(/4 different addresses/)
    expect(b.targets).toHaveLength(4)
  })

  it('sprinkling dust to many addresses is an attacker pattern; two is not a campaign', () => {
    const dust = (to: Hex) => tx({ from: ATTACKER, to, value: usdtUnits('bsc', 1) / 1000n, txFrom: ATTACKER })
    expect(run(ATTACKER, victims.map(dust)).role).toBe('attacker')
    expect(run(ATTACKER, victims.slice(0, 2).map(dust)).role).toBe('none')
  })

  it('spreading a fake USDT token to several addresses is an attacker pattern', () => {
    const b = run(
      ATTACKER,
      victims.slice(0, 2).map((v) => tx({ token: FAKE_TOKEN, tokenSymbol: 'USDT', tokenName: 'Tether USD', from: ATTACKER, to: v, txFrom: ATTACKER })),
    )
    expect(b.role).toBe('attacker')
    expect(b.attacker.join(' ')).toMatch(/fake USDT to 2/)
  })
})
