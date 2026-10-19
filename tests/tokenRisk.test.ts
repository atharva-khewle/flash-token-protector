import { describe, expect, it } from 'vitest'
import { toFunctionSelector, toHex } from 'viem'
import type { Hex } from '../src/chains/types'
import { analyzeName, skeleton } from '../src/lib/homoglyph'
import { EIP1967_IMPL_SLOT, push4Selectors, tokenRisk, type TokenProbe } from '../src/verdict/tokenRisk'
import { FAKE_TOKEN } from './helpers'

/** Synthetic bytecode: PUSH4 <selector> for each signature, then STOP. */
function codeWith(...sigs: string[]): Hex {
  return `0x${sigs.map((s) => '63' + toFunctionSelector(s).slice(2)).join('')}00` as Hex
}

const base: TokenProbe = {
  token: FAKE_TOKEN,
  code: codeWith('transfer(address,uint256)'),
  name: 'Some Token',
  symbol: 'SOME',
  implSlot: null,
  beaconSlot: null,
  holderBalance: null,
  loggedValue: null,
  randomBalance: 0n,
  transferSim: null,
}
const codes = (p: Partial<TokenProbe>) => tokenRisk({ ...base, ...p }).findings.map((f) => f.code)

describe('L6 unknown-token risk', () => {
  it('EIP-1967 implementation slot constant is correct', () => {
    expect(EIP1967_IMPL_SLOT).toBe('0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
  })

  it('PUSH4 scan skips PUSH data of other sizes', () => {
    const sel = toFunctionSelector('pause()').slice(2)
    // PUSH5 containing the selector bytes must not count.
    expect(push4Selectors(`0x64${sel}00` as Hex).has(sel)).toBe(false)
    expect(push4Selectors(`0x63${sel}` as Hex).has(sel)).toBe(true)
  })

  it('B8 expiring / revocable balance: burn-from, mint, pause, blacklist are flagged', () => {
    const c = codes({ code: codeWith('burn(address,uint256)', 'mint(address,uint256)', 'pause()', 'addBlackList(address)') })
    expect(c).toEqual(expect.arrayContaining(['burn-from', 'mint', 'pause', 'blacklist']))
  })

  it('B8 event claims more than the holder has now -> event-without-balance', () => {
    expect(codes({ holderBalance: 0n, loggedValue: 5000n })).toContain('event-without-balance')
  })

  it('B9 honeypot: simulated transfer by holder reverts', () => {
    expect(codes({ transferSim: { ok: false, error: 'execution reverted' } })).toContain('honeypot')
    expect(codes({ transferSim: { ok: true } })).not.toContain('honeypot')
  })

  it('B10 upgradeable proxy via EIP-1967 slot', () => {
    const slot = toHex(BigInt('0x' + 'ee'.repeat(20)), { size: 32 })
    expect(codes({ implSlot: slot })).toContain('proxy')
    expect(codes({ implSlot: toHex(0n, { size: 32 }) })).not.toContain('proxy')
  })

  it('B10 minimal proxy (EIP-1167) detected', () => {
    const code = `0x363d3d373d3d3d363d73${'ee'.repeat(20)}5af43d82803e903d91602b57fd5bf3` as Hex
    expect(codes({ code })).toContain('proxy')
  })

  it('B11 balanceOf lies: random fresh address has a balance', () => {
    expect(codes({ randomBalance: 10n ** 24n })).toContain('fake-balance')
  })

  it('B12 fee-on-transfer / rebasing: credited less than the event said', () => {
    expect(codes({ holderBalance: 950n, loggedValue: 1000n })).toContain('event-without-balance')
  })

  it('B49 token code gone (self-destructed) -> no-code', () => {
    expect(codes({ code: '0x' })).toContain('no-code')
  })

  it('A1 named Tether USD / USDT -> impersonates-usdt', () => {
    expect(codes({ name: 'Tether USD', symbol: 'USDT' })).toContain('impersonates-usdt')
  })

  it('A7 URL / instructions in token name', () => {
    const c = codes({ name: 'Visit usdt-claim.xyz to claim', symbol: 'USDT' })
    expect(c).toEqual(expect.arrayContaining(['name-url', 'name-instructions']))
  })
})

describe('A2 homoglyphs in name / symbol', () => {
  const cyrT = String.fromCharCode(0x0422) // Cyrillic capital Te
  const cyrS = String.fromCharCode(0x0405) // Cyrillic capital Dze (looks like S)
  const tugrik = String.fromCharCode(0x20ae) // ₮
  const zw = String.fromCharCode(0x200b)
  const rlo = String.fromCharCode(0x202e)

  it('Cyrillic letters map to the ASCII skeleton USDT', () => {
    expect(skeleton(`U${cyrS}D${cyrT}`)).toBe('USDT')
    const f = analyzeName('Tether', `U${cyrS}D${cyrT}`).map((x) => x.code)
    expect(f).toEqual(expect.arrayContaining(['non-ascii', 'usdt-lookalike']))
  })

  it('USD₮, zero-width and RTL tricks are reported', () => {
    expect(analyzeName('x', `USD${tugrik}`).map((x) => x.code)).toContain('usdt-lookalike')
    expect(analyzeName(`US${zw}DT`, 'x').map((x) => x.code)).toEqual(expect.arrayContaining(['invisible', 'usdt-lookalike']))
    expect(analyzeName(`${rlo}TDSU`, 'x').map((x) => x.code)).toContain('bidi')
  })

  it('USDT.e / USDT0 / trailing spaces still read as USDT lookalikes', () => {
    for (const s of ['USDT.e', 'USDT0', 'USDT  ']) expect(analyzeName('', s).map((x) => x.code)).toContain('usdt-lookalike')
  })
})
