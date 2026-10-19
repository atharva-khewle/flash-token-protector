import { describe, expect, it } from 'vitest'
import { canonicalUsdt } from '../src/registry/usdt'
import { judgeToken } from '../src/verdict/tokenCheck'
import { buildReport, type ReportInput } from '../src/verdict/txReport'
import type { Check } from '../src/verdict/types'
import { FAKE_TOKEN, ME, OTHER, PAYER, receipt, transferLog, usdtUnits } from './helpers'

const usdt = canonicalUsdt('bsc').hex
const pass: Check[] = [{ id: 'L1.consensus', layer: 'L1', status: 'pass', required: true, reason: '2 providers agree.' }]
const code = '0x6080604052' as const
type Judged = ReportInput['tokens'] extends Map<unknown, infer V> ? V : never

function input(over: Partial<ReportInput>): ReportInput {
  return { chain: 'bsc', hash: '0xab', isBlockHash: false, checks: pass, receipt: null, tokens: new Map(), codes: new Map(), ...over }
}
const real: Judged = { ...judgeToken(true, null), name: null, symbol: null }
const fake: Judged = {
  ...judgeToken(false, { token: FAKE_TOKEN, code, name: 'Tether USD', symbol: 'USDT', implSlot: null, beaconSlot: null, holderBalance: null, loggedValue: null, randomBalance: 0n, transferSim: null }),
  name: 'Tether USD',
  symbol: 'USDT',
}

describe('buildReport', () => {
  it('real USDT only, normal amount: no red flags, net change listed', () => {
    const r = buildReport(input({ receipt: receipt('bsc', [transferLog(usdt, PAYER, ME, usdtUnits('bsc', 500))]), tokens: new Map([[usdt, real]]) }))
    expect(r.headline).toBe('NO RED FLAGS')
    expect(r.net.find((n) => n.address === ME)?.formatted).toBe('500')
    expect(r.problems.some((p) => p.level === 'bad')).toBe(false)
  })

  it('a fake token alone: FAKE USDT FOUND and "no real USDT moved"', () => {
    const r = buildReport(input({ receipt: receipt('bsc', [transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 500))]), tokens: new Map([[FAKE_TOKEN, fake]]) }))
    expect(r.headline).toBe('FAKE USDT FOUND')
    expect(r.problems.map((p) => p.text).join('\n')).toMatch(/No real USDT moved/)
  })

  it('real plus fake together: still flagged, decoy warning shown', () => {
    const r = buildReport(
      input({
        receipt: receipt('bsc', [transferLog(usdt, PAYER, OTHER, usdtUnits('bsc', 5), 0), transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 5000), 1)]),
        tokens: new Map([
          [usdt, real],
          [FAKE_TOKEN, fake],
        ]),
      }),
    )
    expect(r.headline).toBe('FAKE USDT FOUND')
    expect(r.problems.map((p) => p.text).join('\n')).toMatch(/appear together/)
  })

  it('a reverted tx is FAILED TX', () => {
    expect(buildReport(input({ receipt: receipt('bsc', [], { status: 'reverted' }) })).headline).toBe('FAILED TX')
  })

  it('an unknown hash is NOT ON CHAIN', () => {
    const missing: Check[] = [{ id: 'L1.found', layer: 'L1', status: 'fail', required: true, notReceived: true, reason: 'No provider knows this transaction.' }]
    expect(buildReport(input({ checks: missing })).headline).toBe('NOT ON CHAIN')
  })

  it('a block hash is called out', () => {
    expect(buildReport(input({ isBlockHash: true })).headline).toBe('BLOCK HASH')
  })

  it('zero-value and dust transfers are warned about', () => {
    const r = buildReport(
      input({
        receipt: receipt('bsc', [transferLog(usdt, PAYER, ME, 0n, 0), transferLog(usdt, PAYER, ME, usdtUnits('bsc', 1) / 100n, 1)]),
        tokens: new Map([[usdt, real]]),
      }),
    )
    const t = r.problems.map((p) => p.text).join('\n')
    expect(t).toMatch(/Zero-value/)
    expect(t).toMatch(/dust/i)
    expect(r.headline).toBe('PROBLEMS FOUND')
  })

  it('a tx with no token logs says no USDT arrived', () => {
    const r = buildReport(input({ receipt: receipt('bsc', []) }))
    expect(r.problems.map((p) => p.text).join('\n')).toMatch(/no USDT arrived/)
    expect(r.headline).toBe('PROBLEMS FOUND')
  })

  it('two lookalike addresses in one tx are pointed out', () => {
    const a = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678' as const
    const b = '0xa1b2c3d4ffffffffffffffffffffffffff345678' as const
    const r = buildReport(input({ receipt: receipt('bsc', [transferLog(usdt, a, b, usdtUnits('bsc', 50))]), tokens: new Map([[usdt, real]]) }))
    expect(r.problems.map((p) => p.text).join('\n')).toMatch(/look alike/)
  })

  it('a provider disagreement is not hidden', () => {
    const disagree: Check[] = [{ id: 'L1.consensus', layer: 'L1', status: 'warn', required: true, reason: 'Providers disagree (a vs b).' }]
    const r = buildReport(input({ checks: disagree, receipt: receipt('bsc', [transferLog(usdt, PAYER, ME, usdtUnits('bsc', 500))]), tokens: new Map([[usdt, real]]) }))
    expect(r.headline).toBe('PROBLEMS FOUND')
  })
})
