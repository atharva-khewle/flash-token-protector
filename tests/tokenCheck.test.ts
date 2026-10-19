import { describe, expect, it } from 'vitest'
import { judgeToken } from '../src/verdict/tokenCheck'
import type { TokenProbe } from '../src/verdict/tokenRisk'
import { FAKE_TOKEN } from './helpers'

const code = '0x6080604052' as const
function probe(over: Partial<TokenProbe> = {}): TokenProbe {
  return { token: FAKE_TOKEN, code, name: 'Some Token', symbol: 'SOME', implSlot: null, beaconSlot: null, holderBalance: null, loggedValue: null, randomBalance: 0n, transferSim: null, ...over }
}

describe('judgeToken', () => {
  it('canonical address is REAL USDT, even if nothing could be read', () => {
    expect(judgeToken(true, null).verdict).toBe('REAL USDT')
  })

  it('a non-canonical contract named USDT is FAKE USDT', () => {
    const r = judgeToken(false, probe({ name: 'Tether USD', symbol: 'USDT' }))
    expect(r.verdict).toBe('FAKE USDT')
    expect(r.findings.map((f) => f.code)).toContain('impersonates-usdt')
  })

  it('a homoglyph name (Armenian S) is still FAKE USDT', () => {
    expect(judgeToken(false, probe({ name: 'Tether', symbol: 'ՍSDT' })).verdict).toBe('FAKE USDT')
  })

  it('an unrelated token is NOT USDT, not FAKE USDT', () => {
    expect(judgeToken(false, probe({ name: 'Wrapped BNB', symbol: 'WBNB' })).verdict).toBe('NOT USDT')
  })

  it('an address without code is NOT A CONTRACT', () => {
    expect(judgeToken(false, probe({ code: '0x' })).verdict).toBe('NOT A CONTRACT')
  })

  it('an unreadable chain is UNKNOWN, never REAL', () => {
    expect(judgeToken(false, null).verdict).toBe('UNKNOWN')
  })
})
