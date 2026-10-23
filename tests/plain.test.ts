import { describe, expect, it } from 'vitest'
import { plainToken, plainTx, plainVerify } from '../src/verdict/plain'
import type { TxReportOutput } from '../src/services/txReport'
import type { VerifyOutput } from '../src/services/verify'
import { judgeToken } from '../src/verdict/tokenCheck'
import { canonicalUsdt } from '../src/registry/usdt'
import { FAKE_TOKEN, ME, PAYER } from './helpers'

const usdt = canonicalUsdt('bsc').hex
const one = 10n ** 18n
function tx(over: Partial<TxReportOutput>): TxReportOutput {
  return { headline: 'NO RED FLAGS', problems: [], tokens: [], parties: [], net: [], other721: 0, chain: 'bsc', hash: '0xab', blockNumber: 1n, skippedTokens: 0, providers: [], ...over }
}
const realTok = { ...judgeToken(true, null), token: usdt, name: null, symbol: null, transfers: [{ from: PAYER, to: ME, value: 500n * one, logIndex: 0 }] }
const fakeTok = {
  ...judgeToken(false, { token: FAKE_TOKEN, code: '0x60', name: 'Tether USD', symbol: 'USDT', implSlot: null, beaconSlot: null, holderBalance: null, loggedValue: null, randomBalance: 0n, transferSim: null }),
  token: FAKE_TOKEN,
  name: 'Tether USD',
  symbol: 'USDT',
  transfers: [{ from: PAYER, to: ME, value: 5000n * one, logIndex: 1 }],
}

describe('plain-language summaries', () => {
  it('normal real USDT transfer: low risk, says who got it and to use Verify a payment', () => {
    const p = plainTx(tx({ tokens: [realTok], net: [{ address: ME, value: 500n * one, formatted: '500' }] }))
    expect(p.tone).toBe('good')
    expect(p.points.join(' ')).toMatch(/500 USDT to 0x1111/)
    expect(p.todo.join(' ')).toMatch(/Verify a payment/)
  })

  it('fake USDT only: high risk and tells you not to release anything', () => {
    const p = plainTx(tx({ headline: 'FAKE USDT FOUND', tokens: [fakeTok] }))
    expect(p.tone).toBe('danger')
    expect(p.title).toMatch(/Fake USDT/)
    expect(p.todo.join(' ')).toMatch(/Do not release/)
  })

  it('failed and missing transactions are explained simply', () => {
    expect(plainTx(tx({ headline: 'FAILED TX' })).title).toMatch(/failed/)
    expect(plainTx(tx({ headline: 'NOT ON CHAIN' })).title).toMatch(/not on BNB Smart Chain/)
  })

  it('verify FAKE because the money went elsewhere is said in plain words', () => {
    const r = { verdict: 'FAKE', checks: [{ id: 'L4.recipient', layer: 'L4', status: 'fail', required: true, reason: 'technical' }], netFormatted: null, providers: [] } as unknown as VerifyOutput
    const p = plainVerify(r)
    expect(p.title).toMatch(/not a real USDT payment to you/)
    expect(p.points[0]).toMatch(/different address/)
  })

  it('verify VERIFIED says yes with the amount', () => {
    const r = { verdict: 'VERIFIED', checks: [], netFormatted: '5,000', providers: [] } as unknown as VerifyOutput
    expect(plainVerify(r).title).toBe('Yes. 5,000 real USDT reached your address.')
  })

  it('check token: fake is high risk, real is zero risk', () => {
    const base = { chain: 'bsc' as const, token: FAKE_TOKEN, name: 'Tether USD', symbol: 'USDT' }
    expect(plainToken({ ...base, ...judgeToken(true, null) }).risk).toBe(0)
    expect(plainToken({ ...base, verdict: 'FAKE USDT', summary: '', findings: [], nameFindings: [] }).tone).toBe('danger')
  })
})
